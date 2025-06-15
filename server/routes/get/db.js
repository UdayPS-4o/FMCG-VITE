const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require('../utilities');

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Extract JWT token from Authorization header
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Authentication required' 
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from users.json file
    const filePath = path.join(__dirname, "..", "..", "db", "users.json");
    const data = await fs.readFile(filePath, "utf8");
    const users = JSON.parse(data);
    const user = users.find((u) => u.id === decoded.userId);
    
    if (user) {
      req.user = user;
      next();
    } else {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired authentication token' 
      });
    }
  } catch (err) {
    console.error("JWT verification failed:", err);
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or expired token' 
    });
  }
};

// Helper function to generate hash from data
function generateHash(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

app.get('/json/:file', verifyToken, async (req, res) => {
  const { file } = req.params;
  const clientHash = req.headers['if-none-match'] || req.query.hash;
  
  try {
    let data = (await fs.readFile(`./db/${file}.json`, 'utf8')) || '[]';
    const jsonData = JSON.parse(data);
    
    // Generate hash for the current data
    const currentHash = generateHash(jsonData);
    
    // Set ETag header - With string quotes which is standard for ETags
    const etagValue = `"${currentHash}"`;
    res.set({
      'ETag': etagValue,
      'Cache-Control': 'private, max-age=0',
      'Access-Control-Expose-Headers': 'ETag'
    });
    
    console.log(`JSON route: Generated hash for ${file}.json: ${currentHash}, client hash: ${clientHash || 'none'}`);
    console.log(`JSON route: Response headers being set: ETag=${etagValue}`);
    
    // If client sent a hash and it matches, return 304 Not Modified
    if (clientHash && (clientHash === currentHash || clientHash === `"${currentHash}"`)) {
      console.log(`Cache hit for ${file}.json`);
      return res.status(304).send('Not Modified');
    }
    
    console.log(`Sending full data for ${file}.json`);
    // Otherwise, send the full data with the hash
    res.json(jsonData);
  } catch (error) {
    console.error(`Failed to read or parse ${file}.json:`, error);
    res.status(500).send('Server error');
  }
});

app.get('/approved/json/:file', verifyToken, async (req, res) => {
  console.log('approved');
  const { file } = req.params;
  const filePath = `./db/approved/${file}.json`;
  const clientHash = req.headers['if-none-match'] || req.query.hash;
  
  try {
    let data;
    try {
      data = await fs.readFile(filePath, 'utf8');
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        // File doesn't exist, create it with empty array
        data = '[]';
        await fs.writeFile(filePath, data, 'utf8');
      } else {
        throw readError;
      }
    }
    
    const jsonData = JSON.parse(data);
    const currentHash = generateHash(jsonData);
    
    // Set ETag header - With string quotes which is standard for ETags
    const etagValue = `"${currentHash}"`;
    res.set({
      'ETag': etagValue,
      'Cache-Control': 'private, max-age=0',
      'Access-Control-Expose-Headers': 'ETag'
    });
    
    console.log(`Approved JSON route: Generated hash for ${file}.json: ${currentHash}, client hash: ${clientHash || 'none'}`);
    console.log(`Approved JSON route: Response headers being set: ETag=${etagValue}`);
    
    // Check if hash matches - with or without quotes
    if (clientHash && (clientHash === currentHash || clientHash === `"${currentHash}"`)) {
      console.log(`Cache hit for approved/${file}.json`);
      return res.status(304).send('Not Modified');
    }
    
    console.log(`Sending full data for approved/${file}.json`);
    res.json(jsonData);
  } catch (error) {
    console.error(`Failed to read or parse ${file}.json:`, error);
    res.status(500).send('Server error');
  }
});

