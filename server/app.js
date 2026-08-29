require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express = require('express');
const bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const fsAsync = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const morgan = require('morgan');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 8000;

// Ensure DBF folder path is set before loading any modules that depend on it
if (!process.env.DBF_FOLDER_PATH) {
  const defaultDbfPath = path.join(__dirname, '..', 'd01-2324');
  process.env.DBF_FOLDER_PATH = defaultDbfPath;
  console.log(`[INIT] DBF_FOLDER_PATH not set. Using default: ${defaultDbfPath}`);
}

const io = require('socket.io');
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require('./routes/utilities');

const cors = require('cors');
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'https://ekta-enterprises.com',
        'https://test.ekta-enterprises.com',
        'https://app.ekta-enterprises.com',
        'https://server.udayps.cfd',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        // Add any other domain that needs access
      ];

      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.log('CORS: Blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'if-none-match', 'ETag', 'Cache-Control'],
  })
);



app.use(morgan('dev'));
app.use(cookieParser());

const spawn = require('child_process').spawn;// app.use(express.static(80/public'));
app.use(bodyParser.json({ limit: '200mb' })); // for parsing application/json with increased limit for images
app.use(bodyParser.urlencoded({ extended: true, limit: '200mb' })); // for parsing application/x-www-form-urlencoded

app.use(express.static(path.join(__dirname, 'public')));

// Serve PDFs statically from the db/pdfs directory (internal legacy path)
app.use('/db/pdfs', express.static(path.join(__dirname, 'db', 'pdfs')));

// ── Public PDF hosting for WhatsApp API attachments ───────────────────────────
// The AOC WhatsApp API requires a *publicly reachable* HTTPS URL for document
// attachments.  We expose invoice PDFs here — no auth middleware is applied to
// this path so the external API server can download the file.
//
// Public URL pattern:
//   https://server.ekta-enterprises.com/api/invoice-pdfs/<series>-<billNo>-<hash>.pdf
//
// This route is intentionally registered BEFORE the auth middleware (app.use(middleware))
// so that the AOC API (which has no session cookie) can GET the PDF.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/invoice-pdfs', express.static(path.join(__dirname, 'db', 'pdfs'), {
  // Only serve .pdf files from this route for safety
  index: false,
  setHeaders: (res, filePath) => {
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      res.status(403).end();
    }
  },
}));

const pdfRoutes = require('./routes/get/pdf');
app.use("/api/generate-pdf", pdfRoutes.router);

// Add the internal data route BEFORE the main middleware
const internalInvoiceDataRoutes = require('./routes/get/internalInvoiceData');
app.use("/api/internal/invoice-data", internalInvoiceDataRoutes);

// use external routes from ./routes/login.js
const loginRoutes = require('./routes/login');
const stockRoutes = require('./routes/stock');
app.use(loginRoutes);
app.use(stockRoutes);
// Register reports routes
const reportRoutes = require('./routes/reports');
app.use('/api/reports', reportRoutes);  // this is the main route for the reports

// App Routes
const appRoutes = require('./routes/app/index');
app.use('/api/app', appRoutes);

// Alexa skill webhook — registered BEFORE auth middleware so Amazon can POST to it
const alexaRoutes = require('./routes/alexa');
app.use('/api/alexa', alexaRoutes);

// Register dashboard routes
// Register messages routes (No auth required for mobile app to send pickup requests)
const messagesRoutes = require('./routes/messages');
app.use('/api/messages', messagesRoutes);

// WhatsApp Webhook from CXBot
const whatsappWebhook = require('./routes/webhook/index');
app.use('/api/webhook', whatsappWebhook);


