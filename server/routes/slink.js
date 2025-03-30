const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const {
  redirect,
  getDbfData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
  getSTOCKFILE,
} = require('./utilities');

const getCmplData = async () => {
  const dbfFilePath = path.join(__dirname, '..', '..', 'd01-2324/data', 'CMPL.dbf');
  console.log(dbfFilePath);
  try {
    let jsonData = await getDbfData(dbfFilePath);
    jsonData = jsonData.map((entry) => {
      return {
        M_GROUP: entry.M_GROUP,
        M_NAME: entry.M_NAME,
        C_CODE: entry.C_CODE,
        C_NAME: entry.C_NAME,
      };
    });
    return jsonData;
  } catch (error) {
    console.error('Error reading CMPL.dbf:', error);
    throw error;
  }
};

const completeCmplData = async (C_CODE) => {
  const dbfFilePath = path.join(__dirname, '..', '..', 'd01-2324/data/json', 'CMPL.json');
  const cmplData = await fs.readFile(dbfFilePath, 'utf8');
  let jsonData = JSON.parse(cmplData);
  let cmpld = jsonData.find((item) => item.C_CODE === C_CODE);
  return cmpld;
};

const getPMPLData = async () => {
  const dbfFilePath = path.join(__dirname, '..', '..', 'd01-2324/data', 'PMPL.dbf');
  console.log(dbfFilePath);
  try {
    let jsonData = await getDbfData(dbfFilePath);
    jsonData = jsonData.map((entry) => {
      return {
        CODE: entry.CODE,
        PRODUCT: entry.PRODUCT,
        PACK: entry.PACK,
        MRP1: entry.MRP1,
        GST: entry.GST,
      };
    });
    return jsonData;
  } catch (error) {
    console.error('Error reading PMPL.dbf:', error);
    throw error;
  }
};

function newData(json, accountMasterData) {
  json = json.filter((item) => item.M_GROUP === 'DT');

  let filteredList = json.filter((item) => item.C_CODE.endsWith('000'));
  filteredList.sort((a, b) => a.C_CODE.localeCompare(b.C_CODE));

  return filteredList.map((item) => ({
    title: `${item.C_NAME} | ${getNextSubgroupCode(accountMasterData, json, item.C_CODE.substring(0, 2)).slice(2)}`,
    subgroupCode: getNextSubgroupCode(accountMasterData, json, item.C_CODE.substring(0, 2))
  }));
}

function getNextSubgroupCode(accountMasterData, cmplData, subGroup) {
  let maxLocalCode = 0;
  let maxDbfCode = 0;
  
  // Filter entries in accountMasterData that match the current subGroup prefix
  const filterData = accountMasterData.filter((entry) => entry.subgroup.startsWith(subGroup));

  if (filterData.length > 0) {
    // Iterate through filtered data to find the highest subgroup number
    filterData.forEach((entry) => {
      const entryNumber = parseInt(entry.subgroup.slice(2), 10); // Get the numeric part of the subgroup code
      if (maxLocalCode < entryNumber) {
        maxLocalCode = entryNumber;
      }
    });
  }

  // Now check CMPL data for the same prefix
  const cmplFilterData = cmplData.filter((entry) => entry.C_CODE.startsWith(subGroup));
  
  if (cmplFilterData.length > 0) {
    // Iterate through filtered CMPL data to find the highest code number
    cmplFilterData.forEach((entry) => {
      // Skip entries ending with 000 as they are parent entries
      if (!entry.C_CODE.endsWith('000')) {
        const entryNumber = parseInt(entry.C_CODE.slice(2), 10); // Get the numeric part of the code
        if (maxDbfCode < entryNumber) {
          maxDbfCode = entryNumber;
        }
      }
    });
  }

  // Take the greater of the two maximums
  const maxCode = Math.max(maxLocalCode, maxDbfCode);
  
  // Increment the max code for the new subgroup
  return `${subGroup}${(maxCode + 1).toString().padStart(3, '0')}`;
}

