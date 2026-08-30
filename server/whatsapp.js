
// ============================================================================
// whatsapp.js (MERGED with auto-login aoc-orders.js and backfill-wa-orders.js)
// ============================================================================
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
 *
 * ── CATALOGUE ORDER ITEM DETAILS ────────────────────────────────────────────
 * CXBot's Generic webhook does NOT include the ordered line items — it only
 * sends { messages: { type:"order", timestamp } }. The items live in the
 * portal's own order report API, which ./aoc-orders.js pulls for us.
 * On every catalogue order we now:
 *   1. fetch the item-wise detail from the portal,
 *   2. append an "order_detail_resolved" line to the webhook log (so the
 *      jsonl logs finally carry the items),
 *   3. build a Meta-shaped messages.order.product_items and forward THAT to
 *      fmcg-api, so its existing product_items reader works unchanged,
 *   4. write the real items + total into db/app/orders.json.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const axios = require('axios');



// ── WhatsApp Catalogue Order → orders.json ────────────────────────────────────
const ORDERS_PATH = path.join(__dirname, 'db', 'app', 'orders.json');

/**
 * When a WhatsApp catalogue order is received (messages.type === "order"),
 * create a Pending order in orders.json for admin review.
 * @param {string} recipientPhone - customer's WhatsApp number (e.g. "919179174888")
 * @param {string} contactName    - display name from WhatsApp contacts field
 * @param {object} msgMeta        - messages object from the webhook payload
 * @param {object|null} orderDetail - normalised item-wise detail from ./aoc-orders
 */
async function handleWhatsAppCatalogueOrder(recipientPhone, contactName, msgMeta, orderDetail = null) {
  try {
    // Normalise phone: strip country code prefix, keep last 10 digits
    const phone10 = String(recipientPhone).replace(/\D/g, '').slice(-10);

    // ── Look up party in CMPL ──────────────────────────────────────────────
    let party = null;
    try {
      const cmplPath = path.join(process.env.DBF_FOLDER_PATH || '', 'data/json/CMPL.json');
      const raw = fs.readFileSync(cmplPath, 'utf8');
      const parties = JSON.parse(raw);
      const normalize = (s) => String(s || '').replace(/\D/g, '').slice(-10);
      party = parties.find(p =>
        normalize(p.C_MOBILE) === phone10 ||
        normalize(p.C_PHONE)  === phone10 ||
        normalize(p.WA_MOB)   === phone10
      ) || null;
    } catch (e) {
      console.warn('[WA ORDER] Could not read CMPL.json:', e.message);
    }

    const partyCode = party ? party.C_CODE : `WA_${phone10}`;
    const partyName = party ? party.C_NAME : (contactName || `WhatsApp ${phone10}`);

    // ── Compute next T-series bill number ──────────────────────────────────
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')); } catch (e) {}

    let maxTBill = 0;
    orders.forEach(o => {
      if (String(o.series || '').toUpperCase() === 'T') {
        const n = Number(o.billNo);
        if (!isNaN(n) && n > maxTBill) maxTBill = n;
      }
    });

    // Also check invoicing.json and approved/invoicing.json
    for (const invFile of [
      path.join(__dirname, 'db', 'invoicing.json'),
      path.join(__dirname, 'db', 'approved', 'invoicing.json'),
    ]) {
      try {
        const inv = JSON.parse(fs.readFileSync(invFile, 'utf8'));
        inv.forEach(e => {
          if (String(e.series || '').toUpperCase() === 'T') {
            const n = Number(e.billNo);
            if (!isNaN(n) && n > maxTBill) maxTBill = n;
          }
        });
      } catch (e) {}
    }

    const nextBillNo = maxTBill + 1;

    // ── Idempotency: don't create a second entry for the same catalogue order
    if (orderDetail?.orderId) {
      const dup = orders.find(o => o.waOrderId === orderDetail.orderId);
      if (dup) {
        console.log(`[WA ORDER] Catalogue order ${orderDetail.orderId} already stored as ${dup.id} — skipping`);
        return dup;
      }
    }

    // ── Build order entry ──────────────────────────────────────────────────
    const items = orderDetail?.items || [];
    const totalAmount = orderDetail
      ? Number(orderDetail.totalAmount || 0)
      : 0;

    const notes = items.length
      ? `WhatsApp Catalogue Order — phone: ${phone10}${contactName ? ` (${contactName})` : ''}. ` +
        `${items.length} item(s): ` +
        items.map(i => `${i.name} x${i.qty} @ ${i.rate}`).join(', ') + '.'
      : `WhatsApp Catalogue Order — phone: ${phone10}${contactName ? ` (${contactName})` : ''}. ` +
        `Item details could not be fetched from the CXBot portal — please confirm items with customer.`;

    const newOrder = {
      id: `T${nextBillNo}`,
      series: 'T',
      billNo: nextBillNo,
      date: new Date().toISOString(),
      status: 'Pending',
      partyCode,
      partyName,
      items,
      totalAmount,
      customDiscount: orderDetail?.discount || 0,
      tax: orderDetail?.tax || 0,
      shipping: orderDetail?.shipping || 0,
      subtotal: orderDetail?.subtotal || totalAmount,
      currency: orderDetail?.currency || 'INR',
      notes,
      source: 'whatsapp_catalogue',
      waPhone: phone10,
      waMessageId: msgMeta?.messageId || null,
      waOrderId: orderDetail?.orderId || null,
      waCatalogId: orderDetail?.catalogId || null,
      itemsResolved: items.length > 0,
    };

    orders.push(newOrder);
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));
    console.log(
      `[WA ORDER] Created Pending order ${newOrder.id} for ${partyName} (${phone10}) — ` +
      `${items.length} item(s), total ${newOrder.currency} ${totalAmount}`
    );

    // Mirror to DBF folder if configured
    if (process.env.DBF_FOLDER_PATH) {
      const mirrorPath = path.join(process.env.DBF_FOLDER_PATH, 'orders', 'orders.json');
      try {
        fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
        fs.writeFileSync(mirrorPath, JSON.stringify(orders, null, 2));
      } catch (e) {
        console.error('[WA ORDER] Mirror write failed:', e.message);
      }
    }

    return newOrder;
  } catch (err) {
    console.error('[WA ORDER] handleWhatsAppCatalogueOrder error:', err);
    return null;
  }
}

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

