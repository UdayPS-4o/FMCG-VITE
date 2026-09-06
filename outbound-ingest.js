'use strict';

/**
 * outbound-ingest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Makes EVERY outbound WhatsApp message visible in the inbox — including the
 * ones nobody ever replied to — no matter which process actually sent them.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A thread only appears in the left panel if webhook-logs/<day>.jsonl contains
 * an event for that phone number. Inbound messages always land there (CXBot
 * posts them to /webhook). Outbound messages did not, because they leave the
 * building through four different doors and only one of them was writing a log:
 *
 *   1. webapp inbox reply      → whatsapp.js  POST /send        ✅ logged
 *   2. fmcg-api bot replies    → CxBotClient  [WA_OUTGOING]     ✗ console only
 *   3. cash receipts / invoice → webserver calls the AOC API    ✗ nothing
 *      sync inside the webapp    directly and only prints the
 *                                response to its pm2 log
 *   4. FMCG MUX (the DOS/Clipper accounting software) calls the AOC API on its
 *      own and writes SENDWHAT_<TEMPLATE>_LOG.TXT                ✗ unreliable
 *
 * Door 4 was watched by the old inline block in whatsapp.js, but it:
 *   · built the folder with path.join('C:', 'Users', …) which produces the
 *     DRIVE-RELATIVE path "C:Users\…" — it only resolved correctly when pm2
 *     happened to have its cwd on C:\,
 *   · used fs.watch() on the file handle, which stops firing for good the
 *     moment the file is replaced rather than truncated,
 *   · de-duplicated on a content hash and read the file exactly once per
 *     change event, so a burst of reminders collapsed into one message,
 *   · skipped whatever was already in the file at boot.
 *
 * Net effect on your box: 2 message_outgoing events in the last 500 webhook
 * log lines, against 465 delivery-status callbacks for messages that were
 * never recorded in the first place.
 *
 * WHAT THIS MODULE DOES
 * ─────────────────────
 *   · polls + watches every SENDWHAT_*.TXT, parses EVERY record block it
 *     finds (so it is correct whether the software overwrites the file or
 *     appends to it) and survives the half-overwritten trailing garbage those
 *     files accumulate,
 *   · incrementally tails every pm2 *-out.log for [WA_OUTGOING] lines AND for
 *     raw AOC "Message Sent Successfully!" responses, which is what finally
 *     puts the cash-receipt and invoice blasts into the inbox,
 *   · de-duplicates on messageId (persisted across restarts) so nothing is
 *     ever shown twice and nothing is lost to a reboot,
 *   · resolves the party name from CMPL.json, falling back to the name printed
 *     in the log,
 *   · records the real messageId, so the ~465 message_status callbacks per 500
 *     events finally attach to a bubble and you get sent/delivered/read ticks.
 *
 * Drop this file next to whatsapp.js. It has no dependencies beyond Node core.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Tunables (all overridable from .env) ─────────────────────────────────────
const num = (v, d) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? d : n;
};

const CFG = {
    // How often each SENDWHAT_*.TXT is re-read. These files hold ONE record and
    // are rewritten in place, so the poll interval is the width of the window in
    // which a message can be missed. 250 ms is cheap (the files are < 2 KB).
    sendwhatPollMs: num(process.env.WA_INGEST_POLL_MS, 250),
    // pm2 logs are tailed by byte offset, so this can be lazier.
    pm2PollMs: num(process.env.WA_INGEST_PM2_POLL_MS, 2000),
    // Most bytes read from one pm2 log in a single pass.
    maxChunkBytes: num(process.env.WA_INGEST_MAX_CHUNK, 4 * 1024 * 1024),
    // How many message keys to remember between restarts.
    maxSeen: num(process.env.WA_INGEST_MAX_SEEN, 30000),
    // Two id-less events with the SAME body to the SAME number inside this many
    // milliseconds are treated as one message seen through two different logs.
    nearDupMs: num(process.env.WA_INGEST_NEAR_DUP_MS, 5000),
};

// ── Module state ─────────────────────────────────────────────────────────────
let logWebhookEvent = null;   // injected by whatsapp.js
let LOG_DIR = null;
let BASE_DIR = null;
let STATE_FILE = null;
let SENDWHAT_DIR = null;
let PM2_LOG_DIR = null;

let state = {
    seen: [],        // dedup keys, oldest first
    offsets: {},     // pm2 log basename -> byte offset already consumed
    recent: [],      // [{ to10, ts }] for near-duplicate suppression
};
let seenSet = new Set();
let stateDirty = false;
let started = false;

const stats = {
    startedAt: null,
    emitted: 0,
    bySource: {},
    skippedDuplicate: 0,
    skippedNoTimestamp: 0,
    sendwhat: {},    // filename -> { exists, lastReadAt, records, lastRecord, error }
    pm2: {},         // basename -> { size, offset, matched }
    errors: [],
};

function note(err, where) {
    const line = `${new Date().toISOString()} ${where}: ${err && err.message ? err.message : err}`;
    stats.errors.push(line);
    if (stats.errors.length > 30) stats.errors.shift();
    console.error('[WA INGEST] ' + line);
}

// ── Persistent state ─────────────────────────────────────────────────────────
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            state.seen = Array.isArray(raw.seen) ? raw.seen : [];
            state.offsets = raw.offsets && typeof raw.offsets === 'object' ? raw.offsets : {};
            state.recent = Array.isArray(raw.recent) ? raw.recent : [];
        }
    } catch (e) {
        note(e, 'loadState');
    }
    seenSet = new Set(state.seen);
}

function saveState() {
    if (!stateDirty) return;
    stateDirty = false;
    try {
        if (state.seen.length > CFG.maxSeen) {
            state.seen = state.seen.slice(-CFG.maxSeen);
            seenSet = new Set(state.seen);
        }
        if (state.recent.length > 500) state.recent = state.recent.slice(-500);
        const tmp = STATE_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(state));
        fs.renameSync(tmp, STATE_FILE);
    } catch (e) {
        note(e, 'saveState');
    }
}

// ── Small helpers ────────────────────────────────────────────────────────────
function phone10(v) {
    return String(v || '').replace(/\D/g, '').slice(-10);
}

function toE164(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return null;
    return '+' + (d.length === 10 ? '91' + d : d);
}

/** "05.09.2026  19:06:31" / "05/09/2026 20:56:19" → epoch ms (local time). */
function parseLogTimestamp(s) {
    const m = String(s || '').match(/(\d{2})[./-](\d{2})[./-](\d{4})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const t = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
    const ms = t.getTime();
    if (isNaN(ms)) return null;
    const now = Date.now();
    // Guard against a stale/garbled date left over from a half-overwritten file.
    // The window is generous on the future side so a timezone mismatch between
    // the accounting software and the Node process never discards a good stamp.
    if (ms > now + 26 * 36e5 || ms < now - 400 * 24 * 36e5) return null;
    return ms;
}

/** pm2 --time prefix: "2026-09-05T19:06:31: " or "2026-09-05 19:06:31 +05:30: ". */
function parsePm2LineTimestamp(line) {
    const m = String(line).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const ms = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    return isNaN(ms) ? null : ms;
}

function money(v) {
    const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
    if (!isFinite(n) || n === 0) return null;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extractMessageId(jsonish) {
    if (!jsonish) return null;
    try {
        const o = JSON.parse(jsonish);
        return (o && o.data && o.data[0] && o.data[0].messageId) || (o && o.messageId) || (o && o.id) || null;
    } catch (e) { /* fall through to regex */ }
    const m = String(jsonish).match(/"messageId"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    const id = String(jsonish).match(/"id"\s*:\s*"([^"]+)"/);
    return id ? id[1] : null;
}

// ── Party master (CMPL.json) ─────────────────────────────────────────────────
let _cmpl = null;
let _cmplAt = 0;
const CMPL_TTL = 60000;

function cmplLookup(p10) {
    if (!p10) return null;
    const now = Date.now();
    if (!_cmpl || now - _cmplAt > CMPL_TTL) {
        try {
            const dbf = process.env.DBF_FOLDER_PATH;
            const file = dbf ? path.join(dbf, 'data', 'json', 'CMPL.json') : null;
            _cmpl = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
            _cmplAt = now;
        } catch (e) {
            _cmpl = _cmpl || [];
            _cmplAt = now;
            note(e, 'CMPL.json');
        }
    }
    for (const p of _cmpl) {
        for (const m of [p.WA_MOB, p.WA_MOB_SS, p.C_MOBILE, p.C_PHONE]) {
            if (m && phone10(m) === p10) return p;
        }
    }
    return null;
}

function partyName(p10, fallback) {
    const p = cmplLookup(p10);
    if (p && p.C_NAME && String(p.C_NAME).trim()) {
        const city = String(p.C_PLACE || '').trim();
        return city ? `${String(p.C_NAME).trim()} ${city}` : String(p.C_NAME).trim();
    }
    return (fallback && String(fallback).trim()) || null;
}

// ── The one door every outbound message goes through ─────────────────────────
/**
 * Write a message_outgoing event, unless we have already recorded this message.
 *
 * Two dedup keys are registered for every message:
 *   id:<messageId>                       — exact, survives restarts
 *   k:<phone10>:<unix seconds>:<body>    — catches the same send arriving from
 *                                          a second source (e.g. whatsapp.js
 *                                          logs to JSONL *and* prints
 *                                          [WA_OUTGOING] to its pm2 log)
 * @returns {boolean} true if the event was written
 */
function recordOutgoing(evt) {
    if (!logWebhookEvent) return false;

    const to = toE164(evt.to);
    if (!to) return false;
    const p10 = phone10(to);
    const ts = Number(evt.timestamp) || Date.now();
    const body = String(evt.body || evt.interactiveBody || evt.templateName || 'Sent');

    const keys = [`k:${p10}:${Math.round(ts / 1000)}:${body.slice(0, 48)}`];
    if (evt.messageId) keys.unshift(`id:${evt.messageId}`);

    for (const k of keys) {
        if (seenSet.has(k)) {
            stats.skippedDuplicate++;
            return false;
        }
    }

    // Same number, same text, a moment apart, and no messageId to tell them
    // apart: that is one send seen twice through two logs, not two messages.
    // The window is deliberately tight — a bot answering with three bubbles in a
    // row is normal traffic and must never be collapsed into one.
    const bodyKey = body.slice(0, 48);
    if (!evt.messageId) {
        for (let i = state.recent.length - 1; i >= 0 && i > state.recent.length - 80; i--) {
            const r = state.recent[i];
            if (r.to10 === p10 && r.b === bodyKey && Math.abs(r.ts - ts) < CFG.nearDupMs) {
                stats.skippedDuplicate++;
                return false;
            }
        }
    }

    for (const k of keys) {
        seenSet.add(k);
        state.seen.push(k);
    }
    state.recent.push({ to10: p10, ts, b: bodyKey });
    stateDirty = true;

    logWebhookEvent({
        channel: 'whatsapp',
        event: 'message_outgoing',
        source: evt.source || 'unknown',
        messageId: evt.messageId || null,
        to,
        name: partyName(p10, evt.name),
        type: evt.type || 'text',
        body,
        templateName: evt.templateName || null,
        interactiveBody: evt.interactiveBody || null,
        interactiveHeader: evt.interactiveHeader || null,
        documentUrl: evt.documentUrl || null,
        documentFilename: evt.documentFilename || null,
        status: evt.status || 'sent',
        timestamp: ts,
    });

    stats.emitted++;
    stats.bySource[evt.source || 'unknown'] = (stats.bySource[evt.source || 'unknown'] || 0) + 1;
    return true;
}

/**
 * Register a message that some other code path has already written to the
 * JSONL itself (whatsapp.js POST /send), so the pm2 tailer does not emit a
 * second copy when it reads that process's own console output.
 */
function registerAlreadyLogged({ to, timestamp, body, messageId }) {
    const p10 = phone10(to);
    if (!p10) return;
    const ts = Number(timestamp) || Date.now();
    const keys = [`k:${p10}:${Math.round(ts / 1000)}:${String(body || 'Sent').slice(0, 48)}`];
    if (messageId) keys.unshift(`id:${messageId}`);
    for (const k of keys) {
        if (!seenSet.has(k)) {
            seenSet.add(k);
            state.seen.push(k);
        }
    }
    state.recent.push({ to10: p10, ts, b: String(body || 'Sent').slice(0, 48) });
    stateDirty = true;
}

// ═════════════════════════════════════════════════════════════════════════════
// SOURCE A — FMCG MUX SENDWHAT_<TEMPLATE>_LOG.TXT
// ═════════════════════════════════════════════════════════════════════════════
/*
 * Two shapes exist in the wild. Both are handled by the same generic
 * "Key : value" reader.
 *
 *   ------------------------------------------------------------
 *   05.09.2026  19:06:31
 *   To      : +919584865816
 *   Name    : ASHUTOSH KIRANA STORES DHUMA
 *   As On   : 05.09.2026
 *   Balance : 445161.00
 *   JSON    : {"from":…,"templateName":"balrem","components":{"body":{"params":[…]}}}
 *   HTTP    : 200
 *   Response: {"id":…,"data":[{"recipient":…,"messageId":"…:1"}],…}
 *   Result  : SUCCESS
 *
 *   ------------------------------------------------------------      (older)
 *   04.09.2026  20:59:17
 *   To     : +917000978573
 *   Party  : SHARAD KIRANA STORES
 *   Bill   : A-5406
 *   Amount : 11753.55
 *   PDF URL: https://…/A-5406.PDF
 *   HTTP   : 200
 *   Result : {"id":…,"data":[{"recipient":…,"messageId":"…:1"}],…}
 *
 * The software rewrites the file from byte 0 without truncating, so a shorter
 * record leaves the tail of the previous one behind:
 *
 *   Result  : SUCCESS
 *   b91d-e8a5b5247b30:1        ← debris
 *   Result  : SUCCESS          ← debris
 *
 * Every record therefore ends at its own "Result" line, and every field takes
 * its FIRST value. Debris after that point is ignored; debris that still looks
 * like a whole record is parsed but its messageId is already in `seen`.
 */

const SENDWHAT_RE = /^SENDWHAT_.*\.TXT$/i;
const SEPARATOR_RE = /^[-=]{5,}\s*$/;
const FIELD_RE = /^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/;

/** Split raw file text into record blocks and parse each into a field map. */
function parseSendwhatFile(content) {
    const lines = String(content).split(/\r?\n/);
    const blocks = [];
    let current = null;

    for (const line of lines) {
        if (SEPARATOR_RE.test(line)) {
            if (current) blocks.push(current);
            current = { fields: {}, closed: false };
            continue;
        }
        if (!current) current = { fields: {}, closed: false };   // file may start mid-record
        if (current.closed) continue;                            // debris after "Result"

        const f = line.match(FIELD_RE);
        if (f) {
            const key = f[1].trim().toUpperCase().replace(/\s+/g, '_');
            if (current.fields[key] === undefined) current.fields[key] = f[2].trim();
            if (key === 'RESULT') current.closed = true;           // end of this record
            continue;
        }
        if (!current.fields.__TS && /^\s*\d{2}[./-]\d{2}[./-]\d{4}/.test(line)) {
            current.fields.__TS = line.trim();
        }
    }
    if (current) blocks.push(current);

    return blocks.map((b) => b.fields).filter((f) => f.TO);
}

/** Turn one field map into a message_outgoing event. */
function sendwhatRecordToEvent(f, fileName) {
    const to = f.TO;
    if (!to) return null;

    // ── template + params, from the JSON payload when it is present ───────────
    let templateName = null;
    let params = [];
    let documentUrl = null;
    let documentFilename = null;

    if (f.JSON) {
        try {
            const p = JSON.parse(f.JSON);
            templateName = p.templateName || (p.template && p.template.name) || null;
            const c = p.components || {};
            if (c.body && Array.isArray(c.body.params)) params = c.body.params.map((x) => String(x).trim());
            const h = c.header;
            if (h && h.document) {
                documentUrl = h.document.link || null;
                documentFilename = h.document.filename || null;
            }
        } catch (e) { /* malformed JSON line — fall back to the plain fields */ }
    }

    if (!documentUrl) documentUrl = f.URL || f.PDF_URL || null;
    if (!documentFilename) documentFilename = f.PDFFILE || (documentUrl ? path.basename(documentUrl) : null);

    if (!templateName) {
        // Older logs carry no JSON — infer from the filename, e.g. SENDWHAT_BILL_LOG
        const m = fileName.match(/^SENDWHAT_(.+?)_LOG/i);
        templateName = m ? m[1].toLowerCase() : null;
    }

    const name = f.NAME || f.PARTY || null;
    const amount = money(f.AMOUNT);
    const balance = money(f.BALANCE);

    // ── Full template text with params substituted ──────────────────────────
    // Template bodies taken directly from the CXBot WA Utility Manager portal.
    let body;
    const p = params;   // shorthand
    switch (String(templateName || '').toLowerCase()) {
        case 'balrem':
            // "Dear *{{1}}* Your balance as on *{{2}}* is *Rs.{{3}}*
            //  kindly clear balance Regards EKTA ENTERPRISES"
            body = `Dear ${p[0] || name || ''}\nYour balance as on ${p[1] || f.AS_ON || ''} is Rs.${p[2] || (balance ? balance.replace('₹', '') : '') || ''}\nKindly clear balance\nRegards EKTA ENTERPRISES`;
            break;
        case 'bankrec':
        case 'recp':
            // "We Thankfully acknowledge of receipt Rs: {{1}} {{2}} on Date {{3}}
            //  Regards. EKTA ENTERPRISES"
            body = `We Thankfully acknowledge of receipt Rs: ${p[0] || (amount ? amount.replace('₹', '') : '') || ''} ${p[1] || ''} on Date ${p[2] || f.DATE || ''}\nRegards. EKTA ENTERPRISES`;
            break;
        case 'invoice_genrated':
        case 'bill':
            // "Dear {{1}}. Thank you for Purchasing Bill No. {{2}}
            //  For Amount : {{3}} Regards Ekta Enterprises"
            body = `Dear ${p[0] || name || ''}.\nThank you for Purchasing Bill No. ${p[1] || f.BILL || ''}\nFor Amount : ${p[2] || (amount ? amount.replace('₹', '') : '') || ''}\nRegards Ekta Enterprises`;
            break;
        case 'ledger':
            // "Dear {{1}}* Please find your attached Ledger..." (has PDF)
            body = `Dear ${p[0] || name || ''}.\nPlease find your attached Ledger Statement${documentFilename ? ` — ${documentFilename}` : ''}`;
            break;
        default:
            body = params.length ? `${templateName || 'Template'}:\n${params.join('\n')}` : (templateName || 'Template');
    }

    const respJson = f.RESPONSE || (f.RESULT && f.RESULT.startsWith('{') ? f.RESULT : null);
    const messageId = extractMessageId(respJson);
    const httpOk = f.HTTP ? /^2\d\d$/.test(f.HTTP.trim()) : true;
    const resultOk = f.RESULT ? (/^SUCCESS/i.test(f.RESULT) || f.RESULT.startsWith('{')) : true;

    // No id and a failure — nothing worth putting in the thread.
    if (!messageId && (!httpOk || !resultOk)) return null;

    return {
        source: 'fmcg-mux:' + fileName,
        messageId,
        to,
        name,
        type: 'template',
        templateName,
        body,
        interactiveBody: body,
        interactiveHeader: null,
        documentUrl,
        documentFilename,
        status: messageId && httpOk && resultOk ? 'sent' : 'failed',
        timestamp: parseLogTimestamp(f.__TS) || Date.now(),
    };
}

const _sendwhatSig = new Map();

function scanSendwhatFile(fullPath, fileName, { force = false } = {}) {
    const s = (stats.sendwhat[fileName] = stats.sendwhat[fileName] || { records: 0, emitted: 0 });
    try {
        if (!fs.existsSync(fullPath)) {
            s.exists = false;
            return;
        }
        s.exists = true;
        const st = fs.statSync(fullPath);
        const sig = st.size + ':' + st.mtimeMs;
        if (!force && _sendwhatSig.get(fileName) === sig) return;
        _sendwhatSig.set(fileName, sig);

        const content = fs.readFileSync(fullPath, 'utf8');
        const records = parseSendwhatFile(content);
        s.lastReadAt = new Date().toISOString();
        s.records = records.length;
        s.error = null;

        for (const f of records) {
            const evt = sendwhatRecordToEvent(f, fileName);
            if (!evt) continue;
            if (recordOutgoing(evt)) {
                s.emitted++;
                s.lastRecord = {
                    at: new Date(evt.timestamp).toISOString(),
                    to: evt.to,
                    name: evt.name,
                    template: evt.templateName,
                    messageId: evt.messageId,
                    body: evt.body,
                };
                console.log(`[WA INGEST] ${fileName} → ${evt.to} (${evt.name || 'unknown'}) ${evt.templateName || ''} ${evt.messageId || 'no-id'}`);
            }
        }
    } catch (e) {
        s.error = e.message;
        note(e, 'scanSendwhat ' + fileName);
    }
}

function listSendwhatFiles() {
    try {
        if (!fs.existsSync(SENDWHAT_DIR)) return [];
        return fs.readdirSync(SENDWHAT_DIR).filter((f) => SENDWHAT_RE.test(f));
    } catch (e) {
        note(e, 'listSendwhatFiles');
        return [];
    }
}

function scanAllSendwhat(opts) {
    for (const f of listSendwhatFiles()) scanSendwhatFile(path.join(SENDWHAT_DIR, f), f, opts);
}

// ═════════════════════════════════════════════════════════════════════════════
// SOURCE B — pm2 *-out.log  (cash receipts, invoices, bot replies, …)
// ═════════════════════════════════════════════════════════════════════════════
/*
 * Two line shapes are recognised:
 *
 *   [WA_OUTGOING] {"to":"+91…","type":"text","body":"…","timestamp":1788…}
 *       printed by whatsapp.js sendWhatsAppMessage() and CxBotClient._send()
 *
 *   …anything… {"id":"…","data":[{"recipient":"919425383102",
 *                                 "messageId":"…:1"}],…,"message":"Message Sent
 *                                 Successfully!","error":null}
 *       printed by the webserver's cash-receipt / invoice sync, which talks to
 *       the AOC API directly. This is the line that finally brings those
 *       parties into the inbox.
 */

const AOC_RESP_RE = /"recipient"\s*:\s*"(\d{8,15})"\s*,\s*"messageId"\s*:\s*"([^"]+)"/;
const AOC_RESP_RE_ALT = /"messageId"\s*:\s*"([^"]+)"[\s\S]{0,80}?"recipient"\s*:\s*"(\d{8,15})"/;

