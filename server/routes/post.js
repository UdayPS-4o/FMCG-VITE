const express = require('express');
const app = express.Router();
const fs = require('fs');
const fss = require('fs/promises');
const path = require('path');
const { sendNotificationToAdmins } = require('./push');

require('dotenv').config();

const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require('./utilities');

const uniqueIdentifiers = ['receiptNo', 'voucherNo', 'subgroup', 'id'];

function formatFormType(formType) {
  if (!formType) return '';
  return formType
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

let cmplCache = null;
async function getPartyName(partyCode) {
    if (!partyCode) return null;
    try {
        if (!cmplCache) {
            const cmplDataPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
            const cmplData = await fss.readFile(cmplDataPath, 'utf8');
            cmplCache = JSON.parse(cmplData);
        }
        const party = cmplCache.find(p => p.C_CODE === partyCode);
        return party ? party.C_NAME.trim() : null;
    } catch (error) {
        console.error('Error reading or parsing CMPL.json:', error);
        cmplCache = null;
        return null;
    }
}

app.post('/:formType', async (req, res) => {
  const { formType } = req.params;
  const formData = req.body;
  const { email, mobile, aadhar } = req.body;
  
  const filePath = path.join(__dirname, '..', 'db', `${formType}.json`);
  let dbData = [];
  let shouldSave = true;

  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    dbData = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error reading database file:', err);
      return res.status(500).send('Error reading database file.');
    }
  }

  if (formType === 'invoicing') {
    const series = formData.series?.toUpperCase();
    const billNo = formData.billNo;
    
    if (!series || !billNo) {
       return res.status(400).send('Missing series or bill number in request.');
    }
    
    const duplicate = dbData.find(
      invoice => invoice.series?.toUpperCase() === series && String(invoice.billNo) === String(billNo)
    );
    
    if (duplicate) {
      return res.status(409).json({
        error: 'Duplicate bill number',
        message: `Bill number ${billNo} for series ${series} already exists.`,
      });
    }
    
    let maxId = 0;
    dbData.forEach(invoice => {
      const currentId = parseInt(invoice.id || 0, 10);
      if (currentId > maxId) {
        maxId = currentId;
      }
    });
    
    formData.id = (maxId + 1).toString();
  }
  console.log('-------------------------------------------');
  if (shouldSave) {
    try {
      
      formData.createdAt = new Date().toISOString();
      dbData.push(formData);
      await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');

      // --- PUSH NOTIFICATION LOGIC ---
      const uniqueIdField = uniqueIdentifiers.find(id => formData[id]);
      const uniqueId = formData[uniqueIdField];
      const user = req.user || { name: 'A user' }; // Fallback user

      const { smName, series, amount, date, total, party } = formData;
      let creatorName = smName || user.name;
      if (creatorName) {
        // Sanitize creatorName to remove localhost prefix
        creatorName = creatorName;
      }
      const formTypeFormatted = formatFormType(formType);
      const notificationAmount = amount || total || 0;

      let message = `${creatorName} has created a ${formTypeFormatted} ${series}-${formData.billNo} of ₹${notificationAmount}`;

      if (party) {
          const partyName = await getPartyName(party);
          if (partyName) {
              message += ` for ${partyName}`;
          }
      }

      if (date) {
          const entryDate = new Date(date);
          const today = new Date();
          entryDate.setHours(0, 0, 0, 0);
          today.setHours(0, 0, 0, 0);

          if (entryDate.getTime() !== today.getTime()) {
              const dateString = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
              message += ` on ${dateString}`;
          }
      }

      const title = `New Entry in ${formTypeFormatted}`;

      const notificationPayload = {
        title: title,
        message: message,
        data: {
          url: `https://ekta-enterprises.com/proxy/api/approve-from-notification?endpoint=${formType}&id=${uniqueId}`,
          endpoint: formType,
          id: uniqueId
        } 
      };
      sendNotificationToAdmins(notificationPayload);
      // --- END PUSH NOTIFICATION LOGIC ---

      return res.status(200).json({ 
          message: 'Entry added successfully.',
          id: formData.id,
      });
      
    } catch (err) {
      console.error('Error writing data to file:', err);
      return res.status(500).send('Failed to save data.');
    }
  }
});

