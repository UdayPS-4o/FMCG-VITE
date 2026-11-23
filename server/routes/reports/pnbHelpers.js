// Helpers for PNB statement reconciliation:
//  - fast, cached scan of CASH.DBF (bank txn numbers, max voucher numbers, history)
//  - statement CSV parsing
//  - narration parsing + party matching
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const Papa = require('papaparse');
const moment = require('moment');

const PNB_BANK_CODE = 'BB009';
const STORE_PATH = path.resolve(__dirname, '../../data/pnb-reconcile.json');

// ---------------------------------------------------------------------------
// CASH.DBF scan
// ---------------------------------------------------------------------------

function resolveCashDbfPath() {
    const base = process.env.DBF_FOLDER_PATH;
    if (!base) return null;
    for (const p of [path.join(base, 'data', 'CASH.DBF'), path.join(base, 'DATA', 'CASH.DBF'), path.join(base, 'CASH.DBF')]) {
        if (fsSync.existsSync(p)) return p;
    }
    return null;
}

let cashCache = null;

/**
 * Reads CASH.DBF directly in large blocks (read-only). Walks every physical
 * record by index, so deleted records can't cut the scan short.
 * Result is cached until the file's size/mtime changes.
 */
async function scanCashDbf({ force = false } = {}) {
    const dbfPath = resolveCashDbfPath();
    if (!dbfPath) throw new Error('CASH.DBF not found under DBF_FOLDER_PATH');
    const st = await fs.stat(dbfPath);
    const key = `${st.size}:${st.mtimeMs}`;
    if (!force && cashCache && cashCache.key === key) return cashCache;

    const started = Date.now();
    const fh = await fs.open(dbfPath, 'r');
    try {
        const header = Buffer.alloc(32);
        await fh.read(header, 0, 32, 0);
        const recordCount = header.readUInt32LE(4);
        const headerLength = header.readUInt16LE(8);
        const recordLength = header.readUInt16LE(10);

        const descBuf = Buffer.alloc(headerLength - 32);
        await fh.read(descBuf, 0, descBuf.length, 32);
        const fields = {};
        let pos = 1;
        for (let o = 0; o + 32 <= descBuf.length && descBuf[o] !== 0x0D; o += 32) {
            let name = '';
            for (let j = 0; j < 11 && descBuf[o + j] !== 0; j++) name += String.fromCharCode(descBuf[o + j]);
            const size = descBuf[o + 16];
            fields[name.trim()] = { start: pos, size };
            pos += size;
        }
        for (const f of ['VR', 'BANK', 'C_CODE']) {
            if (!fields[f]) throw new Error(`CASH.DBF has no ${f} field`);
        }
        const remarkSize = fields.REMARK ? fields.REMARK.size : 0;

        const bankSet = new Set();
        const maxVr = { BP: 0, BR: 0, CP: 0 };
        // history: key -> { code -> count } built from party-side lines of past bank entries
        const historyVotes = new Map();
        // every live line posted to the PNB account (for book balance / reconciliation)
        const bankLedger = [];
        const num = (base, f) => (f ? parseFloat(get(base, f)) || 0 : 0);

        const CHUNK = 4000;
        const buf = Buffer.alloc(CHUNK * recordLength);
        const get = (base, f) => buf.toString('latin1', base + f.start, base + f.start + f.size).trim();

        for (let i = 0; i < recordCount; i += CHUNK) {
            const n = Math.min(CHUNK, recordCount - i);
            const { bytesRead } = await fh.read(buf, 0, n * recordLength, headerLength + i * recordLength);
            const got = Math.floor(bytesRead / recordLength);
            for (let r = 0; r < got; r++) {
                const base = r * recordLength;
                if (buf[base] === 0x2A) continue; // deleted

                const vr = get(base, fields.VR);
                const m = /^(BP|BR|CP)-(\d+)$/.exec(vr);
                if (m) {
                    const num = parseInt(m[2], 10);
                    if (num > maxVr[m[1]]) maxVr[m[1]] = num;
                }

                const bank = get(base, fields.BANK).toUpperCase();
                const code = get(base, fields.C_CODE);
                if (code === PNB_BANK_CODE) {
                    bankLedger.push({
                        vr,
                        date: fields.DATE ? get(base, fields.DATE) : '', // YYYYMMDD
                        dr: num(base, fields.DR),
                        cr: num(base, fields.CR),
                        bank,
                        remark: fields.REMARK ? get(base, fields.REMARK) : '',
                    });
                }
                if (!bank) continue;
                bankSet.add(bank);

                if (!code || code === PNB_BANK_CODE || !fields.REMARK) continue;
                const remark = get(base, fields.REMARK);
                const truncated = remark.length >= remarkSize - 1;
                for (const k of historyKeys(parseNarration(remark), truncated)) {
                    let votes = historyVotes.get(k);
                    if (!votes) historyVotes.set(k, (votes = {}));
                    votes[code] = (votes[code] || 0) + 1;
                }
            }
            if (got < n) break; // file shorter than header claims
        }

        // keep only unambiguous history keys (>= 80% of votes for one party)
        const history = new Map();
        for (const [k, votes] of historyVotes) {
            const entries = Object.entries(votes).sort((a, b) => b[1] - a[1]);
            const total = entries.reduce((s, e) => s + e[1], 0);
            if (entries[0][1] / total >= 0.8) history.set(k, { code: entries[0][0], count: entries[0][1] });
        }

        cashCache = { key, path: dbfPath, bankSet, maxVr, history, bankLedger, recordCount, scannedAt: Date.now() };
        console.log(`[PNB] Scanned CASH.DBF: ${recordCount} records, ${bankSet.size} bank txns, ` +
            `${history.size} history keys, max BR=${maxVr.BR} BP=${maxVr.BP} CP=${maxVr.CP} in ${Date.now() - started}ms`);
        return cashCache;
    } finally {
        await fh.close();
    }
}

