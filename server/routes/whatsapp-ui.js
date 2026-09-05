'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_DIR = path.join(__dirname, '..', 'webhook-logs');
const PM2_LOG = path.join(
  process.env.PM2_HOME || path.join(require('os').homedir(), '.pm2'),
  'logs', 'whatsapp-out.log'
);
const WHATSAPP_PORT = process.env.WHATSAPP_PORT || 4292;

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

// ── PM2 outgoing message parser ────────────────────────────────────────────────
function parsePm2OutgoingMessages() {
  const outgoing = new Map();
  if (!fs.existsSync(PM2_LOG)) return outgoing;
  try {
    const lines = fs.readFileSync(PM2_LOG, 'utf8').split('\n');
    const PREFIX = /^\d+\|whatsapp\s*\|\s*/;
    const strip = (l) => l.replace(PREFIX, '').trim();
    let inBlock = false;
    let cur = {};
    let blockLen = 0;
    for (const raw of lines) {
      if (!PREFIX.test(raw)) { inBlock = false; continue; }
      const line = strip(raw);
      if (line.startsWith('from:') && line.includes('+15554884507')) {
        inBlock = true; cur = {}; blockLen = 1; continue;
      }
      if (!inBlock) continue;
      blockLen++;
      const toM = line.match(/^to:\s*'?([+\d]+)'?/);
      if (toM) cur.to = toM[1].replace(/\D/g, '').slice(-12);
      const typeM = line.match(/^type:\s*'(\w+)'/);
      if (typeM) cur.type = typeM[1];
      const midM = line.match(/^messageId:\s*'([^']+)'/);
      if (midM) cur.messageId = midM[1];
      const tplM = line.match(/^templateName:\s*'([^']+)'/);
      if (tplM) cur.templateName = tplM[1];
      const bodyM = line.match(/body:\s*'(.*?)'/);
      if (bodyM) cur.body = bodyM[1];
      if (line === '}' && blockLen > 2) {
        if (cur.to) {
          const key = cur.messageId || (cur.to + '_' + Date.now());
          outgoing.set(key, {
            to: cur.to, type: cur.type || 'text',
            body: cur.body || cur.templateName || 'Sent',
            templateName: cur.templateName, messageId: cur.messageId
          });
        }
        inBlock = false; cur = {}; blockLen = 0;
      }
    }
  } catch (e) { console.error('[WA-UI] PM2 parse error:', e.message); }
  return outgoing;
}

// ── Conversation builder ───────────────────────────────────────────────────────
function formatPhone(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+91 ' + d.slice(2, 7) + ' ' + d.slice(7);
  return '+' + d;
}

