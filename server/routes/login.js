const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require('./utilities');
const { cp } = require('fs');
const { id } = require('date-fns/locale');

app.get('/api/checkiskAuth', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  const filePath = path.join(__dirname, '..', 'db', 'users.json');
  fs.readFile(filePath, 'utf8')
    .then((data) => {
      const users = JSON.parse(data);
      const user = users.find((u) => u.token === token);
      console.log(user);
      if (user) {
        // Return user details if authenticated
        return res.status(200).json({
          authenticated: true,
          name: user.name,
          routeAccess: user.routeAccess,
          id: user.id,
          username: user.username,

          subgroup: user.subgroup,
        });
      } else {
        // Return unauthorized if user is not found
        return res.status(401).json({ authenticated: false });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ authenticated: false, error: 'Internal server error' });
    });
});

app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;
  const filePath = path.join(__dirname, '..', 'db', 'users.json');

  try {
    let dbData = await fs.readFile(filePath, 'utf8');
    let users = JSON.parse(dbData);
    const user = users.find((user) => user.number === mobile && user.password === password);

    if (user) {
      const newToken = Math.random().toString(36).substring(7);
      user.token = newToken;

      // Save the updated users data with the new token
      await fs.writeFile(filePath, JSON.stringify(users, null, 2), 'utf8');

      // Set token in the cookie and respond
      res
        .status(200)
        .header(
          'Set-Cookie',
          `token=${newToken}; Path=/; Domain=localhost; Max-Age=6800; HttpOnly;`,
        )
        .send('Login successful.');
    } else {
      res.status(404).send('Error: Invalid username or password.');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to login: ' + err.message);
  }
});

app.get('/login', async (req, res) => {
  let firms = await getDbfData(path.join(__dirname, '..', '..', 'FIRM', 'FIRM.DBF'));
  res.render('pages/login/login', { firm: firms });
});

app.get('/logout', (req, res) => {
  res.status(200).clearCookie('token').redirect('/login');
  // .send("Logout successful." + redirect("/login", 2000));
});

const DIR = 'd01-2324';

async function getSTOCKFILE(vvv) {
  return await fs
    .readFile(
      path.join(
        __dirname,
        '..',
        '..',
        DIR,
        'data',
        'json',
        vvv.replace('.dbf', '.json').replace('.DBF', '.json'),
      ),
      'utf8',
    )
    .then((data) => JSON.parse(data));
}

async function calculateCurrentStock() {
  const salesData = await getSTOCKFILE('billdtl.json');
  const purchaseData = await getSTOCKFILE('purdtl.json');
  const transferData = await getSTOCKFILE('transfer.json');
  const pmplData = await getSTOCKFILE('pmpl.json');

  // Fetch the local godown transfer data
  const localTransferResponse = (await fs.readFile(`./db/godown.json`, 'utf8')) || '[]';
  const localTransferData = await JSON.parse(localTransferResponse);

  // Initialize stock object
  const stock = {};

  // Process purchases to increment stock
  for (const purchase of purchaseData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = purchase;
    stock[code] = stock[code] || {};
    stock[code][gdn] = stock[code][gdn] || 0;
    
    let qtyInPieces = qty;
    if (unit === 'BOX' || unit === 'Box') {
      qtyInPieces *= multF;
    }
    
    stock[code][gdn] += qtyInPieces;
    
    if (free) {
      stock[code][gdn] += free;
    }
  }

  // Process sales to decrement stock
  for (const sale of salesData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = sale;
    if (!stock[code]) {
      stock[code] = {};
    }
    
    if (!stock[code][gdn]) {
      stock[code][gdn] = 0;
    }
    
    let qtyInPieces = qty;
    if (unit === 'BOX' || unit === 'Box') {
      qtyInPieces *= multF;
    }
    
    stock[code][gdn] -= qtyInPieces;
    
    if (free) {
      stock[code][gdn] -= free;
    }
  }

  // Process DBF transfers
  for (const transfer of transferData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, TRF_TO: toGdn, GDN_CODE: fromGdn } = transfer;
    const qtyInPieces = (unit === 'BOX' || unit === 'Box') ? qty * multF : qty;
    
    stock[code] = stock[code] || {};
    stock[code][fromGdn] = stock[code][fromGdn] || 0;
    stock[code][toGdn] = stock[code][toGdn] || 0;
    
    stock[code][fromGdn] -= qtyInPieces;
    stock[code][toGdn] += qtyInPieces;
  }

  // Process local godown transfers
  for (const transfer of localTransferData) {
    const { fromGodown, toGodown, items } = transfer;
    
    for (const item of items) {
      const { code, qty, unit } = item;
      const multF = pmplData.find((pmpl) => pmpl.CODE === code)?.MULT_F || 1;
      const qtyInPieces = (unit === 'BOX' || unit === 'Box') ? qty * multF : qty;
      
      stock[code] = stock[code] || {};
      stock[code][fromGodown] = stock[code][fromGodown] || 0;
      stock[code][toGodown] = stock[code][toGodown] || 0;
      
      stock[code][fromGodown] -= qtyInPieces;
      stock[code][toGodown] += qtyInPieces;
    }
  }

  // Round all stock values to integers
  for (const code in stock) {
    for (const gdn in stock[code]) {
      stock[code][gdn] = Math.round(stock[code][gdn]);
    }
  }

  return stock;
}

app.get('/api/stock', async (req, res) => {
  const stock = await calculateCurrentStock();
  res.send(stock);
});

module.exports = app;
