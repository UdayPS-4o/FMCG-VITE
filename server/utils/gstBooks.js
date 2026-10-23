// Adding GSTR-2A invoices that are missing in the books:
//   - expense journal drafts (JB vouchers) reviewed on the GSTR-2A page, then posted to CASH.DBF
//   - creating a creditor (Sundry Creditors, CT…) in CMPL.DBF for a supplier GSTIN that is not in the party master
// The voucher layout copies the expense journals already in CASH (e.g. JB-000138 / JB-000185):
//   creditor Cr total (with AC_GST), expense Dr taxable, VG… (CGST+SGST) or VI… (IGST) Dr tax, EE001 round off.
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { DbfORM } = require('../dbf-orm');
const { readJsonStable, purchaseDocsAround, normInv, num, str, r2 } = require('./gstReturnData');
const { dataDir } = require('./gstPortalClient');

const STORE = path.join(__dirname, '..', 'db', 'gst-books.json');
const GSTIN_RE = /^\d{2}[A-Z0-9]{13}$/;
const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const STATE_NAMES = {
  '01': 'JAMMU & KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH', '05': 'UTTARAKHAND', '06': 'HARYANA', '07': 'DELHI',
  '08': 'RAJASTHAN', '09': 'UTTAR PRADESH', '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH', '13': 'NAGALAND', '14': 'MANIPUR',
  '15': 'MIZORAM', '16': 'TRIPURA', '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL', '20': 'JHARKHAND', '21': 'ODISHA',
  '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT', '26': 'DADRA & NAGAR HAVELI AND DAMAN & DIU', '27': 'MAHARASHTRA',
  '29': 'KARNATAKA', '30': 'GOA', '31': 'LAKSHADWEEP', '32': 'KERALA', '33': 'TAMIL NADU', '34': 'PUDUCHERRY', '35': 'ANDAMAN & NICOBAR',
  '36': 'TELANGANA', '37': 'ANDHRA PRADESH', '38': 'LADAKH', '97': 'OTHER TERRITORY',
};

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });
const dbfDir = () => path.join(process.env.DBF_FOLDER_PATH || '', 'data');