function buildConversations() {
  const entries = readAllLogs({ daysBack: 60 });
  const outgoingMap = parsePm2OutgoingMessages();
  const threads = new Map();

  function getOrCreate(phone) {
    const p10 = String(phone).replace(/\D/g, '').slice(-10);
    if (!threads.has(p10)) {
      threads.set(p10, {
        phone: p10, displayPhone: formatPhone(phone), name: null,
        messages: [], lastMessageAt: 0, unreadCount: 0, _seen: new Set()
      });
    }
    return threads.get(p10);
  }

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
      let body = '';
      let imageUrl = null;
      let interactiveTitle = null;
      if (msgType === 'text') {
        body = (p.messages && p.messages.text && p.messages.text.body) || '';
      } else if (msgType === 'image') {
        imageUrl = (p.messages && p.messages.image && p.messages.image.url) || null;
        body = 'Photo';
      } else if (msgType === 'interactive') {
        const intv = p.messages && p.messages.interactive;
        const btnR = intv && ((intv.text && intv.text.button_reply) || intv.button_reply);
        const listR = intv && intv.list_reply;
        interactiveTitle = (btnR && btnR.title) || (listR && listR.title) || 'Reply';
        body = interactiveTitle;
      } else if (msgType === 'order') { body = 'Catalogue Order';
      } else if (msgType === 'audio') { body = 'Voice message';
      } else if (msgType === 'video') { body = 'Video';
      } else if (msgType === 'document') { body = 'Document';
      } else { body = msgType; }
      const msgTs = (p.messages && p.messages.timestamp)
        ? (p.messages.timestamp > 1e12 ? p.messages.timestamp : p.messages.timestamp * 1000)
        : ts;
      thread.messages.push({
        id: msgId, direction: 'inbound', type: msgType,
        body, imageUrl, interactiveTitle, timestamp: msgTs, status: 'received'
      });
      if (msgTs > thread.lastMessageAt) thread.lastMessageAt = msgTs;
      thread.unreadCount++;

    } else if (p.event === 'message_status') {
      const msgId = p.messageId;
      const status = p.statuses && p.statuses.status;
      const statusTs = p.statuses && p.statuses.timestamp
        ? Number(p.statuses.timestamp) * 1000 : ts;
      if (!msgId || !status) continue;
      const outInfo = outgoingMap.get(msgId);
      if (!outInfo || !outInfo.to) continue;
      const thread = getOrCreate(outInfo.to);
      const existing = thread.messages.find((m) => m.id === msgId);
      const statusOrder = { sent: 1, delivered: 2, read: 3, failed: -1 };
      if (existing) {
        if ((statusOrder[status] || 0) > (statusOrder[existing.status] || 0)) {
          existing.status = status;
        }
      } else {
        thread.messages.push({
          id: msgId, direction: 'outbound',
          type: (outInfo && outInfo.type) || 'text',
          body: (outInfo && outInfo.body) || (outInfo && outInfo.templateName ? outInfo.templateName : 'Sent'),
          templateName: outInfo && outInfo.templateName,
          timestamp: statusTs, status
        });
        if (statusTs > thread.lastMessageAt) thread.lastMessageAt = statusTs;
      }
    }
  }

  for (const thread of threads.values()) {
    thread.messages.sort((a, b) => a.timestamp - b.timestamp);
    delete thread._seen;
  }
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

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/conversations', (req, res) => {
  try {
    const threads = getCachedConversations();
    const search = (req.query.search || '').toLowerCase();
    const filter = req.query.filter || 'all';
    let list = Array.from(threads.values());
    if (search) {
      list = list.filter((t) =>
        (t.name || '').toLowerCase().includes(search) ||
        t.phone.includes(search) ||
        t.displayPhone.includes(search)
      );
    }
    if (filter === 'unread') list = list.filter((t) => t.unreadCount > 0);
    list.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    const result = list.map((t) => {
      const lastMsg = t.messages[t.messages.length - 1];
      return {
        phone: t.phone,
        displayPhone: t.displayPhone,
        name: t.name || t.displayPhone,
        lastMessage: (lastMsg && lastMsg.body) || '',
        lastMessageAt: t.lastMessageAt,
        lastMessageDirection: (lastMsg && lastMsg.direction) || 'inbound',
        lastMessageStatus: lastMsg && lastMsg.status,
        unreadCount: t.unreadCount,
        messageCount: t.messages.length
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
    const phone = String(req.query.phone || '').replace(/\D/g, '').slice(-10);
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
      ok: true, phone, name: thread.name, displayPhone: thread.displayPhone,
      messages: msgs.slice(start, end), total, page, hasMore: start > 0
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
    if (!to || !msgBody) return res.status(400).json({ ok: false, error: 'Missing to or body' });
    const payload = {
      to: String(to).startsWith('+') ? to : ('+' + to),
      type: 'text',
      text: { body: String(msgBody) }
    };
    const result = await axios.post(
      'http://127.0.0.1:' + WHATSAPP_PORT + '/send',
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000, validateStatus: () => true }
    );
    invalidateCache();
    res.status(result.status).json(Object.assign({ ok: result.status >= 200 && result.status < 300 }, result.data));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const threads = getCachedConversations();
    let totalMessages = 0, totalInbound = 0, totalOutbound = 0, totalUnread = 0;
    for (const t of threads.values()) {
      totalMessages += t.messages.length;
      totalInbound += t.messages.filter((m) => m.direction === 'inbound').length;
      totalOutbound += t.messages.filter((m) => m.direction === 'outbound').length;
      totalUnread += t.unreadCount;
    }
    res.json({ ok: true, totalContacts: threads.size, totalMessages, totalInbound, totalOutbound, totalUnread });
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

router.invalidateCache = invalidateCache;
module.exports = router;