/** Is this webhook payload a WhatsApp Commerce catalogue order? */
function isCatalogueOrder(payload) {
  return payload?.event === 'message_received' && payload?.messages?.type === 'order';
}

/**
 * Catalogue-order pipeline: resolve items → log them → forward enriched
 * payload → persist the order. Runs off the request path; the webhook has
 * already been ACKed by the time this does its work.
 */
async function processCatalogueOrder(payload) {
  const recipient    = payload?.contacts?.recipient || '';
  const contactName  = payload?.contacts?.profileName || '';
  const timestampMs  = payload?.messages?.timestamp;

  console.log(`[WA WEBHOOK] 📦 Catalogue order from ${recipient} (${contactName}) — fetching item details`);

  let detail = null;
  try {
    detail = await fetchCatalogueOrderDetail(recipient, timestampMs);
  } catch (e) {
    console.error('[WA WEBHOOK] Order detail fetch threw:', e.message);
  }

  // ── 1. Put the item-wise detail into the webhook logs ────────────────────
  logWebhookEvent(
    {
      channel: payload?.channel || 'whatsapp',
      messageId: payload?.messageId || null,
      from: payload?.from || null,
      event: 'order_detail_resolved',
      resolved: Boolean(detail),
      contacts: payload?.contacts || null,
      messages: payload?.messages || null,
      order: detail
        ? {
            orderId: detail.orderId,
            catalog_id: detail.catalogId,
            status: detail.status,
            currency: detail.currency,
            itemCount: detail.itemCount,
            items: detail.items,
            product_items: detail.product_items,
            subtotal: detail.subtotal,
            tax: detail.tax,
            discount: detail.discount,
            shipping: detail.shipping,
            totalAmount: detail.totalAmount,
            portalCreatedAt: detail.createdAt,
            matchDeltaMs: detail.matchDeltaMs,
            matchAttempt: detail.matchAttempt,
          }
        : null,
      error: detail ? null : 'No matching order record found in CXBot waOrderReports',
    },
    { ip: '127.0.0.1', source: 'aoc-order-enrichment' }
  );

  if (detail) {
    console.log(
      `[WA WEBHOOK] 📦 Resolved order ${detail.orderId} — ` +
      detail.items.map(i => `${i.name} x${i.qty} @ ${i.rate}`).join(', ') +
      ` | total ${detail.currency} ${detail.totalAmount}`
    );
  } else {
    console.warn(`[WA WEBHOOK] ⚠️  Could not resolve item details for ${recipient}`);
  }

  // ── 2. Forward an ENRICHED payload to fmcg-api ───────────────────────────
  // fmcg/src/api-server.js already reads msgObj.order?.product_items, so
  // filling it in makes that handler work with zero changes there.
  const enriched = JSON.parse(JSON.stringify(payload));
  if (detail) {
    enriched.messages = enriched.messages || {};
    enriched.messages.order = {
      catalog_id: detail.catalogId,
      order_id: detail.orderId,
      text: '',
      product_items: detail.product_items,
    };
    // Convenience copy for anything that prefers the flat shape.
    enriched.order_detail = detail.raw?.order_detail || null;
  }
  forwardToFmcgApi(enriched);

  // ── 3. Persist the order with real items ─────────────────────────────────
  await handleWhatsAppCatalogueOrder(recipient, contactName, payload, detail);
}

