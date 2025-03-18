const express = require('express');
const app = express.Router();
const fs = require('fs');
const fss = require('fs/promises');
const path = require('path');

const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require('./utilities');

const uniqueIdentifiers = ['receiptNo', 'voucherNo', 'subgroup', 'id'];

app.post('/:formType', async (req, res) => {
  const { formType } = req.params;
  const formData = req.body;
  const { email, mobile, aadhar } = req.body;
  console.log(req.body);
  console.log(__dirname);

  // Special handling for invoicing - generate a new ID based on series
  if (formType === 'invoicing') {
    try {
      const filePath = path.join(__dirname, '..', 'db', `${formType}.json`);
      let dbData = [];
      
      try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        dbData = JSON.parse(data);
      } catch (err) {
        console.log('No existing invoicing file, creating a new one.');
      }
      
      // Extract series from form data
      const series = formData.series || 'T';
      
      // Find the highest ID for this series
      let maxId = 0;
      dbData.forEach(invoice => {
        if (invoice.series === series && parseInt(invoice.id) > maxId) {
          maxId = parseInt(invoice.id);
        }
      });
      
      // Assign the next ID
      formData.id = (maxId + 1).toString();
      console.log(`Generated new ID ${formData.id} for series ${series}`);
    } catch (err) {
      console.error('Error generating invoice ID:', err);
      return res.status(500).send('Failed to generate invoice ID.');
    }
  }

  const accountMasterPath = path.join(__dirname, '..', 'db', 'account-master.json');
  const accountMasterData = JSON.parse(await fss.readFile(accountMasterPath, 'utf8'));
  // console.log(accountMasterData, 'accountMasterData');
  accountMasterData.forEach((element) => {
    if (element.email == email || element.mobile == mobile) {
      console.log(`User with same ${element.email == email ? 'email' : 'mobile'} already exists`);
      res
        .status(400)
        .send({
          message: `User with same ${element.email == email ? 'email' : 'mobile'} already exists`,
        });
      return;
    }
  });

  // Parse formData.items if it's a JSON string
  if (formData.items && typeof formData.items === 'string') {
    try {
      formData.items = JSON.parse(formData.items);
    } catch (err) {
      res.status(400).send({ message: 'Invalid format for items.' });
    }
  }

  // Store the original formData for potential logging
  const ogform = JSON.parse(JSON.stringify(formData));

  // Safely parse formData.party if it's a JSON string
  if (formData.party && typeof formData.party === 'string') {
    try {
      const parsedParty = JSON.parse(formData.party);
      formData.party = Array.isArray(parsedParty) ? parsedParty[0].value : parsedParty;
    } catch (e) {
      formData.party = formData.party; // Keep the original string if parsing fails
    }
  }

  // Safely parse formData.subgroup if it's a JSON string
  if (formData.subgroup && typeof formData.subgroup === 'string') {
    try {
      const parsedSubgroup = JSON.parse(formData.subgroup);
      formData.subgroup = Array.isArray(parsedSubgroup) ? parsedSubgroup[0].value : parsedSubgroup;
    } catch (e) {
      formData.subgroup = formData.subgroup; // Keep the original string if parsing fails
    }
  }

  const filePath = path.join(__dirname, '..', 'db', `${formType}.json`);

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
      if (number === 0) return words;
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

  function ToBeRedirect(formType, val) {
    if (formType === 'cash-receipts') {
      let url = `/print?date=${formData.date}&receiptNo=${formData.receiptNo}&amount=${
        formData.amount
      }&inWords=${convertAmountToWords(formData.amount)}&party=${formData.party}&series=${
        formData.series
      }&discount=${formData.discount}&name=${formData.name}`;
      res.send({ url });
    }
    if (formType === 'godown') {
      let url = `/printGODOWN?data=${encodeURIComponent(JSON.stringify(formData))}`;
      res.send({ url });
    }
    res.send({ url: `/db/${formType}` });
  }

  try {
    let dbData = [];
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      dbData = JSON.parse(data);
    } catch (err) {
      console.log('No existing file, creating a new one.' + err);
    }

    // For invoicing, check if the combination of series+id already exists
    if (formType === 'invoicing') {
      const entryExists = dbData.some(
        (entry) => entry.series === formData.series && entry.id === formData.id
      );
      
      if (entryExists) {
        return res
          .status(400)
          .send(`Error: Entry with series ${formData.series} and ID ${formData.id} already exists.`);
      }
    } else {
      // For other form types, use the existing validation logic
      const validKEY = uniqueIdentifiers.find((key) => formData[key]);
      const entryExists = dbData.some((entry) => entry[validKEY] === formData[validKEY]);
      
      if (entryExists) {
        return res
          .status(400)
          .send(
            'Error: Entry with this receiptNo already exists. ' +
              validKEY +
              ' | ' +
              JSON.stringify(ogform),
          );
      }
    }
    
    // Add a timestamp
    formData.createdAt = new Date().toISOString();
    
    // Add the data to the database
    dbData.push(formData);
    await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
    
    // Return the newly assigned ID for invoicing
    if (formType === 'invoicing') {
      return res.status(200).json({ 
        message: 'Entry added successfully.',
        id: formData.id,
        series: formData.series 
      });
    }
    
    res.status(200).json({ message: 'Entry added successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to add data.');
  }
});

