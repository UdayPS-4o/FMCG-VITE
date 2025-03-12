const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const {
  redirect,
  getDbfData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
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
  // 'd01-2324',
  //           'data',
  //           'json',
  // cmpl.json
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

  let usersList = json.map((user) => ({
    name: user.C_NAME,
    title: user.C_NAME,
    email: user.C_CODE,
    value: user.C_CODE.substring(0, 2),
  }));

  usersList = usersList.filter((user) => user.email.endsWith('000'));
  usersList = usersList.filter((user) => user.name && user.email);
  usersList.sort((a, b) => a.email.localeCompare(b.email));

  let newUserList = usersList.map((user) => ({
    title: user.name,
    subgroupCode: getNextSubgroupCode(accountMasterData, user.value),
  }));

  return newUserList;
}

function getNextSubgroupCode(accountMasterData, subGroup) {
  let maxCode = 0;

  // Filter entries in accountMasterData that match the current subGroup prefix
  const filterData = accountMasterData.filter((entry) => entry.subgroup.startsWith(subGroup));

  if (filterData.length > 0) {
    // Iterate through filtered data to find the highest subgroup number
    filterData.forEach((entry) => {
      const entryNumber = parseInt(entry.subgroup.slice(2), 10); // Get the numeric part of the subgroup code
      if (maxCode < entryNumber) {
        maxCode = entryNumber;
      }
    });
    // Increment the max code for the new subgroup
    return subGroup + (maxCode + 1).toString().padStart(3, '0');
  }

  // If no matching subgroup exists, return the initial code
  return `${subGroup}001`;
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
    const { receiptNo, date, series, party, amount, discount } = req.body;
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
    const GodownId = data[data.length - 1].id;
    const nextGodownId = Number(GodownId) + 1;
    res.send({ nextGodownId });
  } catch (error) {
    console.error('Failed to read or parse godowns.json:', error);
    res.status(500).send('Server error');
  }
}

async function getNextInvoiceId(req, res) {
  const filePath = path.join(__dirname, '..', 'db', 'invoicing.json');
  let nextGodownId = 1;

  try {
    const data = await fs.readFile(filePath, 'utf8').then(
      (data) => JSON.parse(data),
      (error) => {
        if (error.code !== 'ENOENT') throw error; // Ignore file not found errors
      },
    );
    const GodownId = data[data.length - 1].id;
    const nextInvoiceId = Number(GodownId) + 1;
    res.send({ nextInvoiceId });
  } catch (error) {
    console.error('Failed to read or parse godowns.json:', error);
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
  const { id, name, number, routeAccess, password, powers, subgroup } = req.body; // Include subgroup in the destructure
  console.log('Editing user', id, name, number, routeAccess, powers, password, subgroup);

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
      user.subgroup = subgroup; // Update the subgroup field

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
  const { name, number, password, routeAccess, powers, username, subgroup } = req.body;

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
      subgroup: subgroup,
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
    const invoice = invoiceData.find((inv) => inv.id === Number(id));
    console.log('THe invoice we found is', invoice);
    const pmplData = await getPMPLData();
    let accountMasterData = await fs.readFile(
      path.join(__dirname, '..', 'db', 'account-master.json'),
      'utf8',
    );

    // filter by cmpl
    // accountMasterData = JSON.parse(accountMasterData);

    // accountMasterData = accountMasterData.filter((item) => item.subgroup === invoice.party);
    // console.log('Account Master Data', accountMasterData);
    // invoice.party = accountMasterData[0];

    let cmpl = await completeCmplData(invoice.party);
    console.log('complete cmpl  data', cmpl);
    // console.log('cmplData', cmplData);
    console.log('invoice.party', invoice.party);

    // console.log("before party",invoice.party)
    console.log('party', invoice.party);
    // console.log("After party",letinvoice.party)

    const ModifiedInv = {
      company: {
        name: 'EKTA ENTERPRICE',
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
        balanceBf: invoice.items.reduce((acc, item) => acc + item.netAmt, 0) || 0,
      },
      invoice: {
        no: invoice.id,
        mode: 'CASH',
        date: invoice.date,
        time: new Date().toLocaleTimeString(),
        dueDate: invoice.dueDays
          ? new Date(invoice.date).setDate(new Date(invoice.date).getDate() + invoice.dueDays)
          : '',
      },
      ack: {
        no: invoice.id,
        date: invoice.date,
      },
      irn: '0265cdbc86f02a327272925c34fd6014d5701a832b58d00f5b5b85cf452f30b8',
      items: [
        // { particulars: "CHAVI WAX 40'S HM 36050010", pack: "BDLS", mrp: 600.00, gst: 12.00, rate: 460.00, unit: "BOX", qty: 60, free: 0, schRs: "", netAmount: 27600.00 },

        ...invoice.items.map((item) => {
          item.particular = pmplData.find((pmplItem) => pmplItem.CODE === item.item).PRODUCT;
          item.pack = pmplData.find((pmplItem) => pmplItem.CODE === item.item).PACK;
          item.gst = pmplData.find((pmplItem) => pmplItem.CODE === item.item).GST;
          return item;
        }),
      ],
      summary: {
        itemsInBill: invoice.items.length,
        casesInBill: invoice.items.reduce((acc, item) => acc + Number(item.qty), 0),
        looseItemsInBill: invoice.items.reduce((acc, item) => acc + item.free, 0) || 0,
      },
      taxDetails: [
        // { goods: 3807.49, sgst: 2.50, sgstValue: 95.190, cgst: 2.50, cgstValue: 95.190 },

        ...invoice.items.map((item) => {
          return {
            goods: item.netAmount,
            sgst: item.gst / 2,
            sgstValue: (item.netAmount * (item.gst / 2)) / 100 || 0,
            cgst: item.gst / 2,
            cgstValue: (item.netAmount * (item.gst / 2)) / 100 || 0,
          };
        }),
      ],
      totals: {
        // grossAmt: 31721.52,
        // lessSch: 0.00,
        // lessCd: 123.65,
        // rOff: 0.00,
        // netAmount: 31598.00
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