app.get('/cash-receipts', async (req, res) => {
  const filePath = path.join(__dirname, '..', 'db', 'cash-receipts.json');
  let nextReceiptNo = 1;

  try {
    const data = await fs.readFile(filePath, 'utf8').then(
      (data) => JSON.parse(data),
      (error) => {
        if (error.code !== 'ENOENT') throw error; // Ignore file not found errors
      },
    );
    if (data && data.length) {
      //highest number +1 sort by receiptNo
      const lastEntry = data.sort((a, b) => a.receiptNo - b.receiptNo).pop();
      nextReceiptNo = Number(lastEntry.receiptNo) + 1;
    }
  } catch (error) {
    console.error('Failed to read or parse cash-receipts.json:', error);
    res.status(500).send('Server error');
    return;
  }

  res.send({ nextReceiptNo });
});

app.get('/subgrp', async (req, res) => {
  try {
    const cmplData = await getCmplData();
    const accountMasterPath = path.join(__dirname, '..', 'db', 'account-master.json');
    const accountMasterData = JSON.parse(await fs.readFile(accountMasterPath, 'utf8'));

    let partyList = newData(cmplData, accountMasterData);
    res.json(partyList);
  } catch (error) {
    console.error('Error fetching or processing data:', error);
    res.status(500).send('Server error');
  }
});

app.get('/cash-payments', async (req, res) => {
  const filePath = path.join(__dirname, '..', 'db', 'cash-payments.json');
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
      nextReceiptNo = Number(lastEntry.voucherNo) + 1;
    }
  } catch (error) {
    console.error('Failed to read or parse cash-payments.json:', error);
    res.status(500).send('Server error');
    return;
  }

  res.send({ nextReceiptNo });
});