// ---------------------------------------------------------------- store
async function readStore() {
  try {
    const j = JSON.parse(await fs.readFile(STORE, 'utf8'));
    return { journals: Array.isArray(j.journals) ? j.journals : [], parties: Array.isArray(j.parties) ? j.parties : [] };
  } catch {
    return { journals: [], parties: [] };
  }
}
async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  const tmp = `${STORE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2));
  await fs.rename(tmp, STORE);
}
// serialise read-modify-write of the store and DBF posting
let chain = Promise.resolve();
const exclusive = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
};

// ---------------------------------------------------------------- masters (CMPL.json)
let masterCache = { mtime: 0, data: null };
async function loadMasters() {
  const file = path.join(dbfDir(), 'json', 'CMPL.json');
  const stat = await fs.stat(file);
  if (!masterCache.data || masterCache.mtime !== stat.mtimeMs) {
    let rows;
    try {
      ({ data: rows } = await readJsonStable(file, { retries: 3, waitMs: 1000 }));
    } catch (e) {
      if (masterCache.data) return withLocalParties(masterCache.data);
      throw e;
    }
    const parties = {};
    const expense = [];
    const tax = [];
    const codes = new Set();
    const accounts = {};
    for (const r of rows) {
      if (r._deleted) continue;
      const code = str(r.C_CODE).trim();
      if (!code) continue;
      codes.add(code);
      const name = str(r.C_NAME).trim();
      const ownGstin = [r.GSTNO, r.C_GST, r.C_CST].map((g) => str(g).trim().toUpperCase()).find((g) => GSTIN_RE.test(g)) || '';
      accounts[code] = { code, name, group: str(r.M_GROUP).trim(), groupName: str(r.M_NAME).trim(), place: str(r.C_PLACE).trim(), add1: str(r.C_ADD1).trim(), gstin: ownGstin };
      for (const g of [r.GSTNO, r.C_GST, r.C_CST]) {
        const gstin = str(g).trim().toUpperCase();
        if (!GSTIN_RE.test(gstin)) continue;
        const cur = parties[gstin];
        // prefer creditor accounts (CT) for purchases
        if (!cur || (!cur.code.startsWith('CT') && code.startsWith('CT'))) {
          parties[gstin] = { code, name, add1: str(r.C_ADD1).trim(), place: str(r.C_PLACE).trim(), state: gstin.slice(0, 2), group: str(r.M_GROUP).trim() };
        }
      }
      if (code.startsWith('EE')) expense.push({ code, name });
      if (/^V[GIC]/.test(code)) tax.push({ code, name, rate: num(r.GST_TAX), kind: code.slice(0, 2) });
    }
    expense.sort((a, b) => a.name.localeCompare(b.name));
    tax.sort((a, b) => a.code.localeCompare(b.code));
    masterCache = { mtime: stat.mtimeMs, data: { parties, expense, tax, codes, accounts } };
  }
  return withLocalParties(masterCache.data);
}
// parties created from this page appear before the next CMPL.json export
async function withLocalParties(m) {
  const store = await readStore();
  const parties = { ...m.parties };
  const codes = new Set(m.codes);
  const accounts = { ...m.accounts };
  for (const p of store.parties) {
    codes.add(p.code);
    if (!accounts[p.code]) accounts[p.code] = { code: p.code, name: p.name, group: 'CT', groupName: 'Sundry Creditors', place: p.place || '', add1: p.add1 || '', gstin: p.gstin };
    if (!parties[p.gstin]) parties[p.gstin] = { code: p.code, name: p.name, add1: p.add1 || '', place: p.place || '', state: p.gstin.slice(0, 2), group: 'CT' };
  }
  return { ...m, parties, codes, accounts };
}

// supplier trade names from downloaded GSTR-2B files (GSTR2B/<MMYYYY>/gstr2b.json)
let tradeCache = { key: '', names: {} };
async function tradeNames() {
  const root = path.join(dataDir(), 'GSTR2B');
  let dirs = [];
  try { dirs = await fs.readdir(root); } catch { return {}; }
  const files = [];
  for (const d of dirs) {
    const f = path.join(root, d, 'gstr2b.json');
    try { files.push([f, (await fs.stat(f)).mtimeMs]); } catch { /* none */ }
  }
  const key = files.map(([f, m]) => `${f}:${m}`).join('|');
  if (key === tradeCache.key) return tradeCache.names;
  const names = {};
  for (const [f] of files) {
    try {
      const text = await fs.readFile(f, 'utf8');
      const re = /"ctin"\s*:\s*"([0-9A-Z]{15})"[^{}]*?"trdnm"\s*:\s*"([^"]*)"|"trdnm"\s*:\s*"([^"]*)"[^{}]*?"ctin"\s*:\s*"([0-9A-Z]{15})"/g;
      let m;
      while ((m = re.exec(text))) {
        const g = m[1] || m[4];
        const n = m[2] || m[3];
        if (g && n && !names[g]) names[g] = n;
      }
    } catch { /* skip unreadable file */ }
  }
  tradeCache = { key, names };
  return names;
}

// last expense / tax accounts used in journals for each supplier GSTIN
async function suggestions(fp) {
  const docs = await purchaseDocsAround(fp);
  const out = {};
  for (const d of docs.filter((x) => x.type === 'JB').sort((a, b) => (a.period.slice(2) + a.period.slice(0, 2)).localeCompare(b.period.slice(2) + b.period.slice(0, 2)))) {
    out[d.gstin] = { expenseCode: d.expenseCode, taxCode: d.taxCode, partyCode: d.partyCode };
  }
  return out;
}

// ---------------------------------------------------------------- journal drafts
const toDate = (dmy) => {
  const m = DATE_RE.exec(String(dmy || ''));
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
};

const isTaxCode = (code) => /^V[GIC]/.test(code);

// legacy drafts (party + expense + taxLines) -> debit / credit lines
function linesOf(j) {
  if (Array.isArray(j.lines) && j.lines.length) return j.lines;
  const out = [{ side: 'CR', code: j.supplier.code, amount: j.total, party: true }];
  out.push({ side: 'DR', code: j.expenseCode, amount: j.taxable });
  for (const l of j.taxLines || []) {
    const amt = r2(num(l.igst) + num(l.cgst) + num(l.sgst));
    if (amt > 0) out.push({ side: 'DR', code: l.taxCode, amount: amt, rate: l.rate });
    if (num(l.cess) > 0) out.push({ side: 'DR', code: l.cessCode, amount: r2(num(l.cess)), rate: l.rate });
  }
  const diff = r2(j.total - out.filter((x) => x.side === 'DR').reduce((a, x) => a + x.amount, 0));
  if (Math.abs(diff) >= 0.01) out.push({ side: diff > 0 ? 'DR' : 'CR', code: 'EE001', amount: Math.abs(diff) });
  return out;
}

// A journal is a list of debit and credit lines on any accounts; total debit must equal total credit.
// One credit line is the supplier ("party") line - it carries the invoice GSTIN (AC_GST) for GSTR-2A / 2B matching.
function validateEntry(e, masters, ownState) {
  const errs = [];
  const gstin = str(e.supplier && e.supplier.gstin).trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) errs.push('supplier GSTIN is invalid');
  const invNo = str(e.invoice && e.invoice.number).trim();
  if (!invNo) errs.push('invoice number is required');
  if (!toDate(e.invoice && e.invoice.date)) errs.push('invoice date must be dd-mm-yyyy');
  if (!toDate(e.entryDate)) errs.push('entry date must be dd-mm-yyyy');
  const intra = gstin.slice(0, 2) === ownState;

  const lines = (Array.isArray(e.lines) ? e.lines : []).map((l) => ({
    side: str(l.side).toUpperCase() === 'CR' ? 'CR' : 'DR',
    code: str(l.code).trim(),
    amount: r2(num(l.amount)),
    rate: num(l.rate),
    party: !!l.party,
  }));
  const dr = lines.filter((l) => l.side === 'DR');
  const cr = lines.filter((l) => l.side === 'CR');
  if (!dr.length || !cr.length) errs.push('a journal needs at least one debit and one credit row');
  lines.forEach((l, i) => {
    const row = `${l.side === 'DR' ? 'debit' : 'credit'} row ${i + 1}`;
    if (!l.code) errs.push(`${row}: choose an account`);
    else if (!masters.codes.has(l.code)) errs.push(`${row}: account ${l.code} does not exist`);
    if (!(l.amount > 0)) errs.push(`${row}: amount must be more than 0`);
    if (l.side === 'DR' && /^V[GI]/.test(l.code) && l.code.slice(0, 2) !== (intra ? 'VG' : 'VI')) {
      errs.push(`${l.code}: use ${intra ? 'an SGST/CGST (VG…)' : 'an IGST (VI…)'} account for ${intra ? 'a same-state' : 'an other-state'} supplier`);
    }
  });
  const both = dr.map((l) => l.code).filter((c) => c && cr.some((x) => x.code === c));
  if (both.length) errs.push(`account ${both[0]} is on both sides`);
  const sumDr = r2(dr.reduce((a, l) => a + l.amount, 0));
  const sumCr = r2(cr.reduce((a, l) => a + l.amount, 0));
  if (Math.abs(sumDr - sumCr) >= 0.005) errs.push(`debit ₹${sumDr.toFixed(2)} and credit ₹${sumCr.toFixed(2)} are not equal (difference ₹${Math.abs(sumDr - sumCr).toFixed(2)})`);

  // the party line: the flagged credit line, else the credit line whose account owns the GSTIN, else the first credit line
  let partyIdx = lines.findIndex((l) => l.side === 'CR' && l.party);
  if (partyIdx < 0) partyIdx = lines.findIndex((l) => l.side === 'CR' && masters.parties[gstin] && l.code === masters.parties[gstin].code);
  if (partyIdx < 0) partyIdx = lines.findIndex((l) => l.side === 'CR');
  lines.forEach((l, i) => { l.party = i === partyIdx; });
  // GST rate on tax lines (GST_TAX) comes from the tax account when not given
  for (const l of lines) if (isTaxCode(l.code) && !l.rate) l.rate = num((masters.tax.find((t) => t.code === l.code) || {}).rate);
  if (errs.length) throw badRequest(`${invNo || 'entry'}: ${errs.join('; ')}`);

  const partyLine = lines[partyIdx];
  const acc = masters.accounts[partyLine.code] || {};
  const taxNet = r2(lines.filter((l) => isTaxCode(l.code)).reduce((a, l) => a + (l.side === 'DR' ? l.amount : -l.amount), 0));
  const taxable = r2(dr.filter((l) => !isTaxCode(l.code) && l.code !== 'EE001').reduce((a, l) => a + l.amount, 0));
  const firstExpense = dr.find((l) => !isTaxCode(l.code) && l.code !== 'EE001');
  return {
    supplier: { code: partyLine.code, gstin, name: acc.name || '', place: acc.place || '', add1: acc.add1 || '', group: acc.group || 'CT' },
    invoice: { number: invNo, date: e.invoice.date },
    entryDate: e.entryDate,
    narration: str(e.narration).trim(),
    lines,
    expenseCode: firstExpense ? firstExpense.code : '',
    taxable,
    tax: taxNet,
    total: sumCr,
    gstr2aMonth: str(e.gstr2aMonth),
  };
}

async function createJournals(entries, user, ownState) {
  if (!Array.isArray(entries) || !entries.length) throw badRequest('No entries to save.');
  const masters = await loadMasters();
  const valid = entries.map((e) => validateEntry(e, masters, ownState));
  return exclusive(async () => {
    const store = await readStore();
    // duplicates: already a draft / posted here, or already in the books
    const books = await purchaseDocsAround(valid[0].gstr2aMonth && /^\d{6}$/.test(valid[0].gstr2aMonth) ? valid[0].gstr2aMonth : invoicePeriod(valid[0].invoice.date));
    for (const v of valid) {
      const k = normInv(v.invoice.number);
      const inStore = store.journals.find((j) => j.supplier.gstin === v.supplier.gstin && normInv(j.invoice.number) === k);
      if (inStore) throw badRequest(`${v.invoice.number}: already ${inStore.status === 'posted' ? `posted as ${inStore.vr}` : 'saved as a draft'}.`);
      const inBooks = books.find((d) => d.gstin === v.supplier.gstin && d.billNorm === k);
      if (inBooks) throw badRequest(`${v.invoice.number}: already in the books as ${inBooks.vr} (${inBooks.entryDate}).`);
    }
    const now = new Date().toISOString();
    const created = valid.map((v) => ({ id: crypto.randomUUID(), status: 'draft', createdAt: now, createdBy: user || '', ...v }));
    store.journals.push(...created);
    await writeStore(store);
    return created;
  });
}
const invoicePeriod = (dmy) => {
  const m = DATE_RE.exec(String(dmy || ''));
  return m ? `${m[2]}${m[3]}` : '';
};

async function deleteJournal(id) {
  return exclusive(async () => {
    const store = await readStore();
    const j = store.journals.find((x) => x.id === id);
    if (!j) throw Object.assign(new Error('Entry not found.'), { status: 404 });
    if (j.status === 'posted') throw badRequest(`Already posted as ${j.vr} - cancel it in the accounts software instead.`);
    store.journals = store.journals.filter((x) => x.id !== id);
    await writeStore(store);
  });
}

async function updateJournal(id, changes, ownState) {
  const masters = await loadMasters();
  return exclusive(async () => {
    const store = await readStore();
    const j = store.journals.find((x) => x.id === id);
    if (!j) throw Object.assign(new Error('Entry not found.'), { status: 404 });
    if (j.status === 'posted') throw badRequest(`Already posted as ${j.vr} - change it in the accounts software instead.`);
    const merged = {
      gstr2aMonth: j.gstr2aMonth,
      supplier: { gstin: j.supplier.gstin },
      invoice: j.invoice,
      entryDate: changes.entryDate !== undefined ? changes.entryDate : j.entryDate,
      narration: changes.narration !== undefined ? changes.narration : j.narration,
      lines: Array.isArray(changes.lines) ? changes.lines : linesOf(j),
    };
    const v = validateEntry(merged, masters, ownState);
    delete j.taxLines;
    Object.assign(j, v, { updatedAt: new Date().toISOString() });
    await writeStore(store);
    return j;
  });
}

// CASH line helpers (field layout of the journals already in CASH.DBF)
const dotDate = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
const dummy = (code, d, amt) => `${code}-${dotDate(d)}JB${amt.toFixed(2).padStart(10)}`;

function journalLines(j, vr, masters, ownState) {
  const date = toDate(j.entryDate);
  const supState = j.supplier.gstin.slice(0, 2);
  const remark = `INV#${j.invoice.number} ${j.narration || j.supplier.name}`.slice(0, 40);
  const base = {
    DATE: date, VR: vr, BOOK: 'JB', E_TYPE: 'G', REMARK: remark, ST_CODE: ownState, ST_NAME: STATE_NAMES[ownState] || '',
    PST9: supState, MST9: ownState, B_IGST: 'Y',
  };
  return linesOf(j).map((l) => {
    const acc = masters.accounts[l.code] || {};
    const amount = r2(num(l.amount));
    const row = {
      ...base,
      M_GROUP1: acc.group || (isTaxCode(l.code) ? 'GG' : ''),
      C_CODE: l.code,
      DR: l.side === 'DR' ? amount : 0,
      CR: l.side === 'CR' ? amount : 0,
      AC_NAME: (acc.name || '').slice(0, 40),
      CODE_ORG: l.code,
      DUMMY: dummy(l.code, date, amount),
    };
    if (isTaxCode(l.code)) row.GST_TAX = num(l.rate);
    if (l.party) {
      // supplier line, as in the journals entered in the accounts software
      Object.assign(row, {
        AC_GST: j.supplier.gstin, AC_PLACE: acc.place || '', ST_CODE: supState, ST_NAME: STATE_NAMES[supState] || '',
        C_ADD1: acc.add1 || '', C_PLACE: acc.place || '',
      });
    }
    return row;
  });
}