// ── /whatsapp reverse-proxy ───────────────────────────────────────────────────
// Contract: this server terminates TLS for server.ekta-enterprises.com.
// Any request arriving at /whatsapp/* has the prefix stripped and is
// forwarded to the whatsapp microservice (whatsapp.js) on port 4292:
//
//   /whatsapp/webhook  →  http://127.0.0.1:4292/webhook
//   /whatsapp/send     →  http://127.0.0.1:4292/send
//   /whatsapp/files/<file> → http://127.0.0.1:4292/files/<file>
//   /whatsapp/health   →  http://127.0.0.1:4292/health
//
// whatsapp.js MUST be running before requests reach these paths.
// Uses req.body (already parsed by bodyParser above) instead of req.pipe —
// the request stream is already drained by the global bodyParser middleware,
// so piping it directly hangs on any POST (bodyParser consumed it already).
// ─────────────────────────────────────────────────────────────────────────────
app.use('/whatsapp', (req, res) => {
  const WHATSAPP_PORT = process.env.WHATSAPP_PORT || 4292;
  // Strip /whatsapp prefix — req.url already has it removed by Express
  const targetPath = req.url || '/';

  const hasBody = req.body && Object.keys(req.body).length > 0;
  const bodyString = hasBody ? JSON.stringify(req.body) : '';

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port    : WHATSAPP_PORT,
      path    : targetPath,
      method  : req.method,
      headers : {
        ...req.headers,
        host            : `127.0.0.1:${WHATSAPP_PORT}`,
        'content-type'  : 'application/json',
        'content-length': Buffer.byteLength(bodyString),
        'x-forwarded-for': req.ip || req.connection.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host' : req.headers.host || 'server.ekta-enterprises.com',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[PROXY /whatsapp] Error forwarding to port 4292:', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error  : 'Bad Gateway',
        detail : 'whatsapp service unavailable on port 4292',
        message: err.message,
      });
    }
  });

  if (bodyString) proxyReq.write(bodyString);
  proxyReq.end();
});
// ── /api/whatsapp reverse-proxy → fmcg-api (port 3188) ──────────────────────
// Strips /api/whatsapp prefix and forwards to the standalone API server.
// Example: POST /api/whatsapp/balance → POST http://127.0.0.1:3188/api/balance
// Registered BEFORE middleware so it bypasses auth.
// Uses req.body (already parsed by bodyParser) instead of req.pipe to avoid
// double-reading the consumed request stream.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/whatsapp', (req, res) => {
  const API_PORT = 3188;
  // req.url is stripped of /api/whatsapp by Express.
  // For /api/whatsapp/balance → req.url="/balance" → target="/api/balance"
  // For /api/whatsapp        → req.url="/"       → show info (not forwarded)
  const suffix = req.url || '';

  // ── LOG FULL REQUEST so we can debug CX BOT live flow ─────────────────────
  console.log('[CXBOT /api/whatsapp] Method:', req.method, '| URL:', req.url);
  console.log('[CXBOT /api/whatsapp] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[CXBOT /api/whatsapp] Query:', JSON.stringify(req.query));
  console.log('[CXBOT /api/whatsapp] Body:', JSON.stringify(req.body));
  // ──────────────────────────────────────────────────────────────────────────


  // ── Normalize phoneNumber param ──────────────────────────────────────────
  // CX BOT sends {{contact.phone}} as "+919179174888" or "919179174888".
  // The FMCG API expects a 10-digit Indian mobile number ("9179174888").
  // Strip leading '+', then strip country code '91' if number is 12 digits,
  // then strip leading '0' if number is 11 digits.
  let normalizedSuffix = suffix;
  if (suffix.includes('phoneNumber=')) {
    normalizedSuffix = suffix.replace(
      /([?&]phoneNumber=)([^&]*)/g,
      (match, key, val) => {
        let num = decodeURIComponent(val).replace(/\s+/g, '');
        num = num.replace(/^\+/, '');          // remove leading +
        if (num.length === 12 && num.startsWith('91')) num = num.slice(2); // +91xxxxxxxxxx → 10 digits
        if (num.length === 11 && num.startsWith('0'))  num = num.slice(1); // 0xxxxxxxxxx  → 10 digits
        return key + encodeURIComponent(num);
      }
    );
  }

  const targetPath = normalizedSuffix === '/' ? '/' : '/api' + normalizedSuffix;

  // Redirect bare /api/whatsapp to the API info
  if (suffix === '/' || !suffix) {
    return res.status(200).json({
      service: 'FMCG Business API Proxy',
      target: `http://127.0.0.1:${API_PORT}/`,
      endpoints: [
        'GET /api/whatsapp/balance?phoneNumber=',
        'GET /api/whatsapp/ledger?phoneNumber=',
        'GET /api/whatsapp/ledger/old?phoneNumber=',
        'GET /api/whatsapp/bill?phoneNumber=&billNumber=',
        'GET /api/whatsapp/stock?company=&phoneNumber=',
        'GET /api/whatsapp/rate?phoneNumber=',
        'GET /api/whatsapp/send-message?phoneNumber=',
        'GET  /api/backup/status',
        'POST /api/backup/trigger',
      ],
      docs: 'https://server.ekta-enterprises.com/api/whatsapp/balance?phoneNumber=9876543210',
    });
  }

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': req.ip || req.connection.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host || 'server.ekta-enterprises.com',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[PROXY /api/whatsapp] Error forwarding to port 3188:', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        detail: 'FMCG API service unavailable on port 3188',
        message: err.message,
      });
    }
  });

  // Forward the parsed body instead of piping the consumed stream
  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }
  proxyReq.end();
});
// ─────────────────────────────────────────────────────────────────────────────
// ── /api/files reverse-proxy → fmcg-api (port 3188) ──────────────────────────
// Forwards static file requests (PDFs, XLS) from the public domain to the
// API server's file server.
// Example: GET /api/files/LEDGER/9876543210.pdf → GET http://127.0.0.1:3188/files/LEDGER/9876543210.pdf
// Registered BEFORE middleware so it bypasses auth.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/files', (req, res) => {
  const API_PORT = 3188;
  // Express strips /api/files from req.url, so we prepend /files for the upstream
  const suffix = req.url || '';
  const targetPath = '/files' + suffix;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        'x-forwarded-for': req.ip || req.connection.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host || 'server.ekta-enterprises.com',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[PROXY /api/files] Error forwarding to port 3188:', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        detail: 'FMCG API file server unavailable on port 3188',
        message: err.message,
      });
    }
  });

  proxyReq.end();
});
// ─────────────────────────────────────────────────────────────────────────────
// ── /files reverse-proxy → fmcg-api (port 3188) ──────────────────────────────
// Public file downloads — mirrors the /api/files proxy above so both
// /files/* and /api/files/* work (the shorter path is what the API returns).
// Example: GET /files/LEDGER/9876543210.pdf → GET http://127.0.0.1:3188/files/LEDGER/9876543210.pdf
// Registered BEFORE middleware so it bypasses auth.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/files', (req, res) => {
  const API_PORT = 3188;
  // Express strips /files from req.url, prepend it back for upstream
  const suffix = req.url || '';
  const targetPath = '/files' + suffix;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        'x-forwarded-for': req.ip || req.connection.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host || 'server.ekta-enterprises.com',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[PROXY /files] Error forwarding to port 3188:', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        detail: 'FMCG API file server unavailable on port 3188',
        message: err.message,
      });
    }
  });

  proxyReq.end();
});
// ─────────────────────────────────────────────────────────────────────────────