function invalidateCashCache() { cashCache = null; }

// ---------------------------------------------------------------------------
// Persistent store: learned narration -> party mappings, ignored txns
// ---------------------------------------------------------------------------

async function loadStore() {
    try {
        const s = JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
        return { partyMap: s.partyMap || {}, ignored: s.ignored || {} };
    } catch {
        return { partyMap: {}, ignored: {} };
    }
}

async function saveStore(store) {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    const tmp = STORE_PATH + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmp, STORE_PATH);
}

// ---------------------------------------------------------------------------
// Statement file
// ---------------------------------------------------------------------------

function toNumber(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/,/g, '').replace(/\s*(Dr|Cr)\.?$/i, ''));
    return isNaN(n) ? 0 : n;
}

function parseStatementCsv(content) {
    const lines = content.split(/\r?\n/);
    const meta = { accountNumber: '', accountName: '', periodFrom: '', periodTo: '' };
    const headerIndex = lines.findIndex(l => l.includes('Txn No.'));
    for (const line of lines.slice(0, headerIndex === -1 ? 30 : headerIndex)) {
        const acc = /Account Number\s*(\d+)/i.exec(line);
        if (acc) meta.accountNumber = acc[1];
        if (/Account Name/i.test(line)) {
            const cells = Papa.parse(line).data[0] || [];
            meta.accountName = (cells.slice(2).find(c => String(c).trim()) || '').trim();
        }
        if (/Statement Period/i.test(line)) {
            const dates = line.match(/\d{2}-\d{2}-\d{4}/g) || [];
            meta.periodFrom = dates[0] || '';
            meta.periodTo = dates[1] || '';
        }
    }
    if (headerIndex === -1) throw new Error("Statement file has no 'Txn No.' header");

    let body = lines.slice(headerIndex).join('\n');
    body = body.split('Unless constituent notifies the bank')[0];
    const parsed = Papa.parse(body, { header: true, skipEmptyLines: true, dynamicTyping: false });

    const rows = [];
    for (const row of parsed.data) {
        const txnNo = String(row['Txn No.'] || row['Txn No'] || '').trim();
        if (!txnNo) continue;
        rows.push({
            txnNo,
            date: String(row['Txn Date'] || row['Date'] || '').trim(),
            narration: String(row['Description'] || row['Narration'] || '').trim(),
            chequeNo: String(row['Cheque No.'] || '').trim(),
            drAmount: toNumber(row['Dr Amount']),
            crAmount: toNumber(row['Cr Amount']),
            balance: toNumber(row['Balance']),
            // PNB CC account: balance is "x Dr." (owed to bank). Cleaned files lose the suffix -> assume Dr.
            balanceSide: /Cr\.?\s*$/i.test(String(row['Balance'] || '')) ? 'Cr' : 'Dr',
        });
    }
    // PNB lists newest first, so the first row carries the latest balance
    meta.latestBalance = rows.length ? rows[0].balance : null;
    return { meta, rows };
}