app.post('/webhook', (req, res) => {
  const payload = req.body;

  const entry = logWebhookEvent(payload, {
    ip: req.ip || req.socket?.remoteAddress,
  });

  console.log('\n[WA WEBHOOK] Event received @', entry.receivedAt);
  console.dir(payload, { depth: null });

  // ── Detect WhatsApp Catalogue Orders ──────────────────────────────────────
  // CXBot fires event:"message_received" with messages.type:"order" when a
  // customer places an order from the WhatsApp catalogue, but WITHOUT the line
  // items. processCatalogueOrder() fetches them from the portal, logs them,
  // and forwards the enriched payload — so we must NOT also forward the raw
  // one here, or fmcg-api would reply to the customer twice.
  try {
    if (isCatalogueOrder(payload)) {
      processCatalogueOrder(payload).catch((e) =>
        console.error('[WA WEBHOOK] processCatalogueOrder error:', e.message)
      );
    } else {
      forwardToFmcgApi(payload);
    }
  } catch (orderErr) {
    console.error('[WA WEBHOOK] Catalogue order handler error:', orderErr.message);
    forwardToFmcgApi(payload); // don't lose the event if routing blew up
  }

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

/**
 * GET /webhook/orders
 * Item-wise catalogue orders straight from the CXBot portal — handy for
 * checking that the AOC_WA_REPORTS_TOKEN / apikey auth is working.
 *   /webhook/orders?limit=10
 */
app.get('/webhook/orders', async (req, res) => {
  
  const length = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const records = await fetchOrderPage({ start: 0, length });
  res.json({
    count: records.length,
    orders: records.map(normaliseRecord).map(({ raw, ...rest }) => rest),
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'whatsapp', port: PORT });
});

// ── Start server ──────────────────────────────────────────────────────────────





// ============================================================================
// ── AOC ORDERS LOGIC ────────────────────────────────────────────────────────
// ============================================================================
/**
 * aoc-orders.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches item-wise WhatsApp Catalogue order details from the CXBot / AOC
 * portal — logging itself in and refreshing its own session, so there is
 * nothing to paste and nothing to re-paste when a session expires.
 *
 * SETUP — two lines in .env, that's it:
 *
 *     AOC_PORTAL_USERNAME=ektaenterprises
 *     AOC_PORTAL_PASSWORD=your-portal-password
 *
 * Then:  node aoc-orders.js --check
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * CXBot's webhook cannot send you the ordered items. Its dashboard documents
 * exactly seven webhook events (Whatsapp App → Utility & Template →
 * WA Utilities → Webhook → Event List):
 *
 *     status_update · status_failed · button_reply · list_reply ·
 *     location_message · user_initiated_messages(Text) ·
 *     user_initiated_messages(Image)
 *
 * There is no order event, so a catalogue order arrives as a bare envelope:
 *
 *     { event:"message_received",
 *       contacts:{ profileName, recipient },
 *       messages:{ type:"order", timestamp: 1788060253559 } }
 *
 * The public apikey API (developers.aoc-portal.com) documents SMS, OTP,
 * WhatsApp send, RCS, CleverTap and MoEngage — no order/report endpoint, so
 * AOC_WA_API_KEY cannot fetch orders either.
 *
 * The items exist only behind the dashboard login:
 *
 *     POST https://aggregate.aoc-portal.com/api/v1/whatsapp/waOrderReports
 *     { filter:{}, searching:"", start:0, length:10, sorting:{createdAt:-1} }
 *
 *     { recipient_id:"919179174888", createdAt:1788060253802,
 *       orderId:"0457088184", currency:"INR", wamid:"",
 *       order_detail:{ catalog_id:"2096562154401847",
 *                      items:[{ name:"GJ737", retailer_id:"GJ737",
 *                               amount:{value:26000, offset:100}, quantity:1 }],
 *                      subtotal:{…}, totalAmount:{value:26000, offset:100} } }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW THE SESSION IS KEPT ALIVE (this is the "why paste a token" answer)
 *
 * The host is the dashboard's own backend, so it is CSRF-protected and
 * session-authenticated. This module simply does what the browser does:
 *
 *     1. GET  /getcsrf          → { csrfToken, expiresAt }   (+ cookies)
 *     2. POST /auth/login       → { username, password }      (+ session cookies)
 *     3. POST /api/v1/whatsapp/waOrderReports
 *
 * Cookies are kept in an in-process jar; the CSRF token is cached until just
 * before `expiresAt`. If any call comes back 401/403 the whole handshake is
 * replayed once and the request is retried. So an expired session heals
 * itself on the very next order — no manual step, ever.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THINGS THAT WILL BITE YOU
 *
 * · `wamid` is empty on every record, so the webhook's messageId cannot be
 *   used to join. We join on recipient_id + createdAt ≈ messages.timestamp
 *   (observed drift on real orders: 73 ms and 243 ms).
 * · Money is fixed-point: rupees = amount.value / amount.offset
 *   (26000 / 100 = ₹260).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLI
 *   node aoc-orders.js --check       # log in, verify, print a verdict
 *   node aoc-orders.js --list [n]    # print the last n orders, item-wise
 */





const REPORTS_URL =
  process.env.AOC_WA_REPORTS_URL ||
  'https://aggregate.aoc-portal.com/api/v1/whatsapp/waOrderReports';

const ORIGIN = new URL(REPORTS_URL).origin;
const CSRF_URL  = process.env.AOC_WA_CSRF_URL  || `${ORIGIN}/getcsrf`;
const LOGIN_URL = process.env.AOC_PORTAL_LOGIN_URL || `${ORIGIN}/api/v1/user/login`;

const USERNAME = process.env.AOC_PORTAL_USERNAME || '';
const PASSWORD = process.env.AOC_PORTAL_PASSWORD || '';

// Optional escape hatches — only needed if auto-login ever stops working.
const MANUAL_TOKEN  = process.env.AOC_WA_REPORTS_TOKEN || '';
const MANUAL_COOKIE = process.env.AOC_PORTAL_COOKIE || '';

const RETRY_DELAYS_MS = (process.env.AOC_WA_ORDER_RETRIES || '1500,4000,9000,20000')
  .split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));