// ── /pay reverse-proxy → fmcg-api (port 3188) ─────────────────────────────────
// UPI app deep-link redirect pages (PhonePe/GPay/Paytm) served from fmcg-api.
app.use('/pay', (req, res) => {
  const API_PORT = 3188;
  const suffix = req.url || '';
  const targetPath = '/pay' + suffix;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        'x-forwarded-for': req.ip || req.connection.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host || 'server.ekta-enterprises.com',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[PROXY /pay] Error forwarding to port 3188:', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        detail: 'FMCG API unavailable on port 3188',
        message: err.message,
      });
    }
  });

  proxyReq.end();
});
// ─────────────────────────────────────────────────────────────────────────────

// ── /api/backup reverse-proxy → fmcg-api (port 3188) ──────────────────────────
// Backups: GET /api/backup/status, POST /api/backup/trigger
// Registered BEFORE middleware so it bypasses auth.
app.use('/api/backup', (req, res) => {
  const API_PORT = 3188;
  const suffix = req.url || '';
  const targetPath = '/api/backup' + suffix;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': req.ip || req.connection.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host || 'server.ekta-enterprises.com',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[PROXY /api/backup] Error forwarding to port 3188:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad Gateway', detail: 'FMCG API backup service unavailable on port 3188' });
    }
  });

  proxyReq.end();
});
// ─────────────────────────────────────────────────────────────────────────────

