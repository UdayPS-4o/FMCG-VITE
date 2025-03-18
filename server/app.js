const express = require('express');
const bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const fs = require('fs').promises;
const path = require('path');
const morgan = require('morgan');
const app = express();
const PORT = 8000;
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
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'http://localhost:5178',
      'http://localhost:5179',
    ],
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(cookieParser());

const spawn = require('child_process').spawn;
app.use(express.static('./node_modules/html-template-02'));
// app.use(express.static('./public'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// use external routes from ./routes/login.js
const loginRoutes = require('./routes/login');
app.use(loginRoutes);

const slinkRoutes = require('./routes/slink');
const orcusRoutes = require('./routes/orcusRoutes');
app.use(express.static(path.join(__dirname, '.', 'dist')));
app.use('/slink', slinkRoutes);
app.use('/', orcusRoutes);

// set middleware to check if user is logged in
const middleware = require('./routes/middleware');
app.use(middleware);
app.set('view engine', 'ejs');

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

// Initialize server
const initServer = () => {
  app.listen(PORT, 'localhost', () => {
    console.log(`Server running on port ${PORT}`);
  });
};

initServer();

require('./routes/watcher');