async function postJournals(ids, ownState) {
  if (!Array.isArray(ids) || !ids.length) throw badRequest('Select the drafts to post.');
  const masters = await loadMasters();
  return exclusive(async () => {
    const store = await readStore();
    const todo = store.journals.filter((j) => ids.includes(j.id) && j.status === 'draft');
    if (!todo.length) throw badRequest('None of the selected entries is a draft.');
    for (const j of todo) {
      const lines = linesOf(j);
      const missing = lines.find((l) => !masters.codes.has(l.code));
      if (missing) throw badRequest(`${j.invoice.number}: account ${missing.code} not found in the party master.`);
      const dr = r2(lines.filter((l) => l.side === 'DR').reduce((a, l) => a + num(l.amount), 0));
      const crs = r2(lines.filter((l) => l.side === 'CR').reduce((a, l) => a + num(l.amount), 0));
      if (Math.abs(dr - crs) >= 0.005) throw badRequest(`${j.invoice.number}: debit ${dr} and credit ${crs} are not equal - edit the draft.`);
    }
    const cash = new DbfORM(path.join(dbfDir(), 'CASH.DBF'));
    try {
      await cash.open();
      const existing = await cash.findAll();
      let maxJb = 0;
      const booked = new Set();
      for (const r of existing) {
        const vr = str(r.VR);
        if (vr.startsWith('JB-')) { const n = parseInt(vr.slice(3), 10); if (n > maxJb) maxJb = n; }
        // guard against posting an invoice twice (narration INV#<no> + creditor GSTIN)
        const m = /INV#\s*([A-Z0-9/-]+)/i.exec(str(r.REMARK));
        if (m && str(r.AC_GST).trim()) booked.add(`${normInv(m[1])}_${str(r.AC_GST).trim().toUpperCase()}`);
      }
      const toInsert = [];
      const posted = [];
      for (const j of todo) {
        if (booked.has(`${normInv(j.invoice.number)}_${j.supplier.gstin}`)) throw badRequest(`${j.invoice.number}: already in CASH.DBF - not posted again.`);
        maxJb += 1;
        const vr = `JB-${String(maxJb).padStart(6, '0')}`;
        toInsert.push(...journalLines(j, vr, masters, ownState));
        posted.push([j, vr]);
      }
      await cash.insertMany(toInsert);
      const now = new Date().toISOString();
      for (const [j, vr] of posted) { j.status = 'posted'; j.vr = vr; j.postedAt = now; }
      await writeStore(store);
      return posted.map(([j, vr]) => ({ id: j.id, vr, invoice: j.invoice.number }));
    } finally {
      cash.close();
    }
  });
}