const MATCH_WINDOW_MS = parseInt(process.env.AOC_WA_ORDER_MATCH_WINDOW_MS || '180000', 10);
const PAGE_SIZE = parseInt(process.env.AOC_WA_ORDER_PAGE_SIZE || '50', 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Last 10 digits — makes 919179174888 / +919179174888 / 9179174888 all equal. */
function phone10(v) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

/** Fixed-point money → plain number. { value: 26000, offset: 100 } → 260 */
function money(m) {
  if (m == null) return 0;
  if (typeof m === 'number') return m;
  const value = Number(m.value) || 0;
  const offset = Number(m.offset) || 1;
  return value / offset;
}

// ── Cookie jar ────────────────────────────────────────────────────────────────
// axios in Node does not persist cookies; the login response's session cookies
// have to be replayed on later calls. Kept tiny so there's no new dependency.
const jar = new Map();

function absorbCookies(res) {
  const set = res?.headers?.['set-cookie'];
  if (!Array.isArray(set)) return;
  for (const raw of set) {
    const [pair] = String(raw).split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

function cookieHeader() {
  const parts = [];
  if (MANUAL_COOKIE) parts.push(MANUAL_COOKIE.replace(/^Cookie:\s*/i, '').trim());
  for (const [k, v] of jar) parts.push(`${k}=${v}`);
  return parts.join('; ');
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// ── CSRF ──────────────────────────────────────────────────────────────────────
let csrf = { token: null, expiresAtMs: 0 };

async function getCsrfToken(force = false) {
  const now = Date.now();
  if (!force && csrf.token && now < csrf.expiresAtMs - 30000) return csrf.token;

  try {
    const res = await axios.get(CSRF_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {})
      },
      timeout: 10000, validateStatus: () => true,
    });
    absorbCookies(res);

    if (res.status !== 200 || !res.data?.csrfToken) {
      console.error(`[AOC ORDERS] getcsrf failed (HTTP ${res.status})`);
      return null;
    }
    const exp = res.data.expiresAt;
    const expMs = typeof exp === 'number'
      ? (exp < 1e12 ? exp * 1000 : exp)             // seconds vs milliseconds
      : (Date.parse(exp) || now + 5 * 60 * 1000);   // ISO string, else assume 5 min

    csrf = { token: res.data.csrfToken, expiresAtMs: expMs };
    return csrf.token;
  } catch (err) {
    console.error('[AOC ORDERS] getcsrf request failed:', err.message);
    return null;
  }
}

function baseHeaders(token) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT };
  const auth = session.token || MANUAL_TOKEN;
  if (auth) h.Authorization = /^bearer\s/i.test(auth) ? auth : `Bearer ${auth}`;
  const cookie = cookieHeader();
  if (cookie) h.Cookie = cookie;
  if (token) {
    // The portal sends the CSRF value under both names; mirror that exactly.
    h['X-Csrf-Token'] = token;
    h['X-CSRF-Token-Stored'] = token;
  }
  return h;
}