/** Best-effort description of what a raw AOC response line was about. */
function describeAocLine(line) {
    const tag = line.match(/\[([A-Za-z][^\]]{2,40})\]/);
    // Requires a real separator, so "[Cash Receipts Sync]" is not mistaken for a
    // reference number — only "for Receipt: 2765" is.
    const ref = line.match(/\b(Receipt|Bill|Invoice|Order|Ledger|Statement)\b\s*(?:No\.?|#)?\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9\-\/]*)/i);
    if (ref) {
        const kind = ref[1].charAt(0).toUpperCase() + ref[1].slice(1).toLowerCase();
        return `${kind} ${ref[2]} sent on WhatsApp`;
    }
    if (tag) return tag[1].replace(/\s*Sync$/i, '').trim() + ' — WhatsApp message sent';
    return 'WhatsApp message sent';
}

function handlePm2Line(line, logName, { rescan = false } = {}) {
    const lineTs = parsePm2LineTimestamp(line);

    // ── 1. [WA_OUTGOING] — has the real body, has no messageId ────────────────
    const i = line.indexOf('[WA_OUTGOING]');
    if (i >= 0) {
        try {
            const d = JSON.parse(line.slice(i + '[WA_OUTGOING]'.length).trim());
            if (d && d.to) {
                const ts = Number(d.timestamp) || lineTs;
                if (!ts) {
                    stats.skippedNoTimestamp++;
                    return;
                }
                recordOutgoing({
                    source: 'pm2:' + logName,
                    messageId: null,
                    to: d.to,
                    name: null,
                    type: d.type || 'text',
                    templateName: d.templateName || null,
                    body: d.body || d.interactiveBody || d.templateName || 'Sent',
                    interactiveBody: d.interactiveBody || null,
                    interactiveHeader: d.interactiveHeader || null,
                    timestamp: ts,
                });
            }
        } catch (e) { /* not our line after all */ }
        return;
    }

    // [WA_OUTGOING_SUCCESS] only confirms an id for a body we already recorded.
    if (line.indexOf('[WA_OUTGOING_SUCCESS]') >= 0) return;

    // ── 2. A raw AOC send response ────────────────────────────────────────────
    if (line.indexOf('"messageId"') < 0) return;
    let recipient = null;
    let messageId = null;
    const m = AOC_RESP_RE.exec(line);
    if (m) {
        recipient = m[1];
        messageId = m[2];
    } else {
        const m2 = AOC_RESP_RE_ALT.exec(line);
        if (!m2) return;
        messageId = m2[1];
        recipient = m2[2];
    }
    if (/"error"\s*:\s*"[^"]/.test(line)) return;   // a non-null error string

    const ts = lineTs || (rescan ? null : Date.now());
    if (!ts) {
        // Historical rescan of a log without pm2 timestamps — refuse to invent one.
        stats.skippedNoTimestamp++;
        return;
    }

    recordOutgoing({
        source: 'pm2:' + logName,
        messageId,
        to: recipient,
        name: null,
        type: 'template',
        templateName: null,
        body: describeAocLine(line),
        timestamp: ts,
    });
}

