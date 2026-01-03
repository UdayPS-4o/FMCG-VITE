const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getCmplData } = require('./utilities');
const { saveDataToJsonFile, ensureDirectoryExistence } = require('./utilities');
const baseURL = 'http://localhost:8000';
const jwt = require('jsonwebtoken');

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
    const filePath = path.join(__dirname, "..", "db", "users.json");
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

function convertAmountToWords(amount) {
  const oneToTwenty = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];
  const scales = ['', 'Thousand', 'Lakh', 'Crore'];

  function convertLessThanOneThousand(number) {
    let words;
    if (number % 100 < 20) {
      words = oneToTwenty[number % 100];
      number = Math.floor(number / 100);
    } else {
      words = oneToTwenty[number % 10];
      number = Math.floor(number / 10);
      words = tens[number % 10] + ' ' + words;
      number = Math.floor(number / 10);
    }
    if (number == 0) return words;
    return oneToTwenty[number] + ' Hundred ' + words;
  }

  function convert(amount) {
    let words = '';
    for (let i = 0; i < scales.length; i++) {
      if (amount % 1000 !== 0) {
        words = convertLessThanOneThousand(amount % 1000) + ' ' + scales[i] + ' ' + words;
      }
      amount = Math.floor(amount / 1000);
    }
    return words.trim();
  }

  const words = convert(amount);
  return words ? words + ' Only' : 'Zero Only';
}
app.get('/print', verifyToken, async (req, res) => {
  try {
    const { ReceiptNo, voucherNo, godownId } = req.query;
    if (!ReceiptNo && !voucherNo && !godownId)
      throw new Error('ReceiptNo or VoucherNo is required');
    if (ReceiptNo) {
      const data = await fs.readFile(path.resolve(__dirname, '../db/cash-receipts.json'), 'utf8');
      const json = JSON.parse(data);
      const receipt = json.find((receipt) => receipt.receiptNo == ReceiptNo);
      
      const cmplJson = await getCmplData();
      const cmplInfo = cmplJson.find((cmpl) => cmpl.C_CODE == receipt.party);
      
      const AmountInWords = convertAmountToWords(receipt.amount);
      res.send({ ...receipt, ...cmplInfo, AmountInWords });
    }
    if (voucherNo) {
      const data = await fs.readFile(path.resolve(__dirname, '../db/cash-payments.json'), 'utf8');
      const json = JSON.parse(data);
      const receipt = json.find((receipt) => receipt.voucherNo == voucherNo);
      
      const cmplJson = await getCmplData();
      const cmplInfo = cmplJson.find((cmpl) => cmpl.C_CODE == receipt.party);
      
      const AmountInWords = convertAmountToWords(receipt.amount);
      res.send({ ...receipt, ...cmplInfo, AmountInWords });
    }
    if (godownId) {
      const data = await fs.readFile(path.resolve(__dirname, '../db/godown.json'), 'utf8');
      const json = JSON.parse(data);
      const receipt = json.find((receipt) => receipt.id == godownId);
      
      const cmplJson = await getCmplData();
      const cmplInfo = cmplJson.find((cmpl) => cmpl.C_CODE == receipt.party);
      
      const AmountInWords = convertAmountToWords(receipt.amount);
      res.send({ ...receipt, ...cmplInfo, AmountInWords });
    }
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});
app.get('/account-master', verifyToken, async (req, res) => {
  try {
    const { code } = req.query;
    const data = await fs.readFile(path.resolve(__dirname, '../db/account-master.json'));
    const json = JSON.parse(data);
    const user = json.find((user) => user.C_CODE == req.query.code);
    res.send(user);
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});

app.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;
    const data = await fs.readFile(path.resolve(__dirname, '../db/users.json'));
    const users = JSON.parse(data);
    const user = users.find((user) => user.username == username && user.password == password);
    if (!user) throw new Error('Invalid username or password');
    res.send(user);
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});