// set middleware to check if user is logged in
// Apply this BEFORE routes that need authentication
const middleware = require('./routes/middleware');
app.use(middleware);

const dashboardRoutes = require('./routes/dashboard');
app.use('/api/dashboard', dashboardRoutes);

// Register push notification routes
const { router: pushRouter } = require('./routes/push');
app.use('/api/push', pushRouter);

const billsRoutes = require('./routes/bills');
app.use('/api', billsRoutes);

const godownRoutes = require('./routes/godowns');
app.use('/api', godownRoutes);

const shikharSchemeRoutes = require('./routes/shikhar_scheme');
app.use('/api', shikharSchemeRoutes);

const godrejSchemeRoutes = require('./routes/godrej_scheme');
app.use('/api/godrej-schemes', godrejSchemeRoutes);


const slinkRoutes = require('./routes/slink');
const orcusRoutes = require('./routes/orcusRoutes');
app.use(express.static(path.join(__dirname, '.', 'dist')));
app.use('/slink', slinkRoutes);
app.use('/', orcusRoutes);

// Register merge routes for DBF syncing
const accountMasterMergeRoutes = require('./routes/merge/account-master');
app.use('/api/merge/account-master', accountMasterMergeRoutes);

// Register invoicing merge routes
const invoicingMergeRoutes = require('./routes/merge/invoicing');
app.use('/api/merge/invoicing', invoicingMergeRoutes);

// Register godown transfer merge routes
const godownTransferMergeRoutes = require('./routes/merge/godown-transfer');
app.use('/api/merge/godown-transfer', godownTransferMergeRoutes);

// Register cash payments merge routes
const cashPaymentsMergeRoutes = require('./routes/merge/cash-payments');
app.use('/api/merge/cash-payments', cashPaymentsMergeRoutes);

// Register cash receipts merge routes
const cashReceiptsMergeRoutes = require('./routes/merge/cash-receipts');
app.use('/api/merge/cash-receipts', cashReceiptsMergeRoutes);

const purchasesMergeRoutes = require('./routes/merge/purchases');
app.use('/api/merge/purchases', purchasesMergeRoutes);

// Register items merge routes
const itemsMergeRoutes = require('./routes/merge/items');
app.use('/api/merge/items', itemsMergeRoutes);

const itemMapRoutes = require('./routes/itemmap');
app.use('/api', itemMapRoutes);

const approvalRoutes = require('./routes/approval');
app.use('/api', approvalRoutes);

const attendanceRoutes = require('./routes/attendance');
app.use(attendanceRoutes);

// AI proxy routes (Gemini key stays on server)
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

// Activity log routes
const activityRoutes = require('./routes/activity');
app.use('/api/activity', activityRoutes);

// App Routes has been moved up

// Endpoint to get data from CMPL.DBF and return as JSON
app.get('/cmpl', getCmplData);

app.get('/', (req, res) => {
  res.redirect('/account-master');
});

app.get('/admin', async (req, res) => {
  let firms = await getDbfData(path.join(__dirname, '..', '..', 'FIRM', 'FIRM.DBF'));
  res.render('pages/admin/admin', { firm: firms });
});

