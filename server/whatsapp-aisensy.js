/**
 * whatsapp-aisensy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone WhatsApp / AiSensy microservice — listens on port 4292.
 *
 * Reverse-proxy contract (handled by the main server in app.js):
 *   The proxy terminates TLS on server.ekta-enterprises.com, strips the
 *   /whatsapp prefix, and forwards the remainder to THIS process on :4292.
 *
 *   Public URL  →  Internal URL
 *   ──────────────────────────────────────────────────────────────────────────
 *   https://server.ekta-enterprises.com/whatsapp/webhook/aisensy
 *       →  http://127.0.0.1:4292/webhook/aisensy
 *
 *   https://server.ekta-enterprises.com/whatsapp/files/<anything>
 *       →  http://127.0.0.1:4292/files/<anything>
 *
 * To start independently:
 *   node whatsapp-aisensy.js
 *
 * Or add to your pm2 ecosystem:
 *   { name: 'whatsapp', script: 'whatsapp-aisensy.js', cwd: '<server dir>' }
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');

const app  = express();
const PORT = process.env.WHATSAPP_PORT || 4292;

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static media files ────────────────────────────────────────────────────────
// AiSensy can push media (images, documents, audio) here.
// Files are stored locally and served under /files/<filename>.
const FILES_DIR = path.join(__dirname, 'whatsapp-files');
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  console.log(`[WA] Created media directory: ${FILES_DIR}`);
}
app.use('/files', express.static(FILES_DIR));

// ── AiSensy webhook ───────────────────────────────────────────────────────────
/**
 * GET /webhook/aisensy
 * WhatsApp / AiSensy verification handshake.
 * AiSensy sends hub.verify_token + hub.challenge; we echo back the challenge.
 */
app.get('/webhook/aisensy', (req, res) => {
  const VERIFY_TOKEN = process.env.AISENSY_VERIFY_TOKEN || 'ekta_aisensy_token';

  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WA] Webhook verified by AiSensy');
    return res.status(200).send(challenge);
  }
  console.warn('[WA] Webhook verification failed — token mismatch');
  return res.sendStatus(403);
});

/**
 * POST /webhook/aisensy
 * Receives inbound WhatsApp messages, status updates, and delivery receipts
 * from AiSensy's platform.
 */
app.post('/webhook/aisensy', (req, res) => {
  const payload = req.body;
  console.log('[WA] Inbound webhook payload:', JSON.stringify(payload, null, 2));

  // ── Route by event type ───────────────────────────────────────────────────
  const entry   = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;

  if (value?.messages) {
    // Inbound message(s)
    for (const msg of value.messages) {
      handleInboundMessage(msg, value.metadata, value.contacts?.[0]);
    }
  }

  if (value?.statuses) {
    // Delivery / read receipts
    for (const status of value.statuses) {
      handleStatusUpdate(status);
    }
  }

  // AiSensy expects a 200 immediately — process async
  res.sendStatus(200);
});

// ── Handlers (extend these with your business logic) ─────────────────────────

function handleInboundMessage(msg, metadata, contact) {
  const from    = msg.from;             // sender's WhatsApp number (E.164)
  const name    = contact?.profile?.name || 'Unknown';
  const msgType = msg.type;             // text | image | document | audio | …

  console.log(`[WA] Message from ${name} (${from}) — type: ${msgType}`);

  if (msgType === 'text') {
    const body = msg.text?.body || '';
    console.log(`[WA]   Text: ${body}`);
    // TODO: route to your chatbot / CRM logic here
  } else if (msgType === 'image') {
    console.log(`[WA]   Image id: ${msg.image?.id}`);
    // TODO: download via AiSensy media API and save to FILES_DIR
  } else if (msgType === 'document') {
    console.log(`[WA]   Document: ${msg.document?.filename}`);
  }
  // … add handlers for audio, video, location, contacts, etc.
}

function handleStatusUpdate(status) {
  console.log(`[WA] Status update — id: ${status.id}  status: ${status.status}  to: ${status.recipient_id}`);
  // TODO: update message status in your database
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-aisensy', port: PORT });
});

// ── Start server ──────────────────────────────────────────────────────────────
const server = http.createServer(app);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[WA] WhatsApp / AiSensy service running on http://127.0.0.1:${PORT}`);
  console.log(`[WA] Webhook endpoint : /webhook/aisensy`);
  console.log(`[WA] Media files      : /files/<filename>`);
  console.log(`[WA] Reachable publicly via the main server at:`);
  console.log(`[WA]   https://server.ekta-enterprises.com/whatsapp/webhook/aisensy`);
  console.log(`[WA]   https://server.ekta-enterprises.com/whatsapp/files/<filename>`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[WA] Port ${PORT} already in use. Is whatsapp-aisensy already running?`);
    process.exit(1);
  }
  throw err;
});

module.exports = app; // exported for testing