function listPm2Logs() {
    try {
        if (!fs.existsSync(PM2_LOG_DIR)) return [];
        return fs.readdirSync(PM2_LOG_DIR)
            .filter((f) => /-out(-\d+)?\.log$/i.test(f))
            .map((f) => path.join(PM2_LOG_DIR, f));
    } catch (e) {
        note(e, 'listPm2Logs');
        return [];
    }
}

function tailPm2Logs({ rescan = false } = {}) {
    for (const full of listPm2Logs()) {
        const name = path.basename(full);
        const s = (stats.pm2[name] = stats.pm2[name] || { matched: 0 });
        try {
            const st = fs.statSync(full);
            s.size = st.size;

            let off = state.offsets[name];
            if (rescan) off = 0;
            if (off === undefined) {
                // First sight of this log. Start at the end: lines already written have
                // no timestamp of their own, and guessing one would put fake messages
                // at fake times in the inbox. Use --ingest-rescan for history.
                off = st.size;
                state.offsets[name] = off;
                stateDirty = true;
                s.offset = off;
                s.note = 'started at end of file';
                continue;
            }
            if (st.size < off) off = 0;               // truncated by `pm2 flush`
            if (st.size === off) {
                s.offset = off;
                continue;
            }

            const want = Math.min(st.size - off, CFG.maxChunkBytes);
            const buf = Buffer.allocUnsafe(want);
            const fd = fs.openSync(full, 'r');
            let read = 0;
            try {
                read = fs.readSync(fd, buf, 0, want, off);
            } finally {
                fs.closeSync(fd);
            }
            if (read <= 0) continue;

            const nl = buf.lastIndexOf(0x0a, read - 1);
            if (nl < 0) {
                // No complete line yet; wait unless we are stuck on an oversized line.
                if (read >= CFG.maxChunkBytes) {
                    state.offsets[name] = off + read;
                    stateDirty = true;
                }
                continue;
            }

            const text = buf.slice(0, nl + 1).toString('utf8');
            state.offsets[name] = off + nl + 1;
            stateDirty = true;
            s.offset = state.offsets[name];

            const before = stats.emitted;
            for (const line of text.split(/\r?\n/)) {
                if (!line) continue;
                handlePm2Line(line, name, { rescan });
            }
            s.matched += stats.emitted - before;
        } catch (e) {
            s.error = e.message;
            note(e, 'tailPm2 ' + name);
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Wiring
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {function} opts.logWebhookEvent  whatsapp.js's own JSONL writer
 * @param {string}   opts.logDir           webhook-logs directory
 * @param {string}   opts.baseDir          __dirname of whatsapp.js (the webapp folder)
 */
function init(opts) {
    if (started) return api;
    logWebhookEvent = opts.logWebhookEvent;
    LOG_DIR = opts.logDir;
    BASE_DIR = opts.baseDir;
    STATE_FILE = path.join(LOG_DIR, 'outbound-ingest-state.json');

    // The accounting software writes its logs one level above the webapp folder:
    //   C:\Users\shubham\Desktop\fmcg\SENDWHAT_*.TXT       ← MUX output
    //   C:\Users\shubham\Desktop\fmcg\webapp\server\whatsapp.js  ← this file
    // BASE_DIR = __dirname of whatsapp.js = …\webapp\server\
    // One level up (..)  = …\webapp\       ← wrong
    // Two levels up (../..) = …\fmcg\      ← correct
    SENDWHAT_DIR = process.env.FMCG_MUX_LOG_DIR || path.resolve(BASE_DIR, '../..');
    PM2_LOG_DIR = process.env.PM2_LOG_DIR ||
        path.join(process.env.PM2_HOME || path.join(os.homedir(), '.pm2'), 'logs');

    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    loadState();
    started = true;
    stats.startedAt = new Date().toISOString();

    const files = listSendwhatFiles();
    console.log(`[WA INGEST] SENDWHAT folder : ${SENDWHAT_DIR} (${files.length} log file(s): ${files.join(', ') || 'none'})`);
    console.log(`[WA INGEST] pm2 log folder  : ${PM2_LOG_DIR} (${listPm2Logs().length} *-out.log)`);

    // Read whatever is sitting in the SENDWHAT files right now. Dedup by
    // messageId makes this safe on every restart.
    scanAllSendwhat({ force: true });
    tailPm2Logs();

    // Poll — the only mechanism that is reliable when another process rewrites a
    // file in place on Windows.
    const t1 = setInterval(() => scanAllSendwhat(), CFG.sendwhatPollMs);
    const t2 = setInterval(() => tailPm2Logs(), CFG.pm2PollMs);
    const t3 = setInterval(saveState, 2000);
    for (const t of [t1, t2, t3]) if (t.unref) t.unref();

    // fs.watch on the folder is a latency optimisation on top of the poll; if it
    // dies (and on Windows it eventually does) the poll still has us covered.
    try {
        fs.watch(SENDWHAT_DIR, { persistent: false }, (_e, filename) => {
            if (filename && SENDWHAT_RE.test(filename)) {
                setTimeout(() => scanSendwhatFile(path.join(SENDWHAT_DIR, filename), filename), 120);
            }
        });
    } catch (e) {
        console.warn(`[WA INGEST] Directory watch unavailable (${e.message}) — polling every ${CFG.sendwhatPollMs}ms instead`);
    }

    for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
        process.on(sig, () => {
            try { saveState(); } catch (e) { /* shutting down */ }
        });
    }

    console.log(`[WA INGEST] Ready — polling SENDWHAT every ${CFG.sendwhatPollMs}ms, pm2 logs every ${CFG.pm2PollMs}ms`);
    return api;
}

function status() {
    return {
        startedAt: stats.startedAt,
        sendwhatDir: SENDWHAT_DIR,
        pm2LogDir: PM2_LOG_DIR,
        pollMs: CFG.sendwhatPollMs,
        pm2PollMs: CFG.pm2PollMs,
        emitted: stats.emitted,
        bySource: stats.bySource,
        skippedDuplicate: stats.skippedDuplicate,
        skippedNoTimestamp: stats.skippedNoTimestamp,
        seenKeys: seenSet.size,
        sendwhatFiles: stats.sendwhat,
        pm2Logs: stats.pm2,
        recentErrors: stats.errors.slice(-10),
    };
}

/** One-off: re-read every pm2 log from byte 0. Only lines that carry their own
 *  timestamp (pm2 started with --time) are ingested; the rest are counted and
 *  skipped rather than given an invented time. */
function rescanPm2() {
    tailPm2Logs({ rescan: true });
    saveState();
    return status();
}

/** Diagnostic: parse the SENDWHAT files and show what we would emit. */
function dryRun() {
    const out = [];
    for (const f of listSendwhatFiles()) {
        const full = path.join(SENDWHAT_DIR, f);
        let records = [];
        try {
            records = parseSendwhatFile(fs.readFileSync(full, 'utf8'));
        } catch (e) {
            out.push({ file: f, error: e.message });
            continue;
        }
        out.push({
            file: f,
            records: records.length,
            events: records.map((r) => sendwhatRecordToEvent(r, f)).filter(Boolean),
        });
    }
    return { sendwhatDir: SENDWHAT_DIR, files: out };
}

const api = {
    init,
    status,
    rescanPm2,
    dryRun,
    recordOutgoing,
    registerAlreadyLogged,
    // exported for tests
    _parseSendwhatFile: parseSendwhatFile,
    _sendwhatRecordToEvent: sendwhatRecordToEvent,
    _handlePm2Line: handlePm2Line,
    _parseLogTimestamp: parseLogTimestamp,
};

module.exports = api;