'use strict';
/**
 * whatsappui.js — the inbox API behind /api/whatsapp-ui
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes in this revision, all of them about making OUTGOING-ONLY threads real
 * citizens of the inbox (parties we messaged through the paid API who never
 * replied — invoices, cash receipts, balance reminders, ledgers):
 *
 *  1. message_status is applied in a SECOND pass, after every outgoing message
 *     is known. CXBot's delivery callback frequently beats our own record of
 *     the send into the log file; single-pass matching silently dropped those,
 *     which is why blasts never showed a delivered/read tick.
 *  2. message_outgoing now honours `status`, `documentUrl` and `documentFilename`
 *     coming from outbound-ingest.js, so a ledger or invoice PDF is a real
 *     attachment in the bubble instead of the word "Template".
 *  3. The pm2 log scan is off by default. outbound-ingest.js now writes those
 *     same messages into the JSONL, and re-reading multi-hundred-megabyte pm2
 *     logs every ten seconds was the most expensive thing this file did.
 *     Set WA_UI_PM2_FALLBACK=1 to bring the old path back.
 *  4. CMPL.json is indexed by phone once per reload instead of being scanned
 *     linearly for every thread.
 *  5. New filter: ?filter=sent — threads where the customer has never written
 *     to us. That is the list the blasts land in.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const LOG_DIR = path.join(__dirname, '..', 'webhook-logs');
const WHATSAPP_PORT = process.env.WHATSAPP_PORT || 4292;

// Legacy pm2 fallback — superseded by outbound-ingest.js. Off unless asked for.
const PM2_FALLBACK = process.env.WA_UI_PM2_FALLBACK === '1';
const PM2_LOG = path.join(os.homedir(), '.pm2/logs/whatsapp-out.log');
const PM2_LOG2 = path.join(os.homedir(), '.pm2/logs/fmcg-api-out.log');
const PM2_TAIL_BYTES = parseInt(process.env.WA_UI_PM2_TAIL_BYTES, 10) || 3 * 1024 * 1024;

// ── Party Master (CMPL.json) ──────────────────────────────────────────────────
let _partyMaster = null;
let _partyIndex = null;          // phone10 -> party row
let _partyMasterTs = 0;
const PARTY_MASTER_TTL = 60000;  // reload every 60s

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

function getPartyIndex() {
  const now = Date.now();
  if (_partyIndex && now - _partyMasterTs < PARTY_MASTER_TTL) return _partyIndex;
  try {
    const dbfPath = process.env.DBF_FOLDER_PATH;
    const cmplPath = dbfPath ? path.join(dbfPath, 'data', 'json', 'CMPL.json') : null;
    _partyMaster = cmplPath && fs.existsSync(cmplPath)
      ? JSON.parse(fs.readFileSync(cmplPath, 'utf8'))
      : [];
  } catch (e) {
    console.error('[WA-UI] CMPL.json load error:', e.message);
    _partyMaster = _partyMaster || [];
  }
  // One pass to build the lookup, instead of a linear scan per thread.
  const idx = new Map();
  for (const p of _partyMaster) {
    for (const m of [p.WA_MOB, p.WA_MOB_SS, p.C_MOBILE, p.C_PHONE]) {
      const k = normalizePhone(m);
      if (k && k.length === 10 && !idx.has(k)) idx.set(k, p);
    }
  }
  _partyIndex = idx;
  _partyMasterTs = now;
  return _partyIndex;
}

function lookupPartyByPhone(phone10) {
  if (!phone10) return null;
  return getPartyIndex().get(phone10) || null;
}

// Build display name: "Party Name City (WhatsApp Name)" or fallback
function buildDisplayName(phone10, waProfileName) {
  const party = lookupPartyByPhone(phone10);
  if (party && party.C_NAME && party.C_NAME.trim()) {
    const city = (party.C_PLACE || '').trim();
    const systemName = city ? `${party.C_NAME.trim()} ${city}` : party.C_NAME.trim();
    if (waProfileName && waProfileName.trim() && waProfileName.trim() !== systemName) {
      return `${systemName} (${waProfileName.trim()})`;
    }
    return systemName;
  }
  return waProfileName || null;
}

// ── CORS — allow test domain and localhost ─────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://test.ekta-enterprises.com',
  'https://server.ekta-enterprises.com',
  'http://localhost:3000',
  'http://localhost:5173',
];
router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── SSE ────────────────────────────────────────────────────────────────────────
const sseClients = new Set();
function broadcastSSE(data) {
  const payload = 'data: ' + JSON.stringify(data) + '\n\n';
  for (const res of sseClients) {
    try { res.write(payload); } catch (e) { sseClients.delete(res); }
  }
}
function invalidateCache() { _cache = null; _cacheTs = 0; }

// ── Read Receipts ──────────────────────────────────────────────────────────────
const READ_RECEIPTS_FILE = path.join(LOG_DIR, 'read-receipts.json');
function getReadReceipts() {
  if (!fs.existsSync(READ_RECEIPTS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(READ_RECEIPTS_FILE, 'utf8')); } catch { return {}; }
}
function markAsRead(phone) {
  const receipts = getReadReceipts();
  receipts[phone] = Date.now();
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(READ_RECEIPTS_FILE, JSON.stringify(receipts, null, 2));
  invalidateCache();
}

if (fs.existsSync(LOG_DIR)) {
  fs.watch(LOG_DIR, (event, filename) => {
    if (filename && filename.endsWith('.jsonl')) {
      invalidateCache();
      broadcastSSE({ type: 'update', file: filename, ts: Date.now() });
    }
  });
}

// ── JSONL reader ───────────────────────────────────────────────────────────────
function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function readAllLogs({ daysBack = 60 } = {}) {
  if (!fs.existsSync(LOG_DIR)) return [];
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(LOG_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .filter((f) => { const d = new Date(f.slice(0, 10)); return !isNaN(d) && d.getTime() >= cutoff; })
    .sort();
  const all = [];
  for (const f of files) all.push(...readJsonlFile(path.join(LOG_DIR, f)));
  return all;
}

// ── Legacy pm2 outgoing parser (disabled unless WA_UI_PM2_FALLBACK=1) ─────────
function readTail(file, maxBytes) {
  const st = fs.statSync(file);
  const start = Math.max(0, st.size - maxBytes);
  const len = st.size - start;
  if (len <= 0) return '';
  const buf = Buffer.allocUnsafe(len);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, len, start); } finally { fs.closeSync(fd); }
  return buf.toString('utf8');
}

function parsePm2OutgoingMessages() {
  const pendingByTs = new Map();
  const byMsgId = new Map();
  byMsgId._pendingByTs = pendingByTs;
  if (!PM2_FALLBACK) return byMsgId;

  for (const logFile of [PM2_LOG, PM2_LOG2]) {
    if (!fs.existsSync(logFile)) continue;
    try {
      for (const raw of readTail(logFile, PM2_TAIL_BYTES).split('\n')) {
        if (raw.includes('[WA_OUTGOING]')) {
          try {
            const data = JSON.parse(raw.substring(raw.indexOf('[WA_OUTGOING]') + 13).trim());
            if (data && data.to) {
              pendingByTs.set(data.to + '_' + data.timestamp, {
                to: normalizePhone(data.to),
                type: data.type,
                body: data.body,
                templateName: data.templateName || null,
                interactiveBody: data.interactiveBody || null,
                interactiveHeader: data.interactiveHeader || null,
                timestamp: data.timestamp,
              });
            }
          } catch (e) { }
        } else if (raw.includes('[WA_OUTGOING_SUCCESS]')) {
          try {
            const data = JSON.parse(raw.substring(raw.indexOf('[WA_OUTGOING_SUCCESS]') + 21).trim());
            if (data && data.messageId && data.to) {
              const toNorm = normalizePhone(data.to);
              let best = null, bestDiff = Infinity;
              for (const info of pendingByTs.values()) {
                if (info.to !== toNorm) continue;
                const diff = Math.abs((data.timestamp || Date.now()) - info.timestamp);
                if (diff < bestDiff && diff < 30000) { bestDiff = diff; best = info; }
              }
              byMsgId.set(data.messageId, best || {
                to: toNorm, type: 'text', body: 'Sent', timestamp: data.timestamp || Date.now(),
              });
            }
          } catch (e) { }
        }
      }
    } catch (e) { console.error(`[WA-UI] PM2 parse error in ${logFile}:`, e.message); }
  }
  return byMsgId;
}

// ── Conversation builder ───────────────────────────────────────────────────────
function formatPhone(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+91 ' + d.slice(2, 7) + ' ' + d.slice(7);
  return '+' + d;
}

const STATUS_ORDER = { sending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };

function buildConversations() {
  const entries = readAllLogs({ daysBack: 60 });
  const outgoingMap = parsePm2OutgoingMessages();
  const readReceipts = getReadReceipts();
  const threads = new Map();

  // messageId → the message object, so the SECOND pass can apply delivery status
  // no matter which order the two events were written in.
  const msgIdIndex = new Map();
  const statusEvents = [];
  let unmatchedStatuses = 0;

  function getOrCreate(phone) {
    const p10 = normalizePhone(phone);
    if (!threads.has(p10)) {
      threads.set(p10, {
        phone: p10, displayPhone: formatPhone(phone), name: null,
        messages: [], lastMessageAt: 0, unreadCount: 0,
        inboundCount: 0, outboundCount: 0, _seen: new Set(),
      });
    }
    return threads.get(p10);
  }

  // ── PASS 1 — messages ──────────────────────────────────────────────────────
  for (const entry of entries) {
    const p = entry && entry.payload;
    if (!p) continue;
    const ts = entry.receivedAt ? new Date(entry.receivedAt).getTime() : Date.now();

    if (p.event === 'message_received') {
      const phone = p.contacts && p.contacts.recipient;
      if (!phone) continue;
      const thread = getOrCreate(phone);
      if (p.contacts && p.contacts.profileName) thread.name = p.contacts.profileName;
      const msgId = p.messageId || ('inbound_' + ts);
      if (thread._seen.has(msgId)) continue;
      thread._seen.add(msgId);

      const msgType = (p.messages && p.messages.type) || 'text';
      let body = '', imageUrl = null, interactiveTitle = null;
      let documentUrl = null, documentFilename = null;

      if (msgType === 'text') {
        body = (p.messages && p.messages.text && p.messages.text.body) || '';
      } else if (msgType === 'image') {
        imageUrl = (p.messages && p.messages.image && p.messages.image.url) || null;
        body = 'Photo';
      } else if (msgType === 'document') {
        documentUrl = (p.messages && p.messages.document && p.messages.document.url) || null;
        documentFilename = (p.messages && p.messages.document && p.messages.document.filename) || 'Document';
        body = documentFilename;
      } else if (msgType === 'interactive') {
        const intv = p.messages && p.messages.interactive;
        const btnR = intv && ((intv.text && intv.text.button_reply) || intv.button_reply);
        const listR = intv && intv.list_reply;
        interactiveTitle = (btnR && btnR.title) || (listR && listR.title) || 'Reply';
        body = interactiveTitle;
      } else if (msgType === 'order') {
        body = 'Catalogue Order';
      } else if (msgType === 'audio') {
        body = 'Voice message';
      } else if (msgType === 'video') {
        body = 'Video';
      } else { body = msgType; }

      const msgTs = (p.messages && p.messages.timestamp)
        ? (p.messages.timestamp > 1e12 ? p.messages.timestamp : p.messages.timestamp * 1000)
        : ts;

      thread.messages.push({
        id: msgId, direction: 'inbound', type: msgType,
        body, imageUrl, interactiveTitle, documentUrl, documentFilename,
        timestamp: msgTs, status: 'received',
      });
      thread.inboundCount++;
      if (msgTs > thread.lastMessageAt) thread.lastMessageAt = msgTs;
      if (msgTs > (readReceipts[thread.phone] || 0)) thread.unreadCount++;

    } else if (p.event === 'message_outgoing') {
      // Written by whatsapp.js POST /send and by outbound-ingest.js for every
      // other sender on this box (FMCG MUX SENDWHAT logs, cash-receipt and
      // invoice blasts from the webserver, fmcg-api bot replies).
      const phone = p.to;
      if (!phone) continue;
      const p10 = normalizePhone(phone);
      const thread = getOrCreate(phone);
      if (!thread.name && p.name) thread.name = p.name;

      const msgId = p.messageId || ('out_jsonl_' + p10 + '_' + (p.timestamp || ts));
      if (thread._seen.has(msgId)) continue;
      thread._seen.add(msgId);

      const msgTs = p.timestamp || ts;
      const type = p.type || (p.templateName ? 'template' : 'text');
      const msgObj = {
        id: msgId,
        direction: 'outbound',
        type,
        body: p.body || p.interactiveBody || p.templateName || 'Sent',
        templateName: p.templateName || null,
        interactiveBody: p.interactiveBody || null,
        interactiveHeader: p.interactiveHeader || null,
        imageUrl: p.imageUrl || null,
        documentUrl: p.documentUrl || null,
        documentFilename: p.documentFilename || null,
        source: p.source || null,
        timestamp: msgTs,
        status: p.status || 'sent',
      };
      thread.messages.push(msgObj);
      thread.outboundCount++;
      if (p.messageId) msgIdIndex.set(p.messageId, msgObj);
      if (msgTs > thread.lastMessageAt) thread.lastMessageAt = msgTs;

    } else if (p.event === 'message_status') {
      statusEvents.push({ p, ts });
    }
  }

  // ── PASS 2 — delivery status ───────────────────────────────────────────────
  // Runs last on purpose: CXBot's status callback often reaches the log before
  // our own record of the send does, and the old single-pass version threw
  // those away.
  for (const { p, ts } of statusEvents) {
    const msgId = p.messageId;
    const status = p.statuses && p.statuses.status;
    if (!msgId || !status) continue;

    const known = msgIdIndex.get(msgId);
    if (known) {
      if ((STATUS_ORDER[status] || 0) > (STATUS_ORDER[known.status] || 0)) known.status = status;
      continue;
    }

    // Legacy path: the message body only exists in a pm2 log.
    const outInfo = outgoingMap.get(msgId);
    if (!outInfo || !outInfo.to) { unmatchedStatuses++; continue; }
    const thread = getOrCreate(outInfo.to);
    const existing = thread.messages.find((m) => m.id === msgId);
    if (existing) {
      if ((STATUS_ORDER[status] || 0) > (STATUS_ORDER[existing.status] || 0)) existing.status = status;
    } else {
      const statusTs = p.statuses && p.statuses.timestamp ? Number(p.statuses.timestamp) * 1000 : ts;
      const msgTs = outInfo.timestamp || statusTs;
      thread.messages.push({
        id: msgId, direction: 'outbound',
        type: outInfo.type || 'text',
        body: outInfo.body || 'Sent',
        templateName: outInfo.templateName || null,
        interactiveBody: outInfo.interactiveBody || null,
        interactiveHeader: outInfo.interactiveHeader || null,
        timestamp: msgTs, status,
      });
      thread.outboundCount++;
      thread._seen.add(msgId);
      if (msgTs > thread.lastMessageAt) thread.lastMessageAt = msgTs;
    }
  }

  // ── Legacy pm2 injection (only when the fallback is switched on) ───────────
  for (const info of (outgoingMap._pendingByTs || new Map()).values()) {
    if (!info || !info.to) continue;
    const thread = getOrCreate(info.to);
    const already = thread.messages.some(
      (m) => m.direction === 'outbound' && Math.abs(m.timestamp - info.timestamp) < 10000
    );
    if (already) continue;
    thread.messages.push({
      id: 'out_pm2_' + info.to + '_' + info.timestamp,
      direction: 'outbound',
      type: info.type || 'text',
      body: info.body || 'Sent',
      templateName: info.templateName || null,
      interactiveBody: info.interactiveBody || null,
      interactiveHeader: info.interactiveHeader || null,
      timestamp: info.timestamp,
      status: 'sent',
    });
    thread.outboundCount++;
    if (info.timestamp > thread.lastMessageAt) thread.lastMessageAt = info.timestamp;
  }

  for (const thread of threads.values()) {
    thread.messages.sort((a, b) => a.timestamp - b.timestamp);
    delete thread._seen;
  }
  threads._unmatchedStatuses = unmatchedStatuses;
  return threads;
}

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 10000;

function getCachedConversations() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL) return _cache;
  _cache = buildConversations();
  _cacheTs = now;
  return _cache;
}

// ── API Endpoints ────────────────────────────────────────────────────────────────

router.post('/read', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Missing phone' });
  markAsRead(normalizePhone(phone));
  res.json({ success: true });
});

// Helper: the human-readable preview text for a message
function getMessagePreview(msg) {
  if (!msg) return '';
  if (msg.type === 'image') return '📷 Photo';
  if (msg.type === 'audio') return '🎤 Voice message';
  if (msg.type === 'video') return '🎬 Video';
  if (msg.type === 'order') return '🛒 Catalogue Order';
  if (msg.type === 'document') return `📄 ${msg.documentFilename || msg.body || 'Document'}`;
  if (msg.type === 'interactive') {
    if (msg.direction === 'inbound') return msg.interactiveTitle || msg.body || 'Button reply';
    return msg.interactiveBody || msg.body || msg.templateName || 'Template';
  }
  if (msg.type === 'template') {
    const text = msg.body || msg.interactiveBody || msg.templateName || 'Template';
    return msg.documentUrl ? `📄 ${text}` : text;
  }
  return msg.body || '';
}

router.get('/conversations', (req, res) => {
  try {
    const threads = getCachedConversations();
    const search = (req.query.search || '').toLowerCase();
    const filter = req.query.filter || 'all';
    let list = Array.from(threads.values());

    list = list.filter((t) => t.messages.length > 0 || t.lastMessageAt > 0);

    if (search) {
      list = list.filter((t) => {
        const dispName = buildDisplayName(t.phone, t.name) || t.displayPhone;
        return dispName.toLowerCase().includes(search) ||
          (t.name || '').toLowerCase().includes(search) ||
          t.phone.includes(search) ||
          t.displayPhone.includes(search);
      });
    }

    if (filter === 'unread') list = list.filter((t) => t.unreadCount > 0);
    // "sent" = we messaged them through the API and they have never written to
    // us. Invoices, cash receipts, balance reminders, ledger statements.
    else if (filter === 'sent') list = list.filter((t) => t.inboundCount === 0 && t.outboundCount > 0);

    list.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    const result = list.map((t) => {
      const lastMsg = t.messages[t.messages.length - 1];
      return {
        phone: t.phone,
        displayPhone: t.displayPhone,
        name: buildDisplayName(t.phone, t.name) || t.name || t.displayPhone,
        lastMessage: getMessagePreview(lastMsg),
        lastMessageAt: t.lastMessageAt,
        lastMessageDirection: (lastMsg && lastMsg.direction) || 'inbound',
        lastMessageStatus: lastMsg && lastMsg.status,
        unreadCount: t.unreadCount,
        messageCount: t.messages.length,
        inboundCount: t.inboundCount,
        outboundCount: t.outboundCount,
        neverReplied: t.inboundCount === 0,
      };
    });
    res.json({ ok: true, count: result.length, conversations: result });
  } catch (err) {
    console.error('[WA-UI] /conversations error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/messages', (req, res) => {
  try {
    const phone = normalizePhone(req.query.phone);
    if (!phone) return res.status(400).json({ ok: false, error: 'Missing phone' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 100;
    const threads = getCachedConversations();
    const thread = threads.get(phone);
    if (!thread) return res.json({ ok: true, phone, messages: [], total: 0 });
    const msgs = thread.messages;
    const total = msgs.length;
    const start = Math.max(0, total - page * pageSize);
    const end = total - (page - 1) * pageSize;
    res.json({
      ok: true, phone,
      name: buildDisplayName(phone, thread.name) || thread.name || thread.displayPhone,
      displayPhone: thread.displayPhone,
      messages: msgs.slice(start, end), total, page, hasMore: start > 0,
      inboundCount: thread.inboundCount, outboundCount: thread.outboundCount,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const body = req.body || {};
    const to = body.to;
    const msgBody = body.body;
    const { mediaUrl, mediaType, filename } = body;

    if (!to || (!msgBody && !mediaUrl)) return res.status(400).json({ ok: false, error: 'Missing to or content' });

    const toNorm = String(to).length === 10 ? '+91' + to : (String(to).startsWith('+') ? to : ('+' + to));
    const payload = { to: toNorm };

    if (mediaUrl) {
      payload.type = mediaType || 'document';
      payload[payload.type] = { link: mediaUrl, caption: msgBody || undefined };
      if (payload.type === 'document') payload.document.filename = filename || 'Attachment';
    } else {
      payload.type = 'text';
      payload.text = { body: String(msgBody) };
    }

    const result = await axios.post(
      'http://127.0.0.1:' + WHATSAPP_PORT + '/send',
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000, validateStatus: () => true }
    );

    const ok = result.status >= 200 && result.status < 300;

    // ── Persist outbound media to JSONL so thumbnails survive a page refresh ──
    if (ok && mediaUrl) {
      try {
        const msgId = (result.data && result.data.data && result.data.data[0] && result.data.data[0].messageId)
          || ('out_ui_' + Date.now());
        const isImage = (mediaType || 'document') === 'image';
        const entry = {
          receivedAt: new Date().toISOString(),
          source: 'whatsapp-ui-send',
          payload: {
            event: 'message_outgoing',
            to: toNorm,
            messageId: msgId,
            type: isImage ? 'image' : 'document',
            body: isImage ? 'Photo' : (filename || 'Document'),
            imageUrl: isImage ? mediaUrl : null,
            documentUrl: isImage ? null : mediaUrl,
            documentFilename: isImage ? null : (filename || 'Attachment'),
            timestamp: Date.now(),
            status: 'sent',
            source: 'ui',
          },
        };
        const day = entry.receivedAt.slice(0, 10);
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(path.join(LOG_DIR, `${day}.jsonl`), line);
        fs.appendFileSync(path.join(LOG_DIR, 'all.jsonl'), line);
        invalidateCache();
      } catch (e) {
        console.error('[WA-UI] /send JSONL persist error:', e.message);
      }
    }

    invalidateCache();
    res.status(result.status).json(Object.assign({ ok }, result.data));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const { filename, base64 } = req.body;
    if (!filename || !base64) return res.status(400).json({ ok: false, error: 'Missing filename or base64' });

    const outDir = path.join(__dirname, '..', 'whatsapp-files');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const ext = path.extname(filename);
    const uniqueName = Date.now() + '_' + Math.random().toString(36).substring(7) + ext;
    const outPath = path.join(outDir, uniqueName);

    fs.writeFileSync(outPath, base64.replace(/^data:([A-Za-z-+\/]+);base64,/, ''), 'base64');
    res.json({ ok: true, url: `https://server.ekta-enterprises.com/whatsapp/files/${uniqueName}`, filename: uniqueName });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const threads = getCachedConversations();
    let totalMessages = 0, totalInbound = 0, totalOutbound = 0, totalUnread = 0;
    let outgoingOnlyContacts = 0;
    for (const t of threads.values()) {
      totalMessages += t.messages.length;
      totalInbound += t.inboundCount;
      totalOutbound += t.outboundCount;
      totalUnread += t.unreadCount;
      if (t.inboundCount === 0 && t.outboundCount > 0) outgoingOnlyContacts++;
    }
    res.json({
      ok: true,
      totalContacts: threads.size,
      totalMessages, totalInbound, totalOutbound, totalUnread,
      outgoingOnlyContacts,
      // Delivery callbacks we received for messages that were never recorded as
      // sent. Should trend to zero once outbound-ingest.js is running; a large
      // number means some sender is still invisible to the inbox.
      unmatchedStatuses: threads._unmatchedStatuses || 0,
      pm2Fallback: PM2_FALLBACK,
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  res.write('data: ' + JSON.stringify({ type: 'connected', ts: Date.now() }) + '\n\n');
  sseClients.add(res);
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); }
  }, 30000);
  req.on('close', () => { sseClients.delete(res); clearInterval(hb); });
});

// ── Delete / unsend a message ─────────────────────────────────────────────────
// Calls the whatsapp.js /delete endpoint (which proxies to AOC), then patches
// the JSONL entry so the bubble renders as "This message was deleted".
router.post('/delete-message', async (req, res) => {
  try {
    const { messageId, phone } = req.body || {};
    if (!messageId) return res.status(400).json({ ok: false, error: 'messageId required' });

    // Proxy to whatsapp.js delete endpoint
    const WA_PORT = process.env.WHATSAPP_PORT || 4292;
    let aocOk = false;
    let aocError = null;
    try {
      const axios = require('axios');
      const r = await axios.post(`http://127.0.0.1:${WA_PORT}/delete`, { messageId }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      aocOk = r.data && r.data.ok;
      if (!aocOk) aocError = r.data && r.data.error;
    } catch (e) {
      aocError = e.message;
    }

    // Patch the JSONL regardless of AOC result (AOC sometimes returns error even
    // when delete succeeds, and we always want the UI to reflect the deletion).
    try {
      const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.jsonl')).sort().reverse();
      for (const file of files) {
        const filePath = path.join(LOG_DIR, file);
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        let patched = false;
        const newLines = lines.map(line => {
          if (!line.trim()) return line;
          try {
            const entry = JSON.parse(line);
            if (entry.messageId === messageId || entry.messageId === messageId + ':1') {
              patched = true;
              return JSON.stringify({ ...entry, type: 'deleted', body: 'This message was deleted', deletedAt: Date.now() });
            }
          } catch { /* not JSON */ }
          return line;
        });
        if (patched) {
          fs.writeFileSync(filePath, newLines.join('\n'));
          invalidateCache();
          broadcastUpdate();
          break;
        }
      }
    } catch (patchErr) {
      console.error('[WA-UI] delete-message patch error:', patchErr.message);
    }

    res.json({ ok: true, aocOk, aocError });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.invalidateCache = invalidateCache;
module.exports = router;