// posted journals as purchase documents, so matching sees them before CASH.json is re-exported
async function postedAsDocs() {
  const store = await readStore();
  return store.journals.filter((j) => j.status === 'posted').map((j) => {
    const lines = linesOf(j);
    const taxLine = lines.find((l) => l.side === 'DR' && isTaxCode(l.code));
    return {
      vr: j.vr, type: 'JB', bill: j.invoice.number, billNorm: normInv(j.invoice.number), gstin: j.supplier.gstin, party: j.supplier.name,
      date: j.invoice.date, period: invoicePeriod(j.invoice.date), entryDate: j.entryDate, taxable: j.taxable, gst: j.tax, value: j.total,
      partyCode: j.supplier.code, expenseCode: j.expenseCode || '', taxCode: taxLine ? taxLine.code : '',
    };
  });
}

// ---------------------------------------------------------------- creditor creation (CMPL.DBF)
async function createParty(input) {
  const gstin = str(input.gstin).trim().toUpperCase();
  const name = str(input.name).trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) throw badRequest('GSTIN is invalid.');
  if (!name) throw badRequest('Party name is required.');
  const masters = await loadMasters();
  if (masters.parties[gstin]) throw badRequest(`GSTIN already belongs to ${masters.parties[gstin].code} ${masters.parties[gstin].name}.`);
  return exclusive(async () => {
    const cmpl = new DbfORM(path.join(dbfDir(), 'CMPL.DBF'));
    try {
      await cmpl.open();
      const rows = await cmpl.findAll();
      let max = 0;
      for (const r of rows) {
        const c = str(r.C_CODE).trim();
        if (/^CT\d+$/.test(c)) max = Math.max(max, parseInt(c.slice(2), 10));
        for (const g of [r.GSTNO, r.C_GST, r.C_CST]) if (str(g).trim().toUpperCase() === gstin) throw badRequest(`GSTIN already belongs to ${c}.`);
      }
      const store = await readStore();
      for (const p of store.parties) if (/^CT\d+$/.test(p.code)) max = Math.max(max, parseInt(p.code.slice(2), 10));
      const code = `CT${String(max + 1).padStart(3, '0')}`;
      const st = gstin.slice(0, 2);
      await cmpl.insert({
        M_GROUP: 'CT', M_NAME: 'Sundry Creditors', C_CODE: code, C_NAME: name.slice(0, 40),
        C_ADD1: str(input.add1).trim().toUpperCase(), C_ADD2: str(input.add2).trim().toUpperCase(), C_PLACE: str(input.place).trim().toUpperCase(),
        C_PIN: str(input.pin).trim(), C_MOBILE: str(input.mobile).trim(), C_PAN_NO: gstin.slice(2, 12),
        C_CST: gstin, C_GST: gstin, GSTNO: gstin, C_STATE: st, ST_NAME: STATE_NAMES[st] || '', CR: 0, DR: 0, CB_VAL: 0, NET_PROFIT: 0,
      });
      store.parties.push({ code, gstin, name, add1: str(input.add1).trim().toUpperCase(), place: str(input.place).trim().toUpperCase(), createdAt: new Date().toISOString() });
      await writeStore(store);
      return { code, name, gstin };
    } finally {
      cmpl.close();
    }
  });
}

module.exports = { linesOf, updateJournal, loadMasters, tradeNames, suggestions, readStore, createJournals, deleteJournal, postJournals, postedAsDocs, createParty, journalLines };
