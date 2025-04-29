const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
  getSTOCKFILE,
} = require('./utilities');
const { cp } = require('fs');
const { id } = require('date-fns/locale');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const JWT_EXPIRY = '10d'; 

// Middleware to extract JWT token from Authorization header
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

app.get('/api/checkIsAuth', (req, res) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from users.json file
    const filePath = path.join(__dirname, '..', 'db', 'users.json');
    fs.readFile(filePath, 'utf8')
      .then((data) => {
        const users = JSON.parse(data);
        const user = users.find((u) => u.id === decoded.userId);
        
        if (user) {
          return res.status(200).json({
            authenticated: true,
            user: {
              id: user.id,
              name: user.name,
              username: user.username,
              routeAccess: user.routeAccess,
              powers: user.powers,
              subgroups: user.subgroups,
              smCode: user.smCode,
              defaultSeries: user.defaultSeries,
              godownAccess: user.godownAccess,
              canSelectSeries: user.canSelectSeries
            }
          });
        } else {
          return res.status(401).json({ authenticated: false });
        }
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ authenticated: false, error: 'Internal server error' });
      });
  } catch (err) {
    console.error('JWT verification failed:', err);
    return res.status(401).json({ authenticated: false });
  }
});

app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;
  const filePath = path.join(__dirname, '..', 'db', 'users.json');

  try {
    let dbData = await fs.readFile(filePath, 'utf8');
    let users = JSON.parse(dbData);
    const user = users.find((user) => user.number === mobile && user.password === password);

    if (user) {
      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user.id,
          username: user.username
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRY }
      );

      // Return the token in the response
      res.status(200).json({ 
        success: true, 
        token: token,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          routeAccess: user.routeAccess,
          powers: user.powers,
          subgroup: user.subgroup
        }
      });
    } else {
      res.status(404).json({ success: false, message: 'Invalid username or password.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to login: ' + err.message });
  }
});

app.get('/logout', (req, res) => {
  // JWT logout just redirects - client should clear the token
  res.status(200).redirect('/login');
});

4
let cachedStock = null;
let cachedStockHash = null;
let lastFileModTimes = {}; // Store last modification times of files

async function getFileModificationTimes() {
  const files = [
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json'),
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'purdtl.json'),
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'transfer.json'),
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'pmpl.json'),
    path.join(__dirname, '..', 'db', 'godown.json') // This path seems correct, leave as is
  ];
  
  const modTimes = {};
  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      modTimes[file] = stats.mtime.getTime();
    } catch (error) {
      console.error(`Error getting modification time for ${file}:`, error);
      // If we can't get the mod time, use current time to force recalculation
      modTimes[file] = Date.now();
    }
  }
  
  return modTimes;
}

async function haveFilesChanged(newModTimes) {
  // If we don't have last mod times, assume files have changed
  if (Object.keys(lastFileModTimes).length === 0) return true;
  
  // Check if any file has a different modification time
  for (const file in newModTimes) {
    if (!lastFileModTimes[file] || lastFileModTimes[file] !== newModTimes[file]) {
      return true;
    }
  }
  
  return false;
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
  try {
    const clientHash = req.headers['if-none-match'] || req.query.hash;
    
    // Get current file modification times
    const currentFileModTimes = await getFileModificationTimes();
    const filesHaveChanged = await haveFilesChanged(currentFileModTimes);
    
    // If we have cached data and no file has changed
    if (cachedStock && cachedStockHash && !filesHaveChanged) {
      console.log('Source files unchanged, using cached stock data');
      
      // If client hash matches cached hash, return 304
      if (clientHash && (clientHash === cachedStockHash || clientHash === `"${cachedStockHash}"`)) {
        console.log('Stock data cache hit with 304');
        return res.status(304).set({
          'ETag': `"${cachedStockHash}"`,
          'Cache-Control': 'private, max-age=0',
          'Access-Control-Expose-Headers': 'ETag'
        }).send('Not Modified');
      }
      
      // Otherwise return cached data
      res.set({
        'ETag': `"${cachedStockHash}"`,
        'Cache-Control': 'private, max-age=0',
        'Access-Control-Expose-Headers': 'ETag'
      });
      return res.json(cachedStock);
    }
    
    // If we get here, files have changed or cache doesn't exist
    console.log('Files changed or no cache, recalculating stock data');
    const stock = await calculateCurrentStock();
    
    // Generate a hash for the stock data
    const currentHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(stock))
      .digest('hex');
    
    // Update cache and file mod times
    cachedStock = stock;
    cachedStockHash = currentHash;
    lastFileModTimes = currentFileModTimes;
    
    // Set ETag header with proper quotes
    const etagValue = `"${currentHash}"`;
    res.set({
      'ETag': etagValue,
      'Cache-Control': 'private, max-age=0',
      'Access-Control-Expose-Headers': 'ETag'
    });
    
    console.log(`Stock API: Generated hash: ${currentHash}, client hash: ${clientHash || 'none'}`);
    
    // Compare again after calculation in case hashes match
    if (clientHash && (clientHash === currentHash || clientHash === `"${currentHash}"`)) {
      console.log('Stock data matches after recalculation');
      return res.status(304).send('Not Modified');
    }
    
    console.log('Sending full stock data');
    res.json(stock);
  } catch (error) {
    console.error('Error generating stock data:', error);
    res.status(500).send('Server error');
  }
});

// Add this POST route for /api/logout
app.post('/api/logout', (req, res) => {
  // JWT doesn't need server-side logout, just return success
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

module.exports = app;