// ── Auto-login ────────────────────────────────────────────────────────────────
let session = { token: null, at: 0, lastError: null };

/** Depth-first hunt for a bearer-ish token in whatever shape login returns. */
function findToken(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  const KEY = /^(access[_-]?token|auth[_-]?token|id[_-]?token|token|jwt)$/i;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > 20 && KEY.test(k)) return v;
  }
  for (const v of Object.values(obj)) {
    const found = findToken(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Log in to the portal. Safe to call repeatedly — it is a no-op while the
 * current session still looks good unless `force` is set.
 */
async function login(force = false) {
  if (MANUAL_TOKEN || MANUAL_COOKIE) return true;   // caller supplied credentials
  if (!USERNAME || !PASSWORD) {
    session.lastError = 'AOC_PORTAL_USERNAME / AOC_PORTAL_PASSWORD not set in .env';
    return false;
  }
  if (!force && session.at && Date.now() - session.at < 30 * 60 * 1000) return true;

  // Start clean so a stale cookie can't poison the new session.
  jar.clear();
  csrf = { token: null, expiresAtMs: 0 };

  const token = await getCsrfToken(true);
  if (!token) { session.lastError = 'could not obtain a CSRF token'; return false; }

  try {
    const res = await axios.post(
      LOGIN_URL,
      { username: USERNAME, password: PASSWORD, domain: 'omni.azmarq.com' },
      { headers: baseHeaders(token), timeout: 15000, validateStatus: () => true }
    );
    absorbCookies(res);

    if (res.status !== 200 && res.status !== 201) {
      // Never echo the response body — it can carry tokens.
      session.lastError = `login returned HTTP ${res.status}`;
      console.error(`[AOC ORDERS] Login failed (HTTP ${res.status})`);
      return false;
    }

    session = { token: findToken(res.data), at: Date.now(), lastError: null };

    if (!session.token && jar.size === 0) {
      session.lastError = 'login succeeded but returned neither a token nor cookies';
      console.error('[AOC ORDERS] ' + session.lastError);
      return false;
    }
    console.log(
      `[AOC ORDERS] Logged in as ${USERNAME} ` +
      `(${session.token ? 'bearer token' : 'session cookie'}${jar.size ? `, ${jar.size} cookie(s)` : ''})`
    );
    return true;
  } catch (err) {
    session.lastError = err.message;
    console.error('[AOC ORDERS] Login request failed:', err.message);
    return false;
  }
}

// ── Order report ──────────────────────────────────────────────────────────────
/**
 * One page of the order report. Returns { records, status, error }.
 * Never throws. Re-logs-in and retries once on 401/403.
 */
async function fetchOrderPageDetailed({ start = 0, length = PAGE_SIZE, searching = '' } = {}) {
  const body = { filter: {}, searching, start, length, sorting: { createdAt: -1 } };

  for (let attempt = 0; attempt < 2; attempt++) {
    const ok = await login(attempt > 0);   // attempt 1 forces a fresh login
    if (!ok) return { records: [], status: 401, error: session.lastError || 'not authenticated' };

    const token = await getCsrfToken(attempt > 0);

    try {
      const res = await axios.post(REPORTS_URL, body, {
        headers: baseHeaders(token), timeout: 15000, validateStatus: () => true,
      });
      absorbCookies(res);

      if (res.status === 200) {
        return { records: res.data?.data?.record || [], status: 200, error: null };
      }

      const snippet = typeof res.data === 'string'
        ? res.data.slice(0, 200)
        : JSON.stringify(res.data || {}).slice(0, 200);

      // Expired session or stale CSRF → full re-handshake, then retry once.
      if ((res.status === 401 || res.status === 403) && attempt === 0) {
        console.warn(`[AOC ORDERS] HTTP ${res.status} — session looks stale, logging in again`);
        session = { token: null, at: 0, lastError: null };
        continue;
      }
      return { records: [], status: res.status, error: snippet };
    } catch (err) {
      return { records: [], status: 0, error: err.message };
    }
  }
  return { records: [], status: 0, error: 'exhausted retries' };
}

/** Back-compat: array-only wrapper. */
async function fetchOrderPage(opts) {
  const { records, status, error } = await fetchOrderPageDetailed(opts);
  if (status !== 200) console.error(`[AOC ORDERS] waOrderReports HTTP ${status}: ${error}`);
  return records;
}

/** Normalise a portal record into a flat, item-wise shape. */
function normaliseRecord(rec) {
  const d = rec.order_detail || {};
  const rawItems = Array.isArray(d.items) ? d.items : [];
  const currency = rec.currency || 'INR';

  const items = rawItems.map((it) => {
    const rate = money(it.amount);
    const qty = Number(it.quantity) || 1;
    return {
      code: it.retailer_id || it.product_retailer_id || null,
      name: it.name || it.retailer_id || 'Unknown item',
      qty, rate,
      amount: Number((rate * qty).toFixed(2)),
      currency,
    };
  });

  const lineTotal = items.reduce((s, i) => s + i.amount, 0);

  return {
    orderId: rec.orderId || null,
    catalogId: d.catalog_id || null,
    currency,
    status: d.status || rec.status || 'pending',
    recipient: rec.recipient_id || null,
    profileName: rec.profileName || null,
    createdAt: rec.createdAt || null,
    items,
    itemCount: items.length,
    subtotal: money(d.subtotal) || lineTotal,
    tax: money(d.tax),
    discount: money(d.discount),
    shipping: money(d.shipping),
    totalAmount: money(d.totalAmount) || lineTotal,
    // Meta Cloud API shape — lets existing `msgObj.order.product_items`
    // consumers (fmcg/src/api-server.js) work unchanged.
    product_items: rawItems.map((it) => ({
      product_retailer_id: it.retailer_id || it.product_retailer_id || null,
      quantity: Number(it.quantity) || 1,
      item_price: money(it.amount),
      currency,
    })),
    raw: rec,
  };
}

/**
 * Find the catalogue order matching a webhook event.
 * @param {string} recipient   contacts.recipient from the webhook
 * @param {number} timestampMs messages.timestamp from the webhook (ms)
 * @returns {Promise<object|null>} normalised order detail, or null
 */
async function fetchCatalogueOrderDetail(recipient, timestampMs, opts = {}) {
  const wantPhone = phone10(recipient);
  const ts = Number(timestampMs) || Date.now();
  const attempts = opts.retry === false ? [0] : [0, ...RETRY_DELAYS_MS];

  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await sleep(attempts[i]);

    const { records, status, error } = await fetchOrderPageDetailed({ start: 0, length: PAGE_SIZE });

    if (status !== 200) {
      console.error(`[AOC ORDERS] Report unavailable (HTTP ${status}): ${error}`);
      if (status === 401 || status === 403) {
        // fetchOrderPageDetailed already retried with a fresh login; if it
        // still fails the credentials themselves are wrong.
        console.error('[AOC ORDERS] → check AOC_PORTAL_USERNAME / AOC_PORTAL_PASSWORD (node aoc-orders.js --check)');
        return null;
      }
      continue;
    }

    let best = null, bestDelta = Infinity;
    for (const rec of records) {
      if (phone10(rec.recipient_id) !== wantPhone) continue;
      if (!rec.order_detail?.items?.length) continue;
      const delta = Math.abs((Number(rec.createdAt) || 0) - ts);
      if (delta < bestDelta) { bestDelta = delta; best = rec; }
    }

    if (best && bestDelta <= MATCH_WINDOW_MS) {
      const detail = normaliseRecord(best);
      detail.matchDeltaMs = bestDelta;
      detail.matchAttempt = i + 1;
      return detail;
    }

    console.warn(
      best
        ? `[AOC ORDERS] Closest record for ${wantPhone} is ${bestDelta}ms away (window ${MATCH_WINDOW_MS}ms) — attempt ${i + 1}/${attempts.length}`
        : `[AOC ORDERS] No record yet for ${wantPhone} — attempt ${i + 1}/${attempts.length}`
    );
  }
  return null;
}

/** Human-readable diagnosis. Never prints secrets. */
async function checkAuth() {
  console.log('Login endpoint  :', LOGIN_URL);
  console.log('CSRF endpoint   :', CSRF_URL);
  console.log('Report endpoint :', REPORTS_URL);
  console.log('Username        :', USERNAME || 'NOT SET');
  console.log('Password        :', PASSWORD ? 'set' : 'NOT SET');
  if (MANUAL_TOKEN || MANUAL_COOKIE) console.log('(manual token/cookie set — auto-login is bypassed)');
  console.log('');

  if (!await getCsrfToken(true)) { console.log('✗ Could not reach /getcsrf'); return false; }
  console.log('✓ CSRF token obtained');

  if (!await login(true)) { console.log(`✗ Login failed: ${session.lastError}`); return false; }
  console.log('✓ Logged in');

  const { records, status, error } = await fetchOrderPageDetailed({ length: 1 });
  if (status === 200) {
    console.log(`✓ waOrderReports OK — ${records.length} record(s). Everything is working.`);
    console.log('');
    console.log('  Nothing to maintain: if the session ever expires, the next order');
    console.log('  triggers a fresh login automatically.');
    return true;
  }
  console.log(`✗ waOrderReports HTTP ${status}: ${error}`);
  return false;
}





// ============================================================================
// ── BACKFILL LOGIC ──────────────────────────────────────────────────────────
// ============================================================================

/**
 * backfill-wa-orders.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot repair for catalogue orders that were logged BEFORE the enrichment
 * fix went in — i.e. every webhook-logs line that is
 * `event:"message_received"` + `messages.type:"order"` with no item detail.
 *
 * For each such event it pulls the matching record from the CXBot portal and:
 *   • appends an `order_detail_resolved` line to webhook-logs/<day>.jsonl
 *     and webhook-logs/all.jsonl  (so the logs carry the items),
 *   • back-fills items / totalAmount on the matching db/app/orders.json entry.
 *
 * Usage:
 *   node backfill-wa-orders.js                 # all days in webhook-logs/
 *   node backfill-wa-orders.js 2026-08-30      # one day
 *   node backfill-wa-orders.js --dry-run       # show what it would do
 */

















function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch { return { __parseError: true, __line: i + 1, raw: l }; }
  });
}

function appendLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  const day = entry.receivedAt.slice(0, 10);
  fs.appendFileSync(path.join(LOG_DIR, 'all.jsonl'), line);
  fs.appendFileSync(path.join(LOG_DIR, `${day}.jsonl`), line);
}

async function runBackfill(DRY, dayFilter) {
  const dayFiles = fs.readdirSync(LOG_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .filter(f => !dayFilter || f === `${dayFilter}.jsonl`)
    .sort();

  if (!dayFiles.length) {
    console.log('No per-day log files found in', LOG_DIR);
    return;
  }

  // Pull a generous page of portal orders once, then match locally.
  console.log('Fetching order report from CXBot portal…');
  const records = await fetchOrderPage({ start: 0, length: 200 });
  if (!records.length) {
    console.error('No records returned. Check AOC_WA_REPORTS_TOKEN / AOC_WA_API_KEY in .env.');
    process.exit(1);
  }
  console.log(`Got ${records.length} portal order record(s).\n`);

  let orders = [];
  try { orders = JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')); } catch (e) {}
  let ordersDirty = false;

  let seen = 0, matched = 0, missed = 0, skipped = 0;

  for (const file of dayFiles) {
    const full = path.join(LOG_DIR, file);
    const events = readJsonl(full);

    // orderIds already written into this day's log — don't duplicate.
    const alreadyResolved = new Set(
      events
        .filter(e => e?.payload?.event === 'order_detail_resolved' && e?.payload?.order?.orderId)
        .map(e => e.payload.order.orderId)
    );

    for (const ev of events) {
      const p = ev?.payload;
      if (p?.event !== 'message_received' || p?.messages?.type !== 'order') continue;
      seen++;

      const recipient = p?.contacts?.recipient || '';
      const ts = Number(p?.messages?.timestamp) || 0;
      const want = phone10(recipient);

      let best = null, bestDelta = Infinity;
      for (const rec of records) {
        if (phone10(rec.recipient_id) !== want) continue;
        if (!rec.order_detail?.items?.length) continue;
        const d = Math.abs((Number(rec.createdAt) || 0) - ts);
        if (d < bestDelta) { bestDelta = d; best = rec; }
      }

      if (!best || bestDelta > MATCH_WINDOW_MS) {
        missed++;
        console.log(`✗ ${ev.receivedAt}  ${recipient}  no portal match (closest ${best ? bestDelta + 'ms' : 'n/a'})`);
        continue;
      }

      const detail = normaliseRecord(best);
      detail.matchDeltaMs = bestDelta;

      if (alreadyResolved.has(detail.orderId)) {
        skipped++;
        console.log(`· ${ev.receivedAt}  ${recipient}  order ${detail.orderId} already back-filled`);
        continue;
      }

      matched++;
      console.log(
        `✓ ${ev.receivedAt}  ${recipient}  order ${detail.orderId} (Δ${bestDelta}ms) — ` +
        detail.items.map(i => `${i.name} x${i.qty} @ ${i.rate}`).join(', ') +
        ` | total ${detail.currency} ${detail.totalAmount}`
      );

      const entry = {
        receivedAt: ev.receivedAt,
        ip: '127.0.0.1',
        source: 'aoc-order-enrichment/backfill',
        payload: {
          channel: p.channel || 'whatsapp',
          messageId: p.messageId || null,
          from: p.from || null,
          event: 'order_detail_resolved',
          resolved: true,
          contacts: p.contacts || null,
          messages: p.messages || null,
          order: {
            orderId: detail.orderId,
            catalog_id: detail.catalogId,
            status: detail.status,
            currency: detail.currency,
            itemCount: detail.itemCount,
            items: detail.items,
            product_items: detail.product_items,
            subtotal: detail.subtotal,
            tax: detail.tax,
            discount: detail.discount,
            shipping: detail.shipping,
            totalAmount: detail.totalAmount,
            portalCreatedAt: detail.createdAt,
            matchDeltaMs: bestDelta,
          },
          error: null,
        },
      };

      if (!DRY) appendLog(entry);
      alreadyResolved.add(detail.orderId);

      // ── Back-fill db/app/orders.json ──────────────────────────────────────
      const target = orders.find(o =>
        o.source === 'whatsapp_catalogue' &&
        (o.waOrderId === detail.orderId ||
          (!o.waOrderId && phone10(o.waPhone) === want && !(o.items || []).length))
      );
      if (target) {
        target.items = detail.items;
        target.totalAmount = detail.totalAmount;
        target.subtotal = detail.subtotal;
        target.tax = detail.tax;
        target.customDiscount = detail.discount;
        target.shipping = detail.shipping;
        target.currency = detail.currency;
        target.waOrderId = detail.orderId;
        target.waCatalogId = detail.catalogId;
        target.itemsResolved = true;
        target.notes =
          `WhatsApp Catalogue Order — phone: ${target.waPhone}. ` +
          `${detail.items.length} item(s): ` +
          detail.items.map(i => `${i.name} x${i.qty} @ ${i.rate}`).join(', ') + '.';
        ordersDirty = true;
        console.log(`    ↳ updated orders.json entry ${target.id}`);
      }
    }
  }

  if (ordersDirty && !DRY) {
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));
    console.log(`\nWrote ${ORDERS_PATH}`);
  }

  console.log(
    `\n${DRY ? '[DRY RUN] ' : ''}Done — ${seen} order event(s): ` +
    `${matched} back-filled, ${skipped} already done, ${missed} unmatched.`
  );
}