app.get('/dbf/:file', async (req, res) => {
  let { file } = req.params;

  try {
    // let dbfFiles = await getDbfData(path.join(__dirname,"..",'d01-2324','data', file));
    let dbfFiles = await fs
      .readFile(
        path.join(
          process.env.DBF_FOLDER_PATH,
          'data',
          'json',
          file.replace('.dbf', '.json').replace('.DBF', '.json'),
        ),
        'utf8',
      )
      .then((data) => JSON.parse(data));
    res.render('pages/db/dbf', { dbfFiles, name: file, file: file });
    // res.json(dbfFile);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/api/dbf/:file', async (req, res) => {
  let { file } = req.params;
  const clientHash = req.headers['if-none-match'] || req.query.hash;

  try {
    const filePath = path.join(
      process.env.DBF_FOLDER_PATH,
      'data',
      'json',
      file.replace('.dbf', '.json').replace('.DBF', '.json'),
    );
    
    console.log(`Processing file request for: ${file}, path: ${filePath}`);
    
    let data = await fs.readFile(filePath, 'utf8');
    let dbfFiles = JSON.parse(data);

    let whitelist = [
      'C_NAME', 'C_CODE', 'M_GROUP', 'PRODUCT', 'CODE', 'MRP1', 'STK',
      'PACK', 'GST', 'MULT_F', 'RATE1', 'UNIT_1', 'UNIT_2', 'PL_RATE',
      'GDN_NAME', 'GDN_CODE', 'QTY', 'UNIT', 'SCH_FROM', 'SCH_TO', 
      'DISCOUNT', 'TRF_TO', 'ST_CODE', 'ST_NAME', 'partycode', 'result', 
      'fromGodown', 'toGodown', 'items', 'qty', 'unit', '---------', 
      'rate', 'amount', 'discount', 'netamount', 'remarks', 'date', 
      'voucher', 'voucherdate',
    ];
    
    // Filter to only keep whitelisted keys
    dbfFiles = dbfFiles.map((entry) => {
      let newEntry = {};
      for (const key in entry) {
        if (whitelist.includes(key)) {
          newEntry[key] = entry[key];
        }
      }
      return newEntry;
    });
    
    dbfFiles = dbfFiles.filter((entry) => entry.C_NAME !== 'OPENING BALANCE');
    
    // Generate hash for filtered data
    const currentHash = generateHash(dbfFiles);
    
    console.log(`Generated hash for ${file}: ${currentHash}, client hash: ${clientHash || 'none'}`);
    
    // Set ETag header - With string quotes which is standard for ETags
    const etagValue = `"${currentHash}"`;
    res.set({
      'ETag': etagValue,
      'Cache-Control': 'private, max-age=0',
      'Access-Control-Expose-Headers': 'ETag'
    });
    
    console.log(`Response headers being set: ETag=${etagValue}`);
    
    // Check if hash matches - Compare with or without quotes for flexibility
    if (clientHash && (
        clientHash === currentHash || 
        clientHash === `"${currentHash}"` || 
        clientHash.replace(/"/g, '') === currentHash
    )) {
      console.log(`Cache hit for ${file}`);
      return res.status(304).send('Not Modified');
    }
    
    console.log(`Sending full data for ${file}`);
    res.json(dbfFiles);
  } catch (error) {
    console.error(`Error processing DBF file ${file}:`, error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.get('/dbf', async (req, res) => {
  try {
    const files = await fs.readdir(path.join(process.env.DBF_FOLDER_PATH, 'data'));
    let dbfFiles = files
      .filter((file) => file.endsWith('.dbf') || file.endsWith('.DBF'))
      .map((file, index) => ({ name: file }));
    res.render('pages/db/dbf', {
      dbfFiles,
      name: 'DBF Files',
      file: 'dbf-files',
    });
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/tooltip/:CODE/:C_CODE', verifyToken, async (req, res) => {
  const { CODE, C_CODE } = req.params;
  const filePath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');

  try {
    const fileData = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(fileData);

    if (!Array.isArray(jsonData)) {
      console.error('BILLDTL.json is not an array');
      return res.status(500).json({ error: 'Invalid data format' });
    }

    const filteredData = jsonData.filter(entry => entry.CODE === CODE && entry.C_CODE === C_CODE);

    if (filteredData.length === 0) {
      return res.status(404).json({ message: 'No matching data found' });
    }

    // Sort by date in descending order to get the latest entry
    const sortedData = filteredData.sort((a, b) => {
      const dateA = new Date(a.DATE);
      const dateB = new Date(b.DATE);
      return dateB - dateA; // For descending order
    });

    res.json(sortedData[0]); // Return the latest entry

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`File not found: ${filePath}`, error);
      return res.status(404).json({ error: 'Tooltip data file not found' });
    }
    console.error(`Error processing tooltip request for CODE: ${CODE}, C_CODE: ${C_CODE}:`, error);
    res.status(500).json({ error: 'Server error while fetching tooltip data' });
  }
});

module.exports = app;
