/**
 * whatsapp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone WhatsApp microservice — listens on port 4292.
 * Replaces the old whatsapp-aisensy.js. Sends via the AOC/CXBot WhatsApp API
 * (api.aoc-portal.com) and receives inbound messages/status updates via a
 * webhook registered on the CXBot dashboard (Generic provider).
 *
 * Reverse-proxy contract (handled by the main server in app.js):
 *   https://server.ekta-enterprises.com/whatsapp/webhook
 *       →  http://127.0.0.1:4292/webhook
 *
 * CXBot dashboard webhook config (Whatsapp App → Utility & Template → Webhook tab):
 *   Name: whatsapp-js-inbound | From Id: +15554884507 | Provider: Generic
 *   Endpoint: https://server.ekta-enterprises.com/whatsapp/webhook
 *
 * To start independently:
 *   node whatsapp.js
 *
 * pm2:
 *   pm2 start whatsapp.js --name whatsapp
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const axios = require('axios');

const app = express();
const PORT = process.env.WHATSAPP_PORT || 4292;

const AOC_WA_API_URL = process.env.AOC_WA_API_URL || 'https://api.aoc-portal.com/v1/whatsapp';
const AOC_WA_API_KEY = process.env.AOC_WA_API_KEY || '';
const AOC_WA_FROM = process.env.AOC_WA_FROM || '+15554884507';

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Webhook log storage ───────────────────────────────────────────────────────
// Every inbound webhook call (message, status, everything) is appended here as
// one JSON line per event, plus split into a per-day file for easy tailing.
const LOG_DIR = path.join(__dirname, 'webhook-logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logWebhookEvent(payload, meta = {}) {
  const entry = {
    receivedAt: new Date().toISOString(),
    ...meta,
    payload,
  };
  const line = JSON.stringify(entry) + '\n';

  // Rolling all-time log
  fs.appendFile(path.join(LOG_DIR, 'all.jsonl'), line, (err) => {
    if (err) console.error('[WA] Failed to write all.jsonl:', err.message);
  });

  // Per-day log for easier browsing
  const day = entry.receivedAt.slice(0, 10); // YYYY-MM-DD
  fs.appendFile(path.join(LOG_DIR, `${day}.jsonl`), line, (err) => {
    if (err) console.error(`[WA] Failed to write ${day}.jsonl:`, err.message);
  });

  return entry;
}

// ── Static media files ────────────────────────────────────────────────────────
const FILES_DIR = path.join(__dirname, 'whatsapp-files');
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  console.log(`[WA] Created media directory: ${FILES_DIR}`);
}
app.use('/files', express.static(FILES_DIR));

// ── Outbound send helper (AOC / CXBot API) ────────────────────────────────────
/**
 * Send a WhatsApp message via api.aoc-portal.com.
 * @param {string} to - recipient number, E.164 or bare digits (country code included)
 * @param {object} rest - remaining AOC payload fields (type, text/templateName/components/...)
 */