// ============================================================================
// ── SERVER & CLI RUNNER ─────────────────────────────────────────────────────
// ============================================================================
const argv = process.argv.slice(2);

if (argv.includes('--check') || argv.includes('--list')) {
// ── CLI ───────────────────────────────────────────────────────────────────────

  
  

  if (argv.includes('--check')) {
    checkAuth().then(ok => process.exit(ok ? 0 : 1));
  } else if (argv.includes('--list')) {
    const n = parseInt(argv[argv.indexOf('--list') + 1], 10) || 10;
    fetchOrderPage({ length: n }).then((recs) => {
      if (!recs.length) return process.exit(1);
      for (const r of recs.map(normaliseRecord)) {
        console.log(
          `${new Date(r.createdAt).toISOString()}  ${r.recipient}  #${r.orderId}  ` +
          `${r.itemCount} item(s): ${r.items.map(i => `${i.name} x${i.qty} @ ${i.rate}`).join(', ')}  ` +
          `| total ${r.currency} ${r.totalAmount}`
        );
      }
    });
  } else {
    console.log('Usage: node aoc-orders.js --check | --list [n]');
  }
} else if (argv.includes('--backfill')) {
  const DRY = argv.includes('--dry-run');
  const dayFilter = argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || null;
  runBackfill(DRY, dayFilter).then(() => {
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
} else {
  const server = http.createServer(app);
  server.listen(PORT, '127.0.0.1', () => {
    console.log('[WA] WhatsApp service running on http://127.0.0.1:' + PORT);
    console.log('[WA] Send endpoint    : POST /send');
    console.log('[WA] Webhook endpoint : /webhook');
    console.log('[WA] Webhook logs     : /webhook/logs');
    console.log('[WA] Catalogue orders : /webhook/orders');
    console.log('[WA] Media files      : /files/<filename>');
    console.log('[WA] To check login   : node whatsapp.js --check');
    console.log('[WA] To backfill      : node whatsapp.js --backfill [--dry-run]');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('[WA] Port ' + PORT + ' already in use. Is whatsapp already running?');
      process.exit(1);
    }
    throw err;
  });

  module.exports = app;
}