app.post('/edit/:formType', async (req, res) => {
  const { formType } = req.params;
  const formData = req.body;
  
  if (formData.items && typeof formData.items === 'string') {
    try {
      formData.items = JSON.parse(formData.items);
    } catch (error) {
      return res.status(400).send('Invalid format for items.');
    }
  }

  if (formData.party && typeof formData.party === 'string') {
    if (!/^[a-zA-Z0-9]+$/.test(formData.party)) {
        try {
            const partyData = JSON.parse(formData.party);
            formData.party = partyData.value;
        } catch (err) {
            console.error('Failed to parse party data, using original value');
        }
    }
  } else if (formData.party && typeof formData.party === 'object' && formData.party.value) {
    formData.party = formData.party.value;
  }

  const filePath = path.join(__dirname, '..', 'db', `${formType}.json`);

  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    let dbData = JSON.parse(data);

    const identifier = uniqueIdentifiers.find((key) => formData[key]);

    if (!identifier) {
      return res.status(400).send('No valid identifier provided.');
    }
    
    const entryIndex = dbData.findIndex(
      (entry) => String(entry[identifier]) === String(formData[identifier]),
    );

    if (entryIndex === -1) {
      return res.status(404).send('Entry not found.');
    }

    const originalCreatedAt = dbData[entryIndex].createdAt;
    dbData[entryIndex] = { ...dbData[entryIndex], ...formData, updatedAt: new Date().toISOString() };
    if (originalCreatedAt) {
      dbData[entryIndex].createdAt = originalCreatedAt;
    }

    await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
    
    // --- PUSH NOTIFICATION LOGIC ---
    const uniqueId = formData[identifier];
    const user = req.user || { name: 'A user' }; // Fallback user

    const { smName, series, amount, date, total, party } = formData;
    let creatorName = smName || user.name;
    if (creatorName) {
      // Sanitize creatorName to remove localhost prefix
      creatorName = creatorName.replace(/localhost:3000\s*/, '').trim();
    }
    const formTypeFormatted = formatFormType(formType);
    const notificationAmount = amount || total || 0;

    let message = `${creatorName} has updated a ${formTypeFormatted} ${series}-${formData.billNo} of ₹${notificationAmount}`;

    if (party) {
        const partyName = await getPartyName(party);
        if (partyName) {
            message += ` for ${partyName}`;
        }
    }

    if (date) {
        const entryDate = new Date(date);
        const today = new Date();
        entryDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (entryDate.getTime() !== today.getTime()) {
            const dateString = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            message += ` on ${dateString}`;
        }
    }
    
    const title = `Entry Edited in ${formTypeFormatted}`;

    const notificationPayload = {
      title: title,
      message: message,
      data: {
        url: `${req.protocol}://${req.get('host')}/api/approve-from-notification?endpoint=${formType}&id=${uniqueId}`,
        endpoint: formType,
        id: uniqueId
      }
    };
    sendNotificationToAdmins(notificationPayload);
    // --- END PUSH NOTIFICATION LOGIC ---
    
    res.status(200).json({
      message: 'Entry updated successfully',
      data: dbData[entryIndex],
    });
  } catch (err) {
    console.error(`Error updating entry for ${formType}:`, err);
    res.status(500).send('Error updating entry.');
  }
});

app.get('/add/godown', async (req, res) => {
  let { data } = req.query;
  const filePath = path.join(__dirname, '..', 'db', 'godown.json');

  data = decodeURIComponent(data);
  data = JSON.parse(data);

  const getDbfData = async (file) => {
    let filepath = path.join(
      process.env.DBF_FOLDER_PATH,
      'data',
      'json',
      file.replace(/\.dbf$/i, '.json'),
    );
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  };
  const jsonGodown = await getDbfData('godown.json');
  const pmplJSON = (await getDbfData('pmpl.json')).filter((item) => item.STK > 0);

  function findElmPMPL(code) {
    return pmplJSON.find((item) => item.CODE === code);
  }

  let datax = {};
  datax.voucher = {
    number: data.series + ' - ' + data.id,
    id: data.id,
    date: data.date,
    transfer_from: jsonGodown.find((item) => item.GDN_CODE === data.fromGodown).GDN_NAME,
    transfer_to: jsonGodown.find((item) => item.GDN_CODE === data.toGodown).GDN_NAME,
  };

  let i = 1;
  datax.items = data.items.map((item) => {
    const pmplItem = findElmPMPL(item.code);
    return {
      s_n: i++,
      code: item.code,
      particular: pmplItem.PRODUCT,
      pack: pmplItem.PACK,
      gst_percent: parseFloat(pmplItem.GST).toFixed(2),
      unit:
        (item.unit == '01' ? pmplItem.UNIT_1 : pmplItem.UNIT_2) +
        (pmplItem.UNIT_1 == pmplItem.UNIT_2 && pmplItem.MULT_F == 1 ? '' : ' - ' + pmplItem.MULT_F),
      quantity: item.qty,
    };
  });

  res.send(JSON.stringify(datax));
});

