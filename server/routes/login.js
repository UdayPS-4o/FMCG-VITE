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

  // Initialize a dictionary to track the stock
  let tempStock = {};
  let stock = {};

  // Process purchases to increment stock
  for (const purchase of purchaseData) {
    const { CODE: code, GDN_CODE: gdn_code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free } = purchase;
    tempStock[code] = tempStock[code] || { pieces: 0, godowns: {} };
    tempStock[code].godowns[gdn_code] = tempStock[code].godowns[gdn_code] || { pieces: 0 };
    
    let qtyInPieces = qty;
    if (unit === 'BOX' || unit === 'Box') {
      qtyInPieces *= multF;
    }
    
    tempStock[code].pieces += qtyInPieces;
    tempStock[code].godowns[gdn_code].pieces += qtyInPieces;
    
    if (free) {
      tempStock[code].pieces += free;
      tempStock[code].godowns[gdn_code].pieces += free;
    }
  }

  // Process sales to decrement stock
  for (const sale of salesData) {
    const { CODE: code, GDN_CODE: gdn_code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free } = sale;
    if (tempStock[code]) {
      let qtyInPieces = qty;
      if (unit === 'BOX' || unit === 'Box') {
        qtyInPieces *= multF;
      }
      
      tempStock[code].godowns[gdn_code] = tempStock[code].godowns[gdn_code] || { pieces: 0 };
      tempStock[code].pieces -= qtyInPieces;
      tempStock[code].godowns[gdn_code].pieces -= qtyInPieces;
      
      if (free) {
        tempStock[code].pieces -= free;
        tempStock[code].godowns[gdn_code].pieces -= free;
      }
    }
  }

  // Process DBF transfers
  for (const transfer of transferData) {
    const {
      CODE: code,
      GDN_CODE: from_gdn,
      TRF_TO: to_gdn,
      QTY: qty,
      MULT_F: multF,
      UNIT: unit,
    } = transfer;
    
    const qtyInPieces = (unit === 'BOX' || unit === 'Box') ? qty * multF : qty;
    
    tempStock[code] = tempStock[code] || { pieces: 0, godowns: {} };
    tempStock[code].godowns[from_gdn] = tempStock[code].godowns[from_gdn] || { pieces: 0 };
    tempStock[code].godowns[to_gdn] = tempStock[code].godowns[to_gdn] || { pieces: 0 };
    
    tempStock[code].godowns[from_gdn].pieces -= qtyInPieces;
    tempStock[code].godowns[to_gdn].pieces += qtyInPieces;
  }

  // Process local godown transfers
  for (const transfer of localTransferData) {
    const { fromGodown, toGodown, items } = transfer;
    
    for (const item of items) {
      const { code, qty, unit } = item;
      const multF = pmplData.find((pmpl) => pmpl.CODE === code)?.MULT_F || 1;
      const qtyInPieces = (unit === 'BOX' || unit === 'Box') ? qty * multF : qty;
      
      tempStock[code] = tempStock[code] || { pieces: 0, godowns: {} };
      tempStock[code].godowns[fromGodown] = tempStock[code].godowns[fromGodown] || { pieces: 0 };
      tempStock[code].godowns[toGodown] = tempStock[code].godowns[toGodown] || { pieces: 0 };
      
      tempStock[code].godowns[fromGodown].pieces -= qtyInPieces;
      tempStock[code].godowns[toGodown].pieces += qtyInPieces;
    }
  }

  // Convert to the original output format
  for (const code in tempStock) {
    stock[code] = {};
    for (const gdn in tempStock[code].godowns) {
      stock[code][gdn] = Math.round(tempStock[code].godowns[gdn].pieces);
    }
  }

  return stock;
}

app.get('/api/stock', async (req, res) => {
  const stock = await calculateCurrentStock();
  res.send(stock);
});

module.exports = app;
