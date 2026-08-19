require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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
    if (!filePath.endsWith('.pdf')) {
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

// ── /whatsapp reverse-proxy ───────────────────────────────────────────────────
// Contract: this server terminates TLS for server.ekta-enterprises.com.
// Any request arriving at /whatsapp/* has the prefix stripped and is
// forwarded to the whatsapp-aisensy microservice on port 4292:
//
//   /whatsapp/webhook/aisensy  →  http://127.0.0.1:4292/webhook/aisensy
//   /whatsapp/files/<file>     →  http://127.0.0.1:4292/files/<file>
//   /whatsapp/health           →  http://127.0.0.1:4292/health
//
// whatsapp-aisensy.js MUST be running before requests reach these paths.
// ─────────────────────────────────────────────────────────────────────────────
const httpProxy = http.createServer; // already imported above
app.use('/whatsapp', (req, res) => {
  const WHATSAPP_PORT = process.env.WHATSAPP_PORT || 4292;
  // Strip /whatsapp prefix — req.url already has it removed by Express
  const targetPath = req.url || '/';

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port    : WHATSAPP_PORT,
      path    : targetPath,
      method  : req.method,
      headers : {
        ...req.headers,
        host            : `127.0.0.1:${WHATSAPP_PORT}`,
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
        detail : 'whatsapp-aisensy service unavailable on port 4292',
        message: err.message,
      });
    }
  });

  // Pipe the incoming body through to the upstream service
  req.pipe(proxyReq, { end: true });
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