app.post('/approve', verifyToken, async (req, res) => {
  try {
    const { approved, endpoint } = req.body;
    const data = await fs.readFile(path.resolve(__dirname, `../db/${endpoint}.json`));
    const json = JSON.parse(data);
    const id =
      endpoint == 'account-master'
        ? 'subgroup'
        : endpoint == 'cash-receipts'
        ? 'receiptNo'
        : endpoint == 'godown'
        ? 'id'
        : endpoint == 'cash-payments'
        ? 'voucherNo'
        : endpoint == 'invoicing'
        ? 'id'
        : null;

    const toLower = (v) => String(v ?? '').toLowerCase();
    const matchApproved = (item) => {
      if (endpoint === 'purchases') {
        const inv = item.invoice || {};
        const candidates = [
          item.pbillno,
          item.PBILLNO,
          item.bill,
          item.BILL,
          item.createdAt,
          inv.number,
          inv.billNo,
        ]
          .map(toLower)
          .filter(Boolean);
        return approved.some((av) => {
          const a = toLower(av);
          return candidates.some((c) => c.includes(a));
        });
      } else {
        const itemIdValue = toLower(item[id]);
        return approved.some((approvedValue) => itemIdValue.includes(toLower(approvedValue)));
      }
    };

    const approvedjson = json.filter((item) => matchApproved(item));

    // Delete the approved items from the original json
    const remainingjson = json.filter((item) => !matchApproved(item));

    // Save the remaining items back to the original file
    await fs.writeFile(
      path.resolve(__dirname, `../db/${endpoint}.json`),
      JSON.stringify(remainingjson, null, 2),
    );
    
    // Read existing approved items (if any)
    let existingApproved = [];
    try {
      await fs.mkdir(path.resolve(__dirname, '../db/approved'), { recursive: true });
      const approvedData = await fs.readFile(
        path.resolve(__dirname, `../db/approved/${endpoint}.json`),
        { encoding: 'utf8' }
      );
      existingApproved = JSON.parse(approvedData);
    } catch (err) {
      // If the file doesn't exist or has invalid content, start with an empty array
      existingApproved = [];
    }
    
    // Combine existing approved items with newly approved items
    const combinedApproved = [...existingApproved, ...approvedjson];
    
    // Save the combined approved items
    await fs.writeFile(
      path.resolve(__dirname, `../db/approved/${endpoint}.json`),
      JSON.stringify(combinedApproved, null, 2),
    );
    
    res.send(approvedjson);
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});

// Create or append a new item record to database/newitem.json
app.post('/newitem', verifyToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const filePath = path.resolve(__dirname, '../db/newitem.json');
    await ensureDirectoryExistence(filePath);
    await saveDataToJsonFile(filePath, payload);
    res.json({ success: true, saved: payload });
  } catch (error) {
    console.error('Error saving new item:', error);
    res.status(500).json({ success: false, message: 'Failed to save new item' });
  }
});

app.post('/toDBF', verifyToken, async (req, res) => {
  try {
    const { approved, endpoint } = req.body;
    const data = await fs.readFile(path.resolve(__dirname, `../db/${endpoint}.json`));
    const json = JSON.parse(data);
    const id =
      endpoint == 'account-master'
        ? 'subgroup'
        : endpoint == 'cash-receipts'
        ? 'receiptNo'
        : endpoint == 'godown'
        ? 'id'
        : endpoint == 'cash-payments'
        ? 'voucherNo'
        : null;

    const approvedjson = json.filter((item) => {
      const itemIdValue = String(item[id]).toLowerCase();
      return approved.some((approvedValue) => itemIdValue.includes(approvedValue.toLowerCase()));
    });

    // Delete the approved items from the original json
    const remainingjson = json.filter((item) => {
      const itemIdValue = String(item[id]).toLowerCase();
      return !approved.some((approvedValue) => itemIdValue.includes(approvedValue.toLowerCase()));
    });

    // Save the remaining items back to the original file
    await fs.writeFile(
      path.resolve(__dirname, `../db/${endpoint}.json`),
      JSON.stringify(remainingjson, null, 2),
    );
    
    // Read existing approved items (if any)
    let existingApproved = [];
    try {
      await fs.mkdir(path.resolve(__dirname, '../db/approved'), { recursive: true });
      const approvedData = await fs.readFile(
        path.resolve(__dirname, `../db/approved/${endpoint}.json`),
        { encoding: 'utf8' }
      );
      existingApproved = JSON.parse(approvedData);
    } catch (err) {
      // If the file doesn't exist or has invalid content, start with an empty array
      existingApproved = [];
    }
    
    // Combine existing approved items with newly approved items
    const combinedApproved = [...existingApproved, ...approvedjson];
    
    // Save the combined approved items
    await fs.writeFile(
      path.resolve(__dirname, `../db/approved/${endpoint}.json`),
      JSON.stringify(combinedApproved, null, 2),
    );
    
    res.send(approvedjson);
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});

// Add a route to revert approved records back to the database
app.post('/revert-approved', verifyToken, async (req, res) => {
  try {
    const { endpoint, records } = req.body;
    
    if (!endpoint || !records || !Array.isArray(records) || records.length == 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request. Endpoint and records are required.' 
      });
    }

    // Read data from the approved section
    let approvedData;
    try {
      const data = await fs.readFile(
        path.resolve(__dirname, `../db/approved/${endpoint}.json`),
        { encoding: 'utf8' }
      );
      approvedData = JSON.parse(data);
    } catch (err) {
      console.error('Error reading approved data:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to read approved data'
      });
    }

    // Identify the ID field based on the endpoint or use candidate keys for purchases
    const idField = 
      endpoint == 'account-master' ? 'subgroup' :
      endpoint == 'cash-receipts' ? 'receiptNo' :
      endpoint == 'godown' ? 'id' :
      endpoint == 'cash-payments' ? 'voucherNo' :
      endpoint == 'invoicing' ? 'id' : 'id';
    
    const toLowerStr = (v) => String(v ?? '').toLowerCase();
    const purchaseKeys = ['pbillno', 'PBILLNO', 'bill', 'BILL', 'createdAt'];
    const purchaseMatch = (a, b) => {
      // returns true if any candidate key value equals (case-insensitive)
      const aVals = purchaseKeys.map(k => toLowerStr(a[k])).filter(Boolean);
      const bVals = purchaseKeys.map(k => toLowerStr(b[k])).filter(Boolean);
      if (aVals.length === 0 || bVals.length === 0) return false;
      // equality match, not substring
      return aVals.some(av => bVals.includes(av));
    };
    
    // Find the records to revert
    const recordsToRevert = approvedData.filter(item => {
      if (endpoint === 'purchases') {
        return records.some(record => purchaseMatch(item, record));
      }
      const itemIdValue = String(item[idField]).toLowerCase();
      return records.some(record => {
        const recordIdValue = String(record[idField]).toLowerCase();
        return itemIdValue == recordIdValue;
      });
    });
    
    if (recordsToRevert.length == 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching records found to revert'
      });
    }
    
    // Remove the reverted records from approved section
    const remainingApproved = approvedData.filter(item => {
      if (endpoint === 'purchases') {
        return !records.some(record => purchaseMatch(item, record));
      }
      const itemIdValue = String(item[idField]).toLowerCase();
      return !records.some(record => {
        const recordIdValue = String(record[idField]).toLowerCase();
        return itemIdValue == recordIdValue;
      });
    });
    
    // Save the remaining approved records
    await fs.writeFile(
      path.resolve(__dirname, `../db/approved/${endpoint}.json`),
      JSON.stringify(remainingApproved, null, 2)
    );
    
    // Read existing database data
    let databaseData;
    try {
      const data = await fs.readFile(
        path.resolve(__dirname, `../db/${endpoint}.json`),
        { encoding: 'utf8' }
      );
      databaseData = JSON.parse(data);
    } catch (err) {
      // If file doesn't exist, create an empty array
      databaseData = [];
    }
    
    // Combine database data with reverted records
    const updatedDatabaseData = [...databaseData, ...recordsToRevert];
    
    // Save the updated database data
    await fs.writeFile(
      path.resolve(__dirname, `../db/${endpoint}.json`),
      JSON.stringify(updatedDatabaseData, null, 2)
    );
    
    return res.json({
      success: true,
      message: `Successfully reverted ${recordsToRevert.length} records`,
      revertedCount: recordsToRevert.length
    });
  } catch (error) {
    console.error('Error reverting approved records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to revert records',
      error: error.message
    });
  }
});