app.get('/api/TRFLAST', async (req, res) => {
  const getDbfData = async (file) => {
    let filepath = path.join(
      process.env.DBF_FOLDER_PATH,
      'data',
      'json',
      file.replace(/\.dbf$/i, '.json'),
    );
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  };
  const trfJSON = await getDbfData('transfer.json');
  const TRFLAST = parseInt(trfJSON[trfJSON.length - 1].BILL);
  const godownJSON = await fs.promises
    .readFile(path.join(__dirname, '..', 'db', 'godown.json'), 'utf8')
    .then((data) => JSON.parse(data));
  const LOCALLAST = parseInt(godownJSON[godownJSON.length - 1].id);

  res.send(`${Math.max(TRFLAST, LOCALLAST) + 1}`);
});

// Add a route for editing approved records
app.post('/edit/approved/:formType', async (req, res) => {
  const { formType } = req.params;
  const formData = req.body;
  console.log({formData});
  console.log(`Processing edit request for approved ${formType}`);
  console.log('Request body keys:', Object.keys(formData));
  
  // Handle items parsing more robustly
  if (formData.items && typeof formData.items === 'string') {
    try {
      formData.items = JSON.parse(formData.items);
      console.log(`Successfully parsed ${formData.items.length} items`);
    } catch (error) {
      console.error('Failed to parse items:', error);
      return res.status(400).send('Invalid format for items.');
    }
  }

  // Handle party data
  if (formData.party && typeof formData.party === 'string') {
    try {
      // Check if party is already a string ID or needs parsing
      if (formData.party.startsWith('{') || formData.party.startsWith('[')) {
        const parsed = JSON.parse(formData.party);
        formData.party = Array.isArray(parsed) ? parsed[0].value : parsed.value;
      }
      // Store the original party value if it wasn't JSON
      console.log('Using party as string:', formData.party);
    } catch (error) {
      // If parsing fails, keep the original string value
      console.log('Using party as string (parse failed):', formData.party);
    }
  }

  const filePath = path.join(__dirname, '..', 'db', 'approved', `${formType}.json`);

  console.log(`Checking if the approved file exists: ${filePath}`);

  try {
    let dbData = [];
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      dbData = JSON.parse(data);
      console.log(`Successfully read ${dbData.length} records from approved ${formType} database`);
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        console.log(`Approved file not found: ${filePath}, creating new file`);
        // Ensure directory exists
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      } else {
        console.error('Error reading approved database file:', readError);
        return res.status(500).send('Approved database file read error: ' + readError.message);
      }
    }

    // Find entry using appropriate identifiers based on form type
    let entryIndex = -1;
    
    if (formType === 'account-master' && formData.subgroup) {
      console.log(`Looking for approved account-master record with subgroup: ${formData.subgroup}`);
      entryIndex = dbData.findIndex((entry) => String(entry.subgroup) === String(formData.subgroup));
      
      // Only if not found by subgroup and achead exists, try achead as fallback
      if (entryIndex === -1 && formData.achead) {
        console.log(`Not found by subgroup, trying achead: ${formData.achead}`);
        entryIndex = dbData.findIndex((entry) => String(entry.achead) === String(formData.achead));
      }
    } else {
      // For other types, try standard identifiers
      if (formData.receiptNo) {
        entryIndex = dbData.findIndex((entry) => entry.receiptNo === formData.receiptNo);
      } else if (formData.voucherNo) {
        entryIndex = dbData.findIndex((entry) => entry.voucherNo === formData.voucherNo);
      } else if (formData.id) {
        entryIndex = dbData.findIndex((entry) => String(entry.id) === String(formData.id));
      }
    }

    if (entryIndex > -1) {
      console.log(`Found approved entry at index ${entryIndex}, updating...`);
      
      // Create a new object by merging the existing data with the updated data
      dbData[entryIndex] = { 
        ...dbData[entryIndex], 
        ...formData,
        // Add an updated timestamp
        lastUpdated: new Date().toISOString()
      };
      
      try {
        await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
        console.log(`Successfully updated approved ${formType} record`);
        res.status(200).json({ 
          message: 'Approved entry updated successfully.'
        });
      } catch (writeError) {
        console.error('Error writing to approved database file:', writeError);
        res.status(500).send('Failed to write updated approved data: ' + writeError.message);
      }
    } else {
      console.log('Approved entry not found, adding as new entry');
      
      // Add a timestamp
      formData.createdAt = new Date().toISOString();
      
      // Add the data to the database
      dbData.push(formData);
      
      try {
        await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
        console.log(`Successfully added new approved ${formType} record`);
        res.status(200).json({ 
          message: 'Approved entry added successfully.'
        });
      } catch (writeError) {
        console.error('Error writing to approved database file:', writeError);
        res.status(500).send('Failed to write new approved data: ' + writeError.message);
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).send('Failed to edit approved data: ' + err.message);
  }
});

module.exports = app;
