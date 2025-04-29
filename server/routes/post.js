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
  console.log('Received form data for:', formType, req.body);
  
  const filePath = path.join(__dirname, '..', 'db', `${formType}.json`);
  let dbData = [];
  let shouldSave = true; // Flag to control saving

  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    dbData = JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No existing file, creating a new one.');
    } else {
      console.error('Error reading database file:', err);
      return res.status(500).send('Error reading database file.');
    }
  }

  // Special handling for invoicing - generate ID and check for duplicates
  if (formType === 'invoicing') {
    try {
      const series = formData.series?.toUpperCase(); // Ensure consistent casing
      const billNo = formData.billNo;
      
      if (!series || !billNo) {
         console.error('Missing series or billNo in invoicing data');
         return res.status(400).send('Missing series or bill number in request.');
      }
      
      // Check if the series + billNo combination already exists
      const duplicate = dbData.find(
        invoice => invoice.series?.toUpperCase() === series && String(invoice.billNo) === String(billNo)
      );
      
      if (duplicate) {
        shouldSave = false; // Don't save if duplicate found
        let suggestedBillNo;
        
        // Try to get the next expected bill number as suggestion
        try {
          const protocol = req.protocol || 'http';
          const host = req.get('host') || 'localhost:8000';
          const baseUrl = `${protocol}://${host}`;
          const invoiceIdResponse = await fetch(`${baseUrl}/slink/invoiceId`, {
             headers: { 'Authorization': req.headers.authorization || '' } // Pass auth token if present
          });
          if (invoiceIdResponse.ok) {
            const invoiceIdData = await invoiceIdResponse.json();
            suggestedBillNo = invoiceIdData.nextSeries[series];
          }
        } catch (fetchError) {
          console.warn('Could not fetch next invoice ID for suggestion:', fetchError.message);
        }
        
        // If suggestion couldn't be fetched, calculate based on current data
        if (!suggestedBillNo) {
            let maxBillNo = 0;
            dbData.forEach(invoice => {
              if (invoice.series?.toUpperCase() === series && parseInt(invoice.billNo) > maxBillNo) {
                maxBillNo = parseInt(invoice.billNo);
              }
            });
            suggestedBillNo = maxBillNo + 1;
        }
        
        console.log(`Duplicate found for Series: ${series}, BillNo: ${billNo}. Suggesting: ${suggestedBillNo}`);
        // Return a conflict error with suggested next bill number
        return res.status(409).json({
          error: 'Duplicate bill number',
          message: `Bill number ${billNo} for series ${series} already exists.`,
          suggestedBillNo: suggestedBillNo?.toString() // Ensure it's a string
        });
      }
      
      // Find the highest ID overall (regardless of series) to generate the next internal ID
      let maxId = 0;
      dbData.forEach(invoice => {
        const currentId = parseInt(invoice.id || 0, 10);
        if (currentId > maxId) {
          maxId = currentId;
        }
      });
      
      // Assign the next internal ID
      formData.id = (maxId + 1).toString();
      console.log(`Assigning new internal ID ${formData.id} for Series: ${series}, BillNo: ${billNo}`);
      
    } catch (err) {
      console.error('Error processing invoice ID or duplicate check:', err);
      return res.status(500).send('Failed to process invoice: ' + err.message);
    }
  } else if (formType === 'account-master') {
      // Handle potential duplicates for account-master (email/mobile)
      const accountMasterPath = path.join(__dirname, '..', 'db', 'account-master.json');
      try {
          const accountMasterData = JSON.parse(await fss.readFile(accountMasterPath, 'utf8'));
          const duplicateAccount = accountMasterData.find(element => 
              (email && element.email === email) || (mobile && element.mobile === mobile)
          );
          if (duplicateAccount) {
              const field = duplicateAccount.email === email ? 'email' : 'mobile';
              console.log(`Account master duplicate found on ${field}: ${formData[field]}`);
              shouldSave = false;
              return res.status(400).send({ message: `User with same ${field} already exists` });
          }
      } catch (err) {
          if (err.code !== 'ENOENT') {
              console.error('Error reading account-master.json for duplicate check:', err);
              // Decide if this should be a fatal error or just logged
          }
      }
      // Add ID generation logic if needed for account-master
      // ... (assuming ID is handled elsewhere or not needed here)
  } else {
    // Generic duplicate check for other form types based on uniqueIdentifiers
    const validKEY = uniqueIdentifiers.find((key) => formData[key]);
    if (validKEY) {
        const entryExists = dbData.some((entry) => entry[validKEY] === formData[validKEY]);
        if (entryExists) {
            console.log(`Duplicate found for ${formType} on key ${validKEY}: ${formData[validKEY]}`);
            shouldSave = false;
            return res.status(400).send(
                `Error: Entry with this ${validKEY} (${formData[validKEY]}) already exists.`
            );
        }
        // Add ID generation if needed for other types
        // Example: Find max ID and increment
        // let maxId = dbData.reduce((max, entry) => Math.max(max, parseInt(entry.id || 0)), 0);
        // formData.id = (maxId + 1).toString();
    }
  }

  // Only proceed to save if no duplicates were found
  if (shouldSave) {
    try {
      // Add a timestamp before saving
      formData.createdAt = new Date().toISOString();
      
      // Add the new data to the array
      dbData.push(formData);
      
      // Write the updated array back to the file
      await fs.promises.writeFile(filePath, JSON.stringify(dbData, null, 2), 'utf8');
      console.log(`Successfully saved new entry for ${formType}. ID: ${formData.id || 'N/A'}, Series: ${formData.series || 'N/A'}, BillNo: ${formData.billNo || 'N/A'}`);

      // Special redirect/response handling
      if (formType === 'invoicing') {
          return res.status(200).json({ 
              message: 'Entry added successfully.',
              id: formData.id,
              series: formData.series, // Return series as well
              billNo: formData.billNo // Return billNo as well
          });
      } else if (formType === 'cash-receipts') {
           // Example redirect logic (adapt as needed)
           // let url = `/print?date=${formData.date}...`;
           // return res.send({ url });
           return res.status(200).json({ message: 'Cash receipt added successfully.' });
      } else if (formType === 'godown') {
           // Example redirect logic
           // let url = `/printGODOWN?data=...`;
           // return res.send({ url });
           return res.status(200).json({ message: 'Godown entry added successfully.' });
      } else {
          // Default success response
          return res.status(200).json({ message: 'Entry added successfully.' });
      }
      
    } catch (err) {
      console.error('Error writing data to file:', err);
      return res.status(500).send('Failed to save data.');
    }
  } else {
      // This part should ideally not be reached if duplicate checks return responses
      console.warn(`Save operation was blocked for ${formType}, likely due to a duplicate check.`);
      // If a duplicate check failed but didn't return a response, send a generic error
      if (!res.headersSent) {
          return res.status(400).send('Operation failed, possibly due to duplicate data.');
      }
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
      
      // If updating an invoice and the bill number has changed, check for duplicate bill numbers
      if (entryIndex > -1 && formData.billNo) {
        const existingEntry = dbData[entryIndex];
        const billNoChanged = existingEntry.billNo !== formData.billNo;
        const seriesChanged = existingEntry.series !== formData.series;
        
        // If either the bill number or series changed, we need to validate
        if (billNoChanged || seriesChanged) {
          const series = formData.series;
          const billNo = formData.billNo;
          
          // First, check if the new bill number matches the expected next bill number
          // Only if this is a completely new bill number (not just editing an existing invoice)
          if (billNoChanged || seriesChanged) {
            try {
              // Get expected next bill number from the invoiceId endpoint
              const protocol = req.protocol || 'http';
              const host = req.get('host') || 'localhost:8000';
              const baseUrl = `${protocol}://${host}`;
              
              console.log(`Fetching next invoice ID from ${baseUrl}/slink/invoiceId`);
              const invoiceIdResponse = await fetch(`${baseUrl}/slink/invoiceId`);
              
              if (!invoiceIdResponse.ok) {
                throw new Error(`Failed to fetch invoice ID data: ${invoiceIdResponse.statusText}`);
              }
              
              const invoiceIdData = await invoiceIdResponse.json();
              const expectedNextBillNo = invoiceIdData.nextSeries[series.toUpperCase()];
              
              console.log(`Expected next bill number for series ${series}: ${expectedNextBillNo}`);
              
              // Check if the bill number is either the original one or the expected next one
              // This allows keeping the original bill number or switching to the next available one
              const isOriginalBillNo = !billNoChanged && series === existingEntry.series;
              const isExpectedNextBillNo = parseInt(billNo) === expectedNextBillNo;
              
              if (!isOriginalBillNo && !isExpectedNextBillNo) {
                return res.status(409).json({
                  error: 'Incorrect bill number',
                  message: `Bill number ${billNo} for series ${series} doesn't match the expected next bill number.`,
                  suggestedBillNo: expectedNextBillNo.toString()
                });
              }
            } catch (fetchError) {
              console.error('Error fetching invoice ID data:', fetchError);
              // Continue with regular processing if we can't fetch the expected bill number
            }
          }
          
          // Check if the new bill number already exists for this series (duplicate)
          const duplicate = dbData.findIndex(invoice => 
            invoice.series === formData.series && 
            invoice.billNo === formData.billNo &&
            String(invoice.id) !== String(formData.id) // Exclude the current invoice
          );
          
          if (duplicate !== -1) {
            // If duplicate found, find the highest bill number for this series
            let maxBillNo = 0;
            dbData.forEach(invoice => {
              if (invoice.series === formData.series && parseInt(invoice.billNo) > maxBillNo) {
                maxBillNo = parseInt(invoice.billNo);
              }
            });
            
            // Return a conflict error with suggested next bill number
            return res.status(409).json({
              error: 'Duplicate bill number',
              message: `Bill number ${formData.billNo} for series ${formData.series} already exists.`,
              suggestedBillNo: (maxBillNo + 1).toString()
            });
          }
        }
      }
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
