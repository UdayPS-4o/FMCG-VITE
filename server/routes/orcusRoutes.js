const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getCmplData } = require('./utilities');
const baseURL = 'http://localhost:8000';
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
app.get('/print', async (req, res) => {
  try {
    const { ReceiptNo, voucherNo, godownId } = req.query;
    if (!ReceiptNo && !voucherNo && !godownId)
      throw new Error('ReceiptNo or VoucherNo is required');
    if (ReceiptNo) {
      const data = await fs.readFile(path.resolve(__dirname, '../db/cash-receipts.json'), 'utf8');
      const json = JSON.parse(data);
      const receipt = json.find((receipt) => receipt.receiptNo == ReceiptNo);
      console.log('receipt', receipt);
      
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
    console.log(error);
    res.send(error);
  }
});
app.get('/account-master', async (req, res) => {
  try {
    const { code } = req.query;
    const data = await fs.readFile(path.resolve(__dirname, '../db/account-master.json'));
    const json = JSON.parse(data);
    const user = json.find((user) => user.C_CODE == req.query.code);
    res.send(user);
  } catch (error) {
    console.log(error);
    res.send(error);
  }
});

app.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;
    const data = await fs.readFile(path.resolve(__dirname, '../db/users.json'));
    const users = JSON.parse(data);
    const user = users.find((user) => user.username == username && user.password == password);
    console.log('user', user);
    if (!user) throw new Error('Invalid username or password');
    res.send(user);
  } catch (error) {
    console.log(error);
    res.send(error);
  }
});

app.post('/approve', async (req, res) => {
  try {
    const { approved, endpoint } = req.body;
    console.log('approved', approved, 'endpoint', endpoint);
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

    console.log('id', id);
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
    
    console.log('updatedJson', approvedjson);
    res.send(approvedjson);
  } catch (error) {
    console.log(error);
    res.send(error);
  }
});

app.post('/toDBF', async (req, res) => {
  try {
    const { approved, endpoint } = req.body;
    console.log('approved', approved, 'endpoint', endpoint);
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

    console.log('id', id);
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
    
    console.log('updatedJson', approvedjson);
    res.send(approvedjson);
  } catch (error) {
    console.log(error);
    res.send(error);
  }
});

// Add a route to revert approved records back to the database
app.post('/revert-approved', async (req, res) => {
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

    // Identify the ID field based on the endpoint
    const idField = 
      endpoint == 'account-master' ? 'subgroup' :
      endpoint == 'cash-receipts' ? 'receiptNo' :
      endpoint == 'godown' ? 'id' :
      endpoint == 'cash-payments' ? 'voucherNo' :
      endpoint == 'invoicing' ? 'id' : 'id';
    
    // Find the records to revert
    const recordsToRevert = approvedData.filter(item => {
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
app.post('/delete-approved-records', async (req, res) => {
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

    // Identify the ID field based on the endpoint
    const idField = 
      endpoint == 'account-master' ? 'subgroup' :
      endpoint == 'cash-receipts' ? 'receiptNo' :
      endpoint == 'godown' ? 'id' :
      endpoint == 'cash-payments' ? 'voucherNo' :
      endpoint == 'invoicing' ? 'id' : 'id';
    
    // Remove the specified records from approved section
    const remainingApproved = approvedData.filter(item => {
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