// ---------------------------------------------------------------------------
// Narration parsing
// ---------------------------------------------------------------------------

/** 10-digit Indian mobile from a digit run (handles 91 / 0 prefixes). */
function toMobile(digits) {
    let d = String(digits || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : '';
}

function mobilesIn(text) {
    return [...new Set((String(text || '').match(/\d{10,12}/g) || []).map(toMobile).filter(Boolean))];
}

/**
 * Splits a PNB narration into channel / sender name / mobile / UPI id.
 *   NEFT_IN:<ref>//<ref>/<NAME>
 *   UPI/CR/<ref>/<NAME>/<BANK>/<vpa>/
 *   IMPS-IN/<ref>/<91mobile>/<NAME>
 *   NRTGS/<utr>/<acct>/<NAME>
 *   ACH/<NAME>/<ref>
 */
function parseNarration(raw) {
    const n = String(raw || '').trim();
    const u = n.toUpperCase();
    const parts = n.split('/').map(p => p.trim());
    const r = { channel: 'OTHER', name: '', mobiles: [], vpa: '', account: '', nameComplete: true };

    if (/^BY CASH|CASH DEP/.test(u)) {
        r.channel = 'CASH';
    } else if (u.startsWith('UPI/')) {
        r.channel = 'UPI';
        r.name = parts[3] || '';
        r.nameComplete = parts.length > 4;
        r.vpa = (parts[5] || '').toLowerCase();
        r.mobiles = r.vpa.includes('@') ? mobilesIn(r.vpa.split('@')[0]) : [];
    } else if (u.startsWith('IMPS')) {
        r.channel = 'IMPS';
        r.name = parts[3] || '';
        r.nameComplete = parts.length > 4;
        if (parts.length > 3) r.mobiles = [toMobile(parts[2])].filter(Boolean);
    } else if (u.startsWith('NEFT')) {
        r.channel = 'NEFT';
        r.name = parts[parts.length - 1] || '';
        r.mobiles = mobilesIn(r.name);
    } else if (/^N?RTGS/.test(u)) {
        r.channel = 'RTGS';
        r.name = parts[parts.length - 1] || '';
        r.account = parts.length > 3 ? parts[2].replace(/\D/g, '') : '';
    } else if (u.startsWith('ACH')) {
        r.channel = 'ACH';
        r.name = parts[1] || '';
        r.nameComplete = parts.length > 2;
    } else if (/CHQ|CHEQUE|\bCLG\b|CLEARING/.test(u)) {
        r.channel = 'CHEQUE';
        r.mobiles = mobilesIn(n);
    } else if (/CHARGE|CHGS|COMMISSION|SMS ALERT|\bGST\b/.test(u)) {
        r.channel = 'CHARGES';
    } else {
        r.mobiles = mobilesIn(n);
    }
    // a sender "name" that is only digits/refs is useless
    if (!/[A-Z]{2}/i.test(r.name)) r.name = '';
    return r;
}

const STOP_WORDS = new Set(['PROP', 'PROPRIETOR', 'PROPRITOR', 'PROPR', 'M', 'S', 'MS', 'MR', 'MRS', 'SHRI', 'SMT',
    'AND', 'THE', 'LTD', 'LIMITED', 'PVT', 'PRIVATE', 'CO', 'MESSRS', 'MESSERS']);

function nameTokens(name) {
    return String(name || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/)
        .filter(t => t && t.length > 1 && !STOP_WORDS.has(t));
}

function normName(name) { return nameTokens(name).join(' '); }

/** Keys used both for learned mappings and history lookups. */
function txnKeys(p) {
    const keys = [];
    if (p.vpa && p.vpa.includes('@')) keys.push(`VPA:${p.vpa}`);
    for (const m of p.mobiles) keys.push(`MOB:${m}`);
    if (p.account) keys.push(`ACC:${p.account}`);
    const nn = normName(p.name);
    if (nn) keys.push(`NAME:${p.channel}:${nn}`);
    return keys;
}

/** Keys derived from a (possibly 40-char-truncated) CASH.DBF remark. */
function historyKeys(p, truncated) {
    const keys = [];
    if (p.channel === 'UPI') {
        // vpa sits at the end and may be cut; name is complete only if more parts follow
        if (p.nameComplete && normName(p.name)) keys.push(`NAME:UPI:${normName(p.name)}`);
        if (!truncated && p.vpa.includes('@')) keys.push(`VPA:${p.vpa}`);
    } else if (p.channel === 'IMPS') {
        for (const m of p.mobiles) keys.push(`MOB:${m}`);
        if (!truncated && normName(p.name)) keys.push(`NAME:IMPS:${normName(p.name)}`);
    } else if (!truncated) {
        return txnKeys(p);
    }
    return keys;
}

// ---------------------------------------------------------------------------
// Party matching
// ---------------------------------------------------------------------------

// account groups that never receive/send bank money directly
const EXCLUDED_GROUPS = new Set(['GG', 'BS', 'AA']);

function buildPartyIndex(cmplData, bankDtlData) {
    const byCode = new Map();
    const phoneMap = new Map(); // mobile -> Set(codes)
    const nameIndex = [];
    for (const p of cmplData) {
        if (!p.C_CODE || p._deleted) continue;
        byCode.set(p.C_CODE, p);
        for (const field of ['C_MOBILE', 'C_PHONE', 'WA_MOB']) {
            for (const m of mobilesIn(p[field])) {
                if (!phoneMap.has(m)) phoneMap.set(m, new Set());
                phoneMap.get(m).add(p.C_CODE);
            }
        }
        if (!EXCLUDED_GROUPS.has(p.M_GROUP) && !/^V[GI]/.test(p.C_CODE)) {
            const tokens = nameTokens(p.C_NAME);
            if (tokens.length) nameIndex.push({ code: p.C_CODE, group: p.M_GROUP, tokens });
        }
    }
    const bankDtl = (bankDtlData || [])
        .filter(d => !d._deleted && d.C_CODE && String(d.NARETAION || '').trim().length >= 4)
        .map(d => ({ code: d.C_CODE, text: String(d.NARETAION).trim().toUpperCase().replace(/\s+/g, ' ') }));
    const bankCharges = cmplData.find(p => /^BANK CHARGES/i.test(String(p.C_NAME || '').trim()));
    return { byCode, phoneMap, nameIndex, bankDtl, bankChargesCode: bankCharges ? bankCharges.C_CODE : '' };
}

function tokenScore(a, b) {
    if (a === b) return 1;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (s.length >= 3 && l.startsWith(s)) return 0.85; // truncated by bank ("AGEN" -> "AGENCIES")
    return 0;
}

function nameSimilarity(senderTokens, partyTokens) {
    let sum = 0;
    const used = new Set();
    for (const st of senderTokens) {
        let best = 0, bestIdx = -1;
        partyTokens.forEach((pt, i) => {
            if (used.has(i)) return;
            const sc = tokenScore(st, pt);
            if (sc > best) { best = sc; bestIdx = i; }
        });
        if (bestIdx >= 0) used.add(bestIdx);
        sum += best;
    }
    const senderCov = sum / senderTokens.length;
    const partyCov = sum / partyTokens.length;
    return { score: 0.75 * senderCov + 0.25 * partyCov, senderCov };
}

/** Credit bills (last 120 days) indexed by rounded amount, for "amount = bill" hints. */
function buildBillIndex(billData) {
    const idx = new Map();
    const since = moment().subtract(120, 'days');
    for (const b of billData || []) {
        if (b._deleted || b.CASH === 'Y' || !b.C_CODE) continue;
        const amt = Number(b.N_B_AMT);
        if (!amt || !moment(b.DATE).isAfter(since)) continue;
        const k = Math.round(amt);
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push({ code: b.C_CODE, bill: String(b.BILL_BB || `${b.SERIES}-${b.BILL}`).trim(), amount: amt });
    }
    return idx;
}

/**
 * Returns { partyCode, matchReason, confidence (0-100), suggestions[] } for one statement row.
 */
function matchParty(txn, parsed, ctx) {
    const { partyIndex, store, history, billIndex } = ctx;
    const cands = new Map(); // code -> { score, reasons:Set }
    const add = (code, score, reason) => {
        if (!code || !partyIndex.byCode.has(code)) return;
        const c = cands.get(code) || { score: 0, reasons: [] };
        // agreement between independent signals raises confidence a little
        c.score = c.score ? Math.min(1, Math.max(c.score, score) + 0.04) : score;
        if (!c.reasons.includes(reason)) c.reasons.push(reason);
        cands.set(code, c);
    };

    const keys = txnKeys(parsed);

    // 1. confirmed by a user on this page earlier
    for (const k of keys) if (store.partyMap[k]) add(store.partyMap[k].code, 1, 'Learned');

    // 2. same sender in past CASH.DBF bank entries
    for (const k of keys) {
        const h = history.get(k);
        if (h) add(h.code, h.count >= 2 ? 0.94 : 0.9, 'Past entry');
    }

    // 3. mobile number in narration -> party master (only if the number belongs to one party)
    for (const m of parsed.mobiles) {
        const codes = partyIndex.phoneMap.get(m);
        if (codes && codes.size === 1) add([...codes][0], 0.9, 'Mobile');
    }

    // 4. BANKDTL narration snippets
    const upper = txn.narration.toUpperCase().replace(/\s+/g, ' ');
    for (const d of partyIndex.bankDtl) {
        if (upper.includes(d.text)) add(d.code, d.text.length >= 8 ? 0.88 : 0.7, 'Bank DTL');
    }

    // 5. rules
    if (parsed.channel === 'CHARGES' && txn.drAmount > 0) add(partyIndex.bankChargesCode, 0.8, 'Bank charges');

    // 6. sender name vs party names
    const senderTokens = nameTokens(parsed.name);
    if (senderTokens.length) {
        const isCredit = txn.crAmount > 0;
        const scored = [];
        for (const p of partyIndex.nameIndex) {
            const { score, senderCov } = nameSimilarity(senderTokens, p.tokens);
            if (senderCov < 0.75 || score < 0.55) continue;
            let s = score * 0.88; // a name alone is never certain
            if ((isCredit && p.group === 'DT') || (!isCredit && p.group === 'CT')) s += 0.04;
            scored.push({ code: p.code, s });
        }
        scored.sort((a, b) => b.s - a.s).slice(0, 5).forEach(x => add(x.code, Math.min(x.s, 0.9), 'Name'));
    }

    // 7. amount equals a recent credit bill
    const amount = txn.crAmount || txn.drAmount;
    const bills = txn.crAmount > 0 ? (billIndex.get(Math.round(amount)) || []).filter(b => Math.abs(b.amount - amount) < 1) : [];
    const billCodes = [...new Set(bills.map(b => b.code))];
    for (const code of billCodes) {
        if (cands.has(code)) add(code, cands.get(code).score + 0.08, `Bill ${bills.find(b => b.code === code).bill}`);
        else if (billCodes.length === 1) add(code, 0.5, `Bill ${bills[0].bill}`);
    }

    const ranked = [...cands.entries()].map(([code, c]) => ({
        code,
        name: partyIndex.byCode.get(code).C_NAME,
        score: Math.round(c.score * 100),
        reason: c.reasons.join(' + '),
    })).sort((a, b) => b.score - a.score);

    const top = ranked[0];
    // don't auto-pick when two different parties are nearly tied on a weak signal
    const ambiguous = top && ranked[1] && top.score < 90 && top.score - ranked[1].score < 5;
    const pick = top && top.score >= 60 && !ambiguous ? top : null;

    return {
        partyCode: pick ? pick.code : '',
        partyName: pick ? pick.name : '',
        matchReason: pick ? pick.reason : '',
        confidence: pick ? pick.score : 0,
        suggestions: ranked.slice(0, 4),
    };
}

// ---------------------------------------------------------------------------
// Book balance vs bank balance
// ---------------------------------------------------------------------------
// Everything is expressed as "owed to bank" (Dr balance on the PNB CC account):
//   bank row effect  = dr - cr
//   book line effect = CR - DR   (BB009 lines: receipts are DR, payments CR, opening in CR)

const r2 = n => Math.round(n * 100) / 100;
const ymd = d => moment(d, 'DD-MM-YYYY').format('YYYYMMDD');
const fmtYmd = d => (d && d.length === 8 ? `${d.slice(6, 8)}-${d.slice(4, 6)}-${d.slice(0, 4)}` : d);

function computeBalanceRecon(bankLedger, meta, rows) {
    if (!rows.length) return null;
    const owed = r => (r.balanceSide === 'Cr' ? -r.balance : r.balance);

    // statement order: PNB lists newest first; detect and normalise to newest-first
    let list = rows;
    if (rows.length > 1) {
        const [a, b] = rows;
        const newestFirst = Math.abs(owed(a) - (owed(b) + a.drAmount - a.crAmount)) < 0.01;
        if (!newestFirst) list = [...rows].reverse();
    }
    const newest = list[0];
    const oldest = list[list.length - 1];
    const bankClosing = owed(newest);
    const bankOpening = owed(oldest) - (oldest.drAmount - oldest.crAmount);

    const fromYmd = meta.periodFrom ? ymd(meta.periodFrom) : ymd(oldest.date);
    const toYmd = meta.periodTo ? ymd(meta.periodTo) : ymd(newest.date);

    let booksClosing = 0, booksOpening = 0;
    const booksInWindow = []; // lines dated on/after the statement start
    for (const l of bankLedger) {
        const eff = l.cr - l.dr;
        booksClosing += eff;
        if (l.date && l.date < fromYmd) booksOpening += eff;
        else booksInWindow.push(l);
    }

    // group book lines by bank txn no.
    const booksByTxn = new Map();
    const booksNoTxn = [];
    for (const l of booksInWindow) {
        if (!l.bank) { booksNoTxn.push(l); continue; }
        if (!booksByTxn.has(l.bank)) booksByTxn.set(l.bank, []);
        booksByTxn.get(l.bank).push(l);
    }
    const earlierTxn = new Map(); // txn posted in books before the statement window
    for (const l of bankLedger) if (l.bank && l.date && l.date < fromYmd) earlierTxn.set(l.bank, l.date);

    const notInBooks = [];
    const mismatched = [];
    for (const r of list) {
        const bankEff = r.drAmount - r.crAmount;
        const lines = booksByTxn.get(r.txnNo.toUpperCase());
        if (!lines) {
            notInBooks.push({
                txnNo: r.txnNo, date: r.date, narration: r.narration, amount: r.crAmount || r.drAmount,
                side: r.crAmount ? 'Cr' : 'Dr', impact: r2(-bankEff),
                note: earlierTxn.has(r.txnNo.toUpperCase()) ? `posted in books on ${fmtYmd(earlierTxn.get(r.txnNo.toUpperCase()))}` : '',
            });
            continue;
        }
        booksByTxn.delete(r.txnNo.toUpperCase());
        const bookEff = lines.reduce((s, l) => s + l.cr - l.dr, 0);
        if (Math.abs(bookEff - bankEff) >= 0.01) {
            mismatched.push({
                txnNo: r.txnNo, date: r.date, narration: r.narration, vr: lines.map(l => l.vr).join(', '),
                bankAmount: r2(Math.abs(bankEff)), booksAmount: r2(Math.abs(bookEff)), impact: r2(bookEff - bankEff),
            });
        }
    }
    const notInBank = [...[...booksByTxn.values()].flat(), ...booksNoTxn].map(l => ({
        vr: l.vr, date: fmtYmd(l.date), txnNo: l.bank, narration: l.remark,
        amount: r2(Math.abs(l.cr - l.dr)), side: l.dr ? 'Cr' : 'Dr', impact: r2(l.cr - l.dr),
        note: l.date > toYmd ? 'after statement period' : (!l.bank ? 'no bank txn no.' : ''),
    })).sort((a, b) => (a.date < b.date ? -1 : 1));

    const sum = arr => r2(arr.reduce((s, x) => s + x.impact, 0));
    const carriedForward = r2(booksOpening - bankOpening);
    const difference = r2(booksClosing - bankClosing);
    const explained = r2(carriedForward + sum(notInBooks) + sum(notInBank) + sum(mismatched));

    return {
        bankClosing: r2(bankClosing),
        bankAsOf: newest.date,
        booksClosing: r2(booksClosing),
        difference,                                  // books - bank (owed basis)
        periodFrom: fmtYmd(fromYmd),
        periodTo: fmtYmd(toYmd),
        bankOpening: r2(bankOpening),
        booksOpening: r2(booksOpening),
        carriedForward,                              // difference that already existed before periodFrom
        notInBooks, notInBooksTotal: sum(notInBooks),
        notInBank, notInBankTotal: sum(notInBank),
        mismatched, mismatchedTotal: sum(mismatched),
        unexplained: r2(difference - explained),     // should be 0; non-zero means a statement balance jump
    };
}

/**
 * Books vs bank at the end of every day we have a statement for.
 * Returns the days where the difference changed (plus first/last), oldest first.
 */
function dailyBalanceHistory(bankLedger, dayEnds) {
    const days = [...dayEnds.keys()].sort();
    if (!days.length) return { firstDate: null, lastDate: null, changes: [] };
    const lines = bankLedger.filter(l => l.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const undated = bankLedger.filter(l => !l.date).reduce((s, l) => s + l.cr - l.dr, 0);
    let i = 0, books = undated;
    const all = [];
    for (const d of days) {
        while (i < lines.length && lines[i].date <= d) { books += lines[i].cr - lines[i].dr; i++; }
        all.push({ date: fmtYmd(d), bank: r2(dayEnds.get(d)), books: r2(books), difference: r2(books - dayEnds.get(d)) });
    }
    const changes = all.filter((x, k) => k === 0 || k === all.length - 1 || x.difference !== all[k - 1].difference);
    return { firstDate: all[0].date, lastDate: all[all.length - 1].date, days: all.length, changes };
}

function voucherTypeFor(txn) {
    if (txn.crAmount > 0) return /BY CASH/i.test(txn.narration) ? 'CP' : 'BR';
    if (txn.drAmount > 0) return 'BP';
    return '';
}

module.exports = {
    PNB_BANK_CODE,
    resolveCashDbfPath,
    scanCashDbf,
    invalidateCashCache,
    loadStore,
    saveStore,
    parseStatementCsv,
    parseNarration,
    txnKeys,
    buildPartyIndex,
    buildBillIndex,
    matchParty,
    voucherTypeFor,
    computeBalanceRecon,
    dailyBalanceHistory,
    toMobile,
};
