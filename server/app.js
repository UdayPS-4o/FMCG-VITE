require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const fs = require('fs').promises;
const path = require('path');
const morgan = require('morgan');
const app = express();
const PORT = process.env.PORT || 8000;
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
    origin: function(origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'https://ekta-enterprises.com',
        'https://server.udayps.cfd',
        // Add any other domain that needs access
      ];
      
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.log('Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'if-none-match', 'ETag', 'Cache-Control']
  })
);



app.use(morgan('dev'));
app.use(cookieParser());

const spawn = require('child_process').spawn;// app.use(express.static(80/public'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Serve PDFs statically from the db/pdfs directory
app.use('/db/pdfs', express.static(path.join(__dirname, 'db', 'pdfs')));

const pdfRoutes = require('./routes/get/pdf');
app.use("/api/generate-pdf", pdfRoutes);

// Add the internal data route BEFORE the main middleware
const internalInvoiceDataRoutes = require('./routes/get/internalInvoiceData');
app.use("/api/internal/invoice-data", internalInvoiceDataRoutes);

// use external routes from ./routes/login.js
const loginRoutes = require('./routes/login');
app.use(loginRoutes);

// set middleware to check if user is logged in
// Apply this BEFORE routes that need authentication
const middleware = require('./routes/middleware');
app.use(middleware);

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
  let users = await fs.readFile('./db/users.json');
  users = JSON.parse(users);
  if (users.find((user) => user.username === number)) {
    const user = users.find((user) => user.username === number);
    user.type = perms;
    user.name = name;
    user.routes = routes;
    user.password = password;
    user.powers = powers;
    fs.writeFile('./db/users.json', JSON.stringify(users, null, 2));
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
    fs.writeFile('./db/users.json', JSON.stringify(users, null, 2));
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
const dbfRoutes = require('./routes/get/db');
app.use(dbfRoutes);

const editRoutes = require('./routes/get/edit');
app.use(editRoutes);

const formRoutes = require('./routes/get/form');
app.use(formRoutes);

const postRoutes = require('./routes/post');
app.use(postRoutes);

// Add this route to handle favicon requests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // Send "No Content" response for favicon requests
});

// Initialize server
const initServer = () => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

initServer();

require('./routes/watcher');