async function sendWhatsAppMessage(to, rest) {
  const body = {
    from: AOC_WA_FROM,
    to: String(to).startsWith('+') ? to : `+${to}`,
    ...rest,
  };
  const res = await axios.post(AOC_WA_API_URL, body, {
    headers: {
      apikey: AOC_WA_API_KEY,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
}

// ── Send endpoint (internal use — other services on this box call this) ──────
/**
 * POST /send
 * Body: { to, type: "text", text: { body } }              — plain text
 *    or { to, type: "template", templateName, components } — approved template
 */
app.post('/send', async (req, res) => {
  try {
    const { to, ...rest } = req.body || {};
    if (!to) return res.status(400).json({ error: true, message: 'Missing "to"' });
    const result = await sendWhatsAppMessage(to, rest);
    res.status(result.status).json(result.data);
  } catch (err) {
    console.error('[WA] /send error:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Inbound webhook (CXBot — Generic provider) ────────────────────────────────
/**
 * GET /webhook
 * Optional verification handshake (harmless no-op if CXBot ever probes it
 * the Meta/AiSensy way — echoes hub.challenge if present, else 200 OK).
 */
app.get('/webhook', (req, res) => {
  const challenge = req.query['hub.challenge'];
  if (challenge) return res.status(200).send(challenge);
  res.status(200).json({ status: 'ok', service: 'whatsapp-webhook' });
});

/**
 * POST /webhook
 * Receives every event CXBot sends (inbound messages, button/list replies,
 * status/delivery updates). Logs the full raw payload, then does light
 * routing for visibility in the console.
 */
const FMCG_API_PORT = process.env.FMCG_API_PORT || 3188;

/**
 * Forward the raw webhook payload to fmcg-api's /api/aoc handler, which owns
 * the BALANCE / LEDGER / LEDGER_OLD intent detection and AOC-API reply logic
 * (see fmcg/src/api-server.js). Fire-and-forget — this endpoint's own 200
 * response to CXBot must not wait on it.
 */
function forwardToFmcgApi(payload) {
  axios
    .post(`http://127.0.0.1:${FMCG_API_PORT}/api/aoc`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    })
    .catch((err) => {
      console.error('[WA WEBHOOK] Forward to fmcg-api /api/aoc failed:', err.message);
    });
}

app.post('/webhook', (req, res) => {
  const payload = req.body;

  const entry = logWebhookEvent(payload, {
    ip: req.ip || req.socket?.remoteAddress,
  });

  console.log('\n[WA WEBHOOK] Event received @', entry.receivedAt);
  console.dir(payload, { depth: null });

  forwardToFmcgApi(payload);

  // ── Best-effort routing for console visibility only; full payload is
  //    already persisted above regardless of shape. ──────────────────────────
  try {
    if (payload?.type === 'text' && payload?.text?.body) {
      console.log(`[WA WEBHOOK] Text from ${payload.from}: ${payload.text.body}`);
    } else if (payload?.type === 'interactive' && payload?.interactive) {
      const btn = payload.interactive.button_reply || payload.interactive.list_reply;
      if (btn) console.log(`[WA WEBHOOK] Button/list reply from ${payload.from}: ${btn.id} (${btn.title})`);
    } else if (payload?.status) {
      console.log(`[WA WEBHOOK] Status update: ${payload.status} for ${payload.messageId || payload.msgId}`);
    } else if (payload?.entry) {
      // Meta Cloud API shaped payload (defensive — in case CXBot ever sends this shape)
      const value = payload.entry?.[0]?.changes?.[0]?.value;
      if (value?.messages) {
        for (const msg of value.messages) {
          console.log(`[WA WEBHOOK] (cloud-api shape) Message from ${msg.from}, type ${msg.type}`);
        }
      }
      if (value?.statuses) {
        for (const st of value.statuses) {
          console.log(`[WA WEBHOOK] (cloud-api shape) Status ${st.status} for ${st.id}`);
        }
      }
    }
  } catch (routeErr) {
    console.error('[WA WEBHOOK] Routing/log error (payload still saved):', routeErr.message);
  }

  // Acknowledge immediately so CXBot doesn't retry.
  res.sendStatus(200);
});

/**
 * GET /webhook/logs
 * Quick inspection endpoint — returns the last N logged events (default 50).
 * Not exposed publicly beyond /whatsapp/webhook/logs via the main proxy.
 */
app.get('/webhook/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const file = path.join(LOG_DIR, 'all.jsonl');
  if (!fs.existsSync(file)) return res.json({ count: 0, events: [] });

  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  const tail = lines.slice(-limit).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { parseError: true, raw: l };
    }
  });
  res.json({ count: tail.length, totalLogged: lines.length, events: tail });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'whatsapp', port: PORT });
});

// ── Start server ──────────────────────────────────────────────────────────────
const server = http.createServer(app);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[WA] WhatsApp service running on http://127.0.0.1:${PORT}`);
  console.log(`[WA] Send endpoint    : POST /send`);
  console.log(`[WA] Webhook endpoint : /webhook`);
  console.log(`[WA] Webhook logs     : /webhook/logs  (also stored in ${LOG_DIR})`);
  console.log(`[WA] Media files      : /files/<filename>`);
  console.log(`[WA] Reachable publicly via the main server at:`);
  console.log(`[WA]   https://server.ekta-enterprises.com/whatsapp/webhook`);
  console.log(`[WA]   https://server.ekta-enterprises.com/whatsapp/send`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[WA] Port ${PORT} already in use. Is whatsapp already running?`);
    process.exit(1);
  }
  throw err;
});

module.exports = app;