app.post('/editCashPay', async (req, res) => {
  const filePath = path.join(__dirname, '..', 'db', 'cash-payments.json');
  try {
    // Read the cash-payments.json file
    const data = await fs.readFile(filePath, 'utf8');
    let cashPayments = JSON.parse(data);

    // Extract and trim the voucherNo from the request body
    const { voucherNo, date, series, party, amount, discount } = req.body;
    const trimmedVoucherNo = voucherNo.trim();

    // Find the index of the entry with the provided voucherNo
    const entryIndex = cashPayments.findIndex(
      (entry) => entry.voucherNo.trim() === trimmedVoucherNo,
    );

    if (entryIndex === -1) {
      res.status(404).json({ message: 'Entry not found' });
      return;
    }

    // Update the entry
    cashPayments[entryIndex] = {
      ...cashPayments[entryIndex], // preserve any fields not being updated
      date,
      series,
      party,
      amount,
      discount,
    };

    // Write the updated data back to the JSON file
    await fs.writeFile(filePath, JSON.stringify(cashPayments, null, 2));

    res.status(200).json({ message: 'Cash payment updated successfully' });
  } catch (error) {
    console.error('Failed to update cash-payments.json:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/editCashReciept', async (req, res) => {
  const filePath = path.join(__dirname, '..', 'db', 'cash-receipts.json');
  try {
    // Read the cash-receipts.json file
    const data = await fs.readFile(filePath, 'utf8').then(
      (data) => JSON.parse(data),
      (error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );

    // Extract and trim the receiptNo from the request body
    const { receiptNo, date, series, party, amount, discount, narration } = req.body;
    const trimmedReceiptNo = receiptNo.trim();

    // Find the index of the entry with the provided receiptNo
    const entryIndex = data.findIndex((entry) => entry.receiptNo.trim() === trimmedReceiptNo);

    if (entryIndex === -1) {
      res.status(404).json({ message: 'Entry not found' });
      return;
    }

    // Update the entry
    data[entryIndex] = {
      ...data[entryIndex], // preserve any fields not being updated
      date,
      series,
      party,
      amount,
      discount,
      narration,
    };

    // Write the updated data back to the JSON file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));

    res.status(200).json({ message: 'Cash receipt updated successfully' });
  } catch (error) {
    console.error('Failed to update cash-receipts.json:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

async function getNextGodownId(req, res) {
  const filePath = path.join(__dirname, '..', 'db', 'godown.json');
  let nextGodownId = 1;

  try {
    const data = await fs.readFile(filePath, 'utf8').then(
      (data) => JSON.parse(data),
      (error) => {
        if (error.code !== 'ENOENT') throw error; // Ignore file not found errors
      },
    );
    const GodownId = data[data.length - 1]?.id || 0;
    const nextGodownId = Number(GodownId) + 1;
    res.send({ nextGodownId });
  } catch (error) {
    console.error('Failed to read or parse godowns.json:', error);
    res.status(500).send('Server error');
  }
}

// Add these at the top with other global variables
let cachedInvoiceIdData = null;
let cachedInvoiceIdHash = null;
let lastInvoiceFileModTimes = {};

async function getInvoiceFileModificationTimes() {
  const filePaths = [
    path.join(__dirname, '..', 'db', 'invoicing.json'),
    path.join(__dirname, '..', '..', 'd01-2324/data/json', 'billdtl.json')
  ];
  
  const modTimes = {};
  for (const file of filePaths) {
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

async function haveInvoiceFilesChanged(newModTimes) {
  // If we don't have last mod times, assume files have changed
  if (Object.keys(lastInvoiceFileModTimes).length === 0) return true;
  
  // Check if any file has a different modification time
  for (const file in newModTimes) {
    if (!lastInvoiceFileModTimes[file] || lastInvoiceFileModTimes[file] !== newModTimes[file]) {
      return true;
    }
  }
  
  return false;
}

async function getNextInvoiceId(req, res) {
  try {
    const clientHash = req.headers['if-none-match'] || req.query.hash;
    
    // Get current file modification times
    const currentFileModTimes = await getInvoiceFileModificationTimes();
    const filesHaveChanged = await haveInvoiceFilesChanged(currentFileModTimes);
    
    // If we have cached data and no file has changed
    if (cachedInvoiceIdData && cachedInvoiceIdHash && !filesHaveChanged) {
      console.log('Invoice source files unchanged, using cached invoice ID data');
      
      // If client hash matches cached hash, return 304
      if (clientHash && (clientHash === cachedInvoiceIdHash || clientHash === `"${cachedInvoiceIdHash}"`)) {
        console.log('Invoice ID data cache hit with 304');
        return res.status(304).set({
          'ETag': `"${cachedInvoiceIdHash}"`,
          'Cache-Control': 'private, max-age=0',
          'Access-Control-Expose-Headers': 'ETag'
        }).send('Not Modified');
      }
      
      // Otherwise return cached data
      res.set({
        'ETag': `"${cachedInvoiceIdHash}"`,
        'Cache-Control': 'private, max-age=0',
        'Access-Control-Expose-Headers': 'ETag'
      });
      return res.json(cachedInvoiceIdData);
    }
    
    // If we get here, files have changed or cache doesn't exist
    console.log('Files changed or no cache, recalculating invoice ID data');
    
    // Get the next invoice ID from invoicing.json as before
    const filePath = path.join(__dirname, '..', 'db', 'invoicing.json');
    const data = await fs.readFile(filePath, 'utf8').then(
      (data) => JSON.parse(data),
      (error) => {
        if (error.code !== 'ENOENT') throw error; // Ignore file not found errors
        return [];
      },
    );
    const GodownId = data.length > 0 ? data[data.length - 1].id : 0;
    const nextInvoiceId = Number(GodownId) + 1;
    
    // Get the billdtl.json data using getSTOCKFILE function
    const billData = await getSTOCKFILE('billdtl.json');
    
    // Calculate the next bill number for each series
    const seriesMap = {};
    
    // Process each bill entry to find max bill number per series
    billData.forEach(entry => {
      const series = entry.SERIES;
      const billNumber = Number(entry.BILL);
      
      if (!seriesMap[series] || billNumber > seriesMap[series]) {
        seriesMap[series] = billNumber;
      }
    });
    
    // Increment each max bill number by 1 to get the next bill number
    const nextSeries = {};
    for (const series in seriesMap) {
      nextSeries[series] = seriesMap[series] + 1;
    }
    
    // Prepare the response data
    const responseData = { 
      nextInvoiceId,
      nextSeries
    };
    
    // Generate a hash for the invoice ID data
    const currentHash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(responseData))
      .digest('hex');
    
    // Update cache and file mod times
    cachedInvoiceIdData = responseData;
    cachedInvoiceIdHash = currentHash;
    lastInvoiceFileModTimes = currentFileModTimes;
    
    // Set ETag header with proper quotes
    const etagValue = `"${currentHash}"`;
    res.set({
      'ETag': etagValue,
      'Cache-Control': 'private, max-age=0',
      'Access-Control-Expose-Headers': 'ETag'
    });
    
    console.log(`Invoice ID API: Generated hash: ${currentHash}, client hash: ${clientHash || 'none'}`);
    
    // Compare again after calculation in case hashes match
    if (clientHash && (clientHash === currentHash || clientHash === `"${currentHash}"`)) {
      console.log('Invoice ID data matches after recalculation');
      return res.status(304).send('Not Modified');
    }
    
    console.log('Sending full invoice ID data');
    res.json(responseData);
  } catch (error) {
    console.error('Failed to process invoice data:', error);
    res.status(500).send('Server error');
  }
}

async function printGodown(req, res) {
  try {
    const { retreat } = req.query;

    let godownData = await fs.readFile(path.join(__dirname, '..', 'db', 'godown.json'), 'utf8');
    godownData = JSON.parse(godownData);

    const godown = godownData.find((godown) => godown.id === retreat);

    const pmplData = await getPMPLData();

    godown.items.forEach((item) => {
      const pmplItem = pmplData.find((pmplItem) => pmplItem.CODE === item.code);
      console.log('pmplItem', pmplItem);
      if (pmplItem) {
        item.particular = pmplItem.PRODUCT;
        item.pack = pmplItem.PACK;
        item.gst = pmplItem.GST;
      }
      console.log('myitem', item);
    });
    res.send(godown);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

const EditUser = async (req, res) => {
  const { id, name, number, routeAccess, password, powers, subgroups, smCode, defaultSeries, canSelectSeries, godownAccess } = req.body; // Updated to use subgroups
  console.log('Editing user', id, name, number, routeAccess, powers, password, subgroups, smCode, defaultSeries, canSelectSeries, godownAccess);

  try {
    // Read users from users.json file
    let users = await fs.readFile(path.join(__dirname, '../db/users.json'));
    // Find the user by ID
    users = JSON.parse(users);
    const user = users.find((user) => user.id === id);

    if (user) {
      // Update the user details
      user.name = name;
      user.number = number;
      user.routeAccess = routeAccess;
      user.password = password;
      user.powers = powers;
      user.subgroups = subgroups; // Update subgroups array
      user.smCode = smCode;
      user.defaultSeries = defaultSeries;
      user.canSelectSeries = canSelectSeries;
      user.godownAccess = godownAccess;

      // For backward compatibility, also set the legacy subgroup field
      // Set it to the first subgroup in the array or null
      user.subgroup = subgroups && subgroups.length > 0 ? subgroups[0] : null;

      // Save the updated users list back to the JSON file
      await fs.writeFile(path.join(__dirname, '../db/users.json'), JSON.stringify(users, null, 2));

      console.log(`User with ID: ${id} updated successfully.`);
      res.status(200).send({ id: id, message: 'User updated successfully' });
    } else {
      // If user with the provided ID is not found, return an error
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).send('Server error');
  }
};

app.get('/json/users', async (req, res) => {
  try {
    const users = await fs.readFile(path.join(__dirname, '../db/users.json'));
    res.send(users);
  } catch (error) {
    console.error('Failed to read users.json:', error);
    res.status(500).send('Server error');
  }
});

app.post('/addUser', async (req, res) => {
  const { name, number, password, routeAccess, powers, username, subgroups, smCode, defaultSeries, canSelectSeries, godownAccess } = req.body; // Updated to use subgroups

  try {
    let users = await fs.readFile('./db/users.json');
    users = JSON.parse(users);

    // Check if the phone number already exists
    const existingUser = users.find((user) => user.number === number);
    if (existingUser) {
      return res.status(400).send({ message: 'Phone number already exists' });
    }

    // Find max id
    const maxId = users.reduce((max, user) => Math.max(max, user.id), 0);

    // Create new user
    const newUser = {
      id: maxId + 1,
      name: name,
      username: username,
      number: number,
      password: password,
      routeAccess: routeAccess,
      powers: powers,
      subgroups: subgroups, // Store subgroups array
      // For backward compatibility
      subgroup: subgroups && subgroups.length > 0 ? subgroups[0] : null,
      smCode: smCode,
      defaultSeries: defaultSeries,
      canSelectSeries: canSelectSeries,
      godownAccess: godownAccess
    };

    // Add new user to users array
    users.push(newUser);

    // Write updated users array back to the file
    await fs.writeFile('./db/users.json', JSON.stringify(users, null, 2));

    res.status(201).send({ message: 'User added successfully', id: newUser.id });
  } catch (error) {
    console.error('Failed to add user:', error);
    res.status(500).send('Server error');
  }
});

async function printInvoicing(req, res) {
  try {
    const { id } = req.query;
    console.log(id);

    let invoiceData = await fs.readFile(path.join(__dirname, '..', 'db', 'invoicing.json'), 'utf8');
    invoiceData = JSON.parse(invoiceData);

    // console.log(invoiceData)
    const invoice = invoiceData.find((inv) => inv.id == (id));
    console.log('THe invoice we found is', invoice);
    const pmplData = await getPMPLData();
    
    // Read balance.json to get the party's balance
    let balanceData = await fs.readFile(path.join(__dirname, '..', 'db', 'balance.json'), 'utf8');
    balanceData = JSON.parse(balanceData);
    
    let cmpl = await completeCmplData(invoice.party);
    console.log('complete cmpl data', cmpl);
    
    // Find party balance from balance.json
    const partyBalance = balanceData.data.find(item => item.partycode === invoice.party);
    const balanceValue = partyBalance ? partyBalance.result : "0 CR";
    
    // Format date in DD-MM-YYYY format
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    };
    
    // Get current time in DD-MM-YYYY HH-MM-SS format
    const getCurrentDateTime = () => {
      const now = new Date();
      const date = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      return `${date} ${time}`;
    };

    // Calculate due date
    const calculateDueDate = (dateString, dueDays) => {
      if (!dueDays) return '';
      
      // Parse the input date correctly
      const parts = dateString.split('-');
      // If date is already in DD-MM-YYYY format
      let date;
      if (parts.length === 3 && parts[0].length === 2) {
        // Input is already DD-MM-YYYY
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        // Assume ISO format or other standard format
        date = new Date(dateString);
      }
      
      // Add the due days
      date.setDate(date.getDate() + parseInt(dueDays));
      
      // Return in DD-MM-YYYY format
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    };
    
    // Count boxes (cases) vs loose items (PCS)
    const countBoxesAndLooseItems = (items) => {
      const boxes = items.reduce((acc, item) => {
        // If unit is BOX or similar, count it as a box
        if (item.unit && (item.unit.toUpperCase() === 'BOX' || item.unit.toUpperCase().includes('BOX'))) {
          return acc + Number(item.qty);
        }
        return acc;
      }, 0);
      
      const looseItems = items.reduce((acc, item) => {
        // If unit is PCS or similar, count it as a loose item
        if (item.unit && (item.unit.toUpperCase() === 'PCS' || item.unit.toUpperCase().includes('PCS'))) {
          return acc + Number(item.qty);
        }
        return acc;
      }, 0);
      
      return { boxes, looseItems };
    };
    
    // Get counts of cases and loose items
    const { boxes, looseItems } = countBoxesAndLooseItems(invoice.items);

    const ModifiedInv = {
      company: {
        name: 'EKTA ENTERPRISES',
        gstin: '23AJBPS6285R1ZF',
        subject: 'Subject to SEONI Jurisdiction',
        fssaiNo: '11417230000027',
        address: 'BUDHWARI BAZAR,GN ROAD SEONI,',
        phone: 'Ph : 9179174888 , 9826623188',
        officeNo: '07692-220897',
        stateCode: '23',
      },
      dlNo:
        invoice.party.dlno ||
        ' 20B/807/54/2022 , 21B/808/54/2022 , 20/805/54/2022 , 21/806/54/2022',
      party: {
        name: cmpl.C_NAME,
        address: cmpl.C_ADD1 || cmpl.C_ADD2,
        gstin: cmpl.C_GST,
        stateCode: cmpl.C_STATE,
        mobileNo: cmpl.C_MOBILE,
        balanceBf: balanceValue,
      },
      invoice: {
        no: `${invoice.id} - ${invoice.series || ''} - ${invoice.billNo || ''}`,
        mode: 'CASH',
        date: formatDate(invoice.date),
        time: getCurrentDateTime(),
        dueDate: calculateDueDate(invoice.date, invoice.dueDays),
        displayNo: `${invoice.series || ''} - ${invoice.billNo || ''}`
      },
      ack: {
        no: "",
        date: "",
      },
      irn: '',
      billMadeBy: req.user ? req.user.name : 'ADMIN',
      items: [
        ...invoice.items.map((item) => {
        const pmplItem = pmplData.find((pmplItem) => pmplItem.CODE === item.item);
          return {
            ...item,
            particular: pmplItem ? pmplItem.PRODUCT : '',
            pack: pmplItem ? pmplItem.PACK : '',
            gst: pmplItem ? pmplItem.GST : 0,
            mrp: pmplItem ? pmplItem.MRP1 : "", 
          };
        }),
      ],
      summary: {
        itemsInBill: invoice.items.length,
        casesInBill: boxes,
        looseItemsInBill: looseItems,
      },
      taxDetails: [
        ...invoice.items.map((item) => {
        const gstRate = pmplData.find((pmplItem) => pmplItem.CODE === item.item)?.GST || 0;
          // Calculate taxable value properly - NET_AMT / (100+GST%) * 100
          const taxableValue = Number(item.netAmount) / (100 + gstRate) * 100;
          
          return {
            goods: taxableValue.toFixed(2),
            sgst: gstRate / 2,
            sgstValue: (taxableValue * (gstRate / 2)) / 100 || 0,
            cgst: gstRate / 2,
            cgstValue: (taxableValue * (gstRate / 2)) / 100 || 0,
          };
        }),
      ],
      totals: {
        grossAmt: invoice.items.reduce((acc, item) => acc + Number(item.netAmount), 0),
        lessSch: 0.0,
        lessCd: 0.0,
        rOff: 0.0,
        netAmount: invoice.items.reduce((acc, item) => acc + Number(item.netAmount), 0),
      },
    };
    console.log(ModifiedInv);

    res.send(ModifiedInv);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Server error');
  }
}

app.get('/invocingPage', async (req, res) => {
  const { id } = req.query;

  let baseurl = req.protocol + '://' + req.get('host');

  let invoiceData = await fetch(baseurl + '/slink/printInvoice?id=' + id, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  invoiceData = await invoiceData.json();
  invoiceData = JSON.stringify(invoiceData);

  let encodedData = btoa(invoiceData);

  res.send({ value: encodedData });
  // console.log(encodedData);
});

app.get('/printInvoice', printInvoicing);

const DeleteUser = async (req, res) => {
  // const { id } = req.params; // Get user ID from the URL parameters
  const { id } = req.query; // Get user ID from the query parameters
  console.log('Deleting user with ID:', id);

  try {
    // Read the users from the users.json file
    let users = await fs.readFile(path.join(__dirname, '../db/users.json'));
    users = JSON.parse(users);

    // Find the index of the user with the given ID
    const userIndex = users.findIndex((user) => user.id === Number(id));

    if (userIndex !== -1) {
      // Remove the user from the users array
      users.splice(userIndex, 1);

      // Save the updated users list back to the JSON file
      await fs.writeFile(path.join(__dirname, '../db/users.json'), JSON.stringify(users, null, 2));

      console.log(`User with ID: ${id} deleted successfully.`);
      res.status(200).send({ id: id, message: 'User deleted successfully' });
    } else {
      // If user with the provided ID is not found, return an error
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Server error');
  }
};
app.get('/deleteUser', DeleteUser);
app.post('/editUser', EditUser);
app.get('/printGodown', printGodown);
app.get('/godownId', getNextGodownId);
app.get('/invoiceId', getNextInvoiceId);

app.get('/printPage', async (req, res) => {
  console.log('printPage');

  // console.log(path.join(__dirname, '..', 'dist', 'index.html'));
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});
module.exports = app;