// Add a route to delete approved records (used after successful DBF sync)
app.post('/delete-approved-records', verifyToken, async (req, res) => {
  try {
    const { endpoint, records } = req.body;
    
    if (!endpoint || !records || !Array.isArray(records) || records.length == 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request. Endpoint and records are required.' 
      });
    }

    // Read data from the approved section
    let approvedData;
    try {
      const data = await fs.readFile(
        path.resolve(__dirname, `../db/approved/${endpoint}.json`),
        { encoding: 'utf8' }
      );
      approvedData = JSON.parse(data);
    } catch (err) {
      console.error('Error reading approved data:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to read approved data'
      });
    }

    // Identify the ID field based on the endpoint or use candidate keys for purchases
    const idField = 
      endpoint == 'account-master' ? 'subgroup' :
      endpoint == 'cash-receipts' ? 'receiptNo' :
      endpoint == 'godown' ? 'id' :
      endpoint == 'cash-payments' ? 'voucherNo' :
      endpoint == 'invoicing' ? 'id' : 'id';
    const toLowerStr = (v) => String(v ?? '').toLowerCase();
    const purchaseKeys = ['pbillno', 'PBILLNO', 'bill', 'BILL', 'createdAt'];
    const purchaseMatch = (a, b) => {
      const aVals = purchaseKeys.map(k => toLowerStr(a[k])).filter(Boolean);
      const bVals = purchaseKeys.map(k => toLowerStr(b[k])).filter(Boolean);
      if (aVals.length === 0 || bVals.length === 0) return false;
      return aVals.some(av => bVals.includes(av));
    };
    
    // Remove the specified records from approved section
    const remainingApproved = approvedData.filter(item => {
      if (endpoint === 'purchases') {
        return !records.some(record => purchaseMatch(item, record));
      }
      const itemIdValue = String(item[idField]).toLowerCase();
      return !records.some(record => {
        const recordIdValue = String(record[idField]).toLowerCase();
        return itemIdValue == recordIdValue;
      });
    });
    
    // Save the remaining approved records
    await fs.writeFile(
      path.resolve(__dirname, `../db/approved/${endpoint}.json`),
      JSON.stringify(remainingApproved, null, 2)
    );
    
    return res.json({
      success: true,
      message: `Successfully removed ${records.length} records from approved section`,
      deletedCount: records.length
    });
  } catch (error) {
    console.error('Error deleting approved records:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete records',
      error: error.message
    });
  }
});

module.exports = app;