app.post('/addUser', async (req, res) => {
  const { name, number, perms, routes, password, powers, subgroup } = req.body;
  console.log('Adding user', number, perms, routes, powers, password, subgroup);
  let users = await fsAsync.readFile('./db/users.json');
  users = JSON.parse(users);
  if (users.find((user) => user.username === number)) {
    const user = users.find((user) => user.username === number);
    user.type = perms;
    user.name = name;
    user.routes = routes;
    user.password = password;
    user.powers = powers;
    fsAsync.writeFile('./db/users.json', JSON.stringify(users, null, 2));
    res.redirect('/admin');
    return;
  } else {
    const user = {
      id: users.length + 1,
      name: name,
      username: number,
      password: password,
      routeAccess: perms,
      powers: powers,
    };
    users.push(user);
    fsAsync.writeFile('./db/users.json', JSON.stringify(users, null, 2));
    res.redirect('/admin');
  }
});

app.get('/json/users', (req, res) => {
  const users = require('./db/users.json');
  res.send(users);
});

app.get('/users', (req, res) => {
  const users = require('./db/users.json');
  res.send(users);
});

app.get('/users', (req, res) => {
  const users = require('./db/users.json');
  res.send(users);
});
const dbfRoutes = require('./routes/get/db');
app.use(dbfRoutes);

const editRoutes = require('./routes/get/edit');
app.use(editRoutes);

const formRoutes = require('./routes/get/form');
app.use(formRoutes);

const postRoutes = require('./routes/post');
app.use(postRoutes);

// Add purchases merge route
app.use(purchasesMergeRoutes);

// Add this route to handle favicon requests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // Send "No Content" response for favicon requests
});

const { acmeChallengeMiddleware, initAutoSslRenewal } = require('./utils/sslRenewal');

// Initialize server — supports both HTTP (:80) and HTTPS (:443)
const initServer = () => {
  const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'privkey.pem');
  const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'fullchain.pem');

  const certsExist = fsSync.existsSync(SSL_KEY_PATH) && fsSync.existsSync(SSL_CERT_PATH);

  if (certsExist) {
    // ── HTTPS server on :443 ──────────────────────────────────────────────
    const sslOptions = {
      key: fsSync.readFileSync(SSL_KEY_PATH),
      cert: fsSync.readFileSync(SSL_CERT_PATH),
    };
    const httpsServer = https.createServer(sslOptions, app);
    httpsServer.listen(443, '0.0.0.0', () => {
      console.log('HTTPS server running on port 443');
      // Initialize automated background SSL renewal (checks every 12h, hot-reloads TLS context)
      initAutoSslRenewal(httpsServer);
    });
    httpsServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('[ERROR] Port 443 already in use. Waiting for pm2 to retry...');
        process.exit(1); // clean exit so pm2 restarts once port is free
      } else throw err;
    });

    // ── HTTP server on :80 — redirect everything to HTTPS ─────────────────
    const redirectApp = express();
    redirectApp.use(acmeChallengeMiddleware);
    redirectApp.use((req, res) => {
      const host = req.headers.host ? req.headers.host.replace(/:\d+$/, '') : 'server.ekta-enterprises.com';
      res.redirect(301, `https://${host}${req.url}`);
    });
    const httpServer = http.createServer(redirectApp);
    httpServer.listen(80, '0.0.0.0', () => {
      console.log('HTTP server running on port 80 (redirecting to HTTPS)');
    });
    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('[ERROR] Port 80 already in use. Waiting for pm2 to retry...');
        process.exit(1);
      } else throw err;
    });
  } else {
    // ── Fallback: HTTP-only on configured PORT (certs not found) ───────────
    const PORT = process.env.PORT || 8000;
    console.warn(`[WARN] SSL certificates not found. Running HTTP-only on port ${PORT}.`);
    console.warn(`       Looked for key:  ${SSL_KEY_PATH}`);
    console.warn(`       Looked for cert: ${SSL_CERT_PATH}`);
    const httpFallback = http.createServer(app);
    httpFallback.listen(PORT, '0.0.0.0', () => {
      console.log(`HTTP server running on port ${PORT}`);
    });
    httpFallback.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR] Port ${PORT} already in use. Waiting for pm2 to retry...`);
        process.exit(1);
      } else if (err.code === 'EACCES') {
        console.error(`[ERROR] Permission denied for port ${PORT}. Try a different port (>= 1024).`);
        process.exit(1);
      } else throw err;
    });
  }
};

initServer();

require('./routes/watcher');
