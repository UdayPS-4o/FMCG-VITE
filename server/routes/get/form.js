const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require('../utilities');

const uniqueIdentifiers = ['receiptNo', 'voucherNo', 'subgroup'];

app.get('/cash-receipts', async (req, res) => {
  const filePath = path.join(__dirname, '..', '..', 'db', 'cash-receipts.json');
  let nextReceiptNo = 1;

  try {
    const data = await fs.readFile(filePath, 'utf8').then(
      (data) => JSON.parse(data),
      (error) => {
        if (error.code !== 'ENOENT') throw error; // Ignore file not found errors
      },
    );
    if (data && data.length) {
      const lastEntry = data[data.length - 1];
      nextReceiptNo = Number(lastEntry.receiptNo) + 1;
    }
  } catch (error) {
    console.error('Failed to read or parse cash-receipts.json:', error);
    res.status(500).send('Server error');
    return;
  }

  res.render('pages/cash-receipts', { nextReceiptNo });
});

app.get('/:page', (req, res) => {
  const { page } = req.params;
  res.render(`pages/${page}`);
});

app.get('/db/:file', async (req, res) => {
  const { file } = req.params;
  // captialize the first letter of every word
  let name = file
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  try {
    let data = (await fs.readFile(`./db/${file}.json`, 'utf8')) || '[]';
    data = JSON.parse(data);
    res.render(`pages/db/${file}`, { data, file, name });
  } catch (error) {
    console.error(`Failed to read or parse ${file}.json:`, error);
    res.status(500).send('Server error');
  }
});

module.exports = app;
