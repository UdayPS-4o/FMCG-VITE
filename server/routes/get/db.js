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

app.get('/json/:file', async (req, res) => {
  const { file } = req.params;
  try {
    let data = (await fs.readFile(`./db/${file}.json`, 'utf8')) || '[]';
    res.json(JSON.parse(data));
  } catch (error) {
    console.error(`Failed to read or parse ${file}.json:`, error);
    res.status(500).send('Server error');
  }
});
app.get('/approved/json/:file', async (req, res) => {
  console.log('approved');
  const { file } = req.params;
  const filePath = `./db/approved/${file}.json`;
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
    console.log(data);
    res.json(JSON.parse(data));
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
          __dirname,
          '..',
          '..',
          '..',
          'd01-2324',
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

  try {
    // let dbfFiles = await getDbfData(path.join(__dirname,"..",'d01-2324','data', file));
    let dbfFiles = await fs
      .readFile(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          'd01-2324',
          'data',
          'json',
          file.replace('.dbf', '.json').replace('.DBF', '.json'),
        ),
        'utf8',
      )
      .then((data) => JSON.parse(data));

    let whitelist = [
      'C_NAME',
      'C_CODE',
      'M_GROUP',
      'PRODUCT',
      'CODE',
      'MRP1',
      'STK',
      'PACK',
      'GST',
      'MULT_F',
      'RATE1',
      'UNIT_1',
      'UNIT_2',
      'PL_RATE',
      'GDN_NAME',
      'GDN_CODE',
      'QTY',
      'UNIT',
      'SCH_FROM',
      'SCH_TO',
      'DISCOUNT',
      'TRF_TO',
      'ST_CODE',
      'ST_NAME',
      'partycode',
      'result',
      'fromGodown',
      'toGodown',
      'items',
      'qty',
      'unit',
      '---------',
      'rate',
      'amount',
      'discount',
      'netamount',
      'remarks',
      'date',
      'voucher',
      'voucherdate',
    ];
    // only keep the whitelisted keys
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
    res.json(dbfFiles);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/dbf', async (req, res) => {
  try {
    const files = await fs.readdir(path.join('../', './d01-2324/data'));
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

module.exports = app;