app.post('/edit/:formType', async (req, res) => {
  const { formType } = req.params;
  const formData = req.body;
  console.log({formData});
  console.log(`Processing edit request for ${formType}`);
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

  const filePath = path.join(__dirname, '..', 'db', `${formType}.json`);

  console.log(`Checking if the file exists: ${filePath}`);

  try {
    let dbData;
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      dbData = JSON.parse(data);
      console.log(`Successfully read ${dbData.length} records from ${formType} database`);
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        console.error(`File not found: ${filePath}`);
        return res.status(404).send('Database file does not exist.');
      } else {
        console.error('Error reading database file:', readError);
        return res.status(500).send('Database file read error: ' + readError.message);
      }
    }

    // Find entry using appropriate identifiers based on form type
    let entryIndex = -1;
    
    if (formType === 'invoicing') {
      // For invoicing, look for combination of series and id fields
      console.log(`Looking for invoicing with series: ${formData.series} and id: ${formData.id}`);
      entryIndex = dbData.findIndex((entry) => 
        String(entry.id) === String(formData.id) && 
        entry.series === formData.series
      );
    } else {
      // For other types, try standard identifiers
      if (formData.receiptNo) {
        entryIndex = dbData.findIndex((entry) => entry.receiptNo === formData.receiptNo);
      } else if (formData.voucherNo) {
        entryIndex = dbData.findIndex((entry) => entry.voucherNo === formData.voucherNo);
      } else if (formData.id) {
        entryIndex = dbData.findIndex((entry) => String(entry.id) === String(formData.id));
      } else if (formType === 'account-master' && formData.subgroup) {
        console.log(`Looking for account-master record with subgroup: ${formData.subgroup}`);
        entryIndex = dbData.findIndex((entry) => String(entry.subgroup) === String(formData.subgroup));
        
        // Only if not found by subgroup and achead exists, try achead as fallback
        if (entryIndex === -1 && formData.achead) {
          console.log(`Not found by subgroup, trying achead: ${formData.achead}`);
          entryIndex = dbData.findIndex((entry) => String(entry.achead) === String(formData.achead));
        }
      }
    }

    if (entryIndex > -1) {
      console.log(`Found entry at index ${entryIndex}, updating...`);
      
      // Create a new object by merging the existing data with the updated data
      // This preserves any fields in the original record that weren't included in the form
      dbData[entryIndex] = { 
        ...dbData[entryIndex], 
        ...formData,
        // Add an updated timestamp
        lastUpdated: new Date().toISOString()
      };
      
      try {
        await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
        console.log(`Successfully updated ${formType} record with id ${formData.id}`);
        res.status(200).json({ 
          message: 'Entry updated successfully.',
          id: formData.id,
          series: formData.series
        });
      } catch (writeError) {
        console.error('Error writing to database file:', writeError);
        res.status(500).send('Failed to write updated data: ' + writeError.message);
      }
    } else {
      console.log('Entry not found, request data:', formData);
      res.status(404).send(
        `Error: Entry not found in database. The record with ID ${formData.id} could not be found.`
      );
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).send('Failed to edit data: ' + err.message);
  }
});

// Specific route for editing invoices
// app.post('/edit/invoicing', async (req, res) => {
//   console.log('Edit invoicing request received');
//   const formData = req.body;
  
//   try {
//     console.log('Processing edit request for invoicing');
//     console.log('Request body keys:', Object.keys(formData));
    
//     // Parse items and party if they are strings
//     if (formData.items && typeof formData.items === 'string') {
//       try {
//         formData.items = JSON.parse(formData.items);
//         console.log('Parsed items:', formData.items.length);
//       } catch (e) {
//         console.error('Failed to parse items JSON string:', e);
//       }
//     }
    
//     if (formData.party && typeof formData.party === 'string') {
//       try {
//         formData.party = JSON.parse(formData.party);
//         console.log('Parsed party:', formData.party);
//       } catch (e) {
//         console.error('Failed to parse party JSON string:', e);
//       }
//     }
    
//     // Check if the database file exists
//     const filePath = path.join(__dirname, '..', 'db', 'invoicing.json');
//     let dbData = [];
    
//     try {
//       const data = await fs.promises.readFile(filePath, 'utf8');
//       dbData = JSON.parse(data);
//       console.log(`Retrieved ${dbData.length} records from database`);
//     } catch (readError) {
//       if (readError.code === 'ENOENT') {
//         console.log('Database file does not exist, creating new file');
//       } else {
//         throw readError;
//       }
//     }
    
//     // Find the entry to update
//     let entryIndex = -1;
    
//     if (formData.id) {
//       entryIndex = dbData.findIndex((entry) => String(entry.id) === String(formData.id));
//     }
    
//     if (entryIndex > -1) {
//       console.log(`Found entry at index ${entryIndex}, updating...`);
      
//       // Create a new object by merging the existing data with the updated data
//       dbData[entryIndex] = { 
//         ...dbData[entryIndex], 
//         ...formData,
//         lastUpdated: new Date().toISOString()
//       };
      
//       try {
//         await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
//         console.log(`Successfully updated invoicing record with id ${formData.id}`);
//         res.status(200).json({ 
//           message: 'Entry updated successfully.',
//           id: formData.id
//         });
//       } catch (writeError) {
//         console.error('Error writing to database file:', writeError);
//         res.status(500).send('Failed to write updated data: ' + writeError.message);
//       }
//     } else {
//       console.log('Entry not found, request data:', formData);
//       res.status(404).send(
//         `Error: Entry not found in database. The record with ID ${formData.id} could not be found.`
//       );
//     }
//   } catch (err) {
//     console.error('Unexpected error:', err);
//     res.status(500).send('Failed to edit data: ' + err.message);
//   }
// });

app.get('/add/godown', async (req, res) => {
  let { data } = req.query;
  const filePath = path.join(__dirname, '..', 'db', 'godown.json');

  data = decodeURIComponent(data);
  data = JSON.parse(data);

  const getDbfData = async (file) => {
    let filepath = path.join(
      __dirname,
      '..',
      '..',
      'd01-2324',
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
      __dirname,
      '..',
      '..',
      'd01-2324',
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
