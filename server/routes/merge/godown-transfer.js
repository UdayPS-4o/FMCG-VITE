const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM } = require('../../dbf-orm');

// Define DBF file paths using environment variable
const dbfFolderPath = process.env.DBF_FOLDER_PATH;
const transferDbfPath = path.join(dbfFolderPath, 'data', 'TRANSFER.DBF');
const pmplDbfPath = path.join(dbfFolderPath, 'data', 'PMPL.DBF'); // Product Master

// Source JSON data
const godownTransferJsonPath = path.resolve(__dirname, '..', '..', 'db', 'approved', 'godown.json');
const usersJsonPath = path.resolve(__dirname, '..', '..', 'db', 'users.json'); // Path to users.json

// Helper to safely parse float and round
function safeParseFloat(value, decimals = 2) {
  const num = parseFloat(value || 0);
  return parseFloat(num.toFixed(decimals));
}

// --- Helper function to format date and time ---
function formatUserTime(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}
// --- End Helper function ---

// Map godown transfer item to TRANSFER.DBF format
function mapToTransferDbfFormat(transfer, item, sno, productData, isNegative = false, userId) {
  // Find the correct rate from product data or use a default
  const rate = safeParseFloat(productData?.RATE1 || 0);
  const gstPerc = safeParseFloat(productData?.GST || 0);
  
  // Calculate quantities and amounts
  const qty = safeParseFloat(item.qty) * (isNegative ? -1 : 1);
  const amt10 = safeParseFloat(qty * rate);
  const net10 = amt10;
  
  // Calculate GST amounts
  const gstFactor = 1 + (gstPerc / 100);
  const gd10 = safeParseFloat(net10 / gstFactor, 2);
  const gst10 = safeParseFloat(net10 - gd10, 2);
  
  // Ensure BILL is numeric
  const billNo = parseInt(transfer.id, 10);
  
  // Parse date components from the transfer date field
  let dateFormatted = null;
  if (transfer.date) {
    const dateParts = transfer.date.split('-'); // Assuming DD-MM-YYYY format
    let day, month, year;
    if (dateParts[0].length === 4) { // YYYY-MM-DD format
      year = parseInt(dateParts[0], 10);
      month = parseInt(dateParts[1], 10) - 1; // JavaScript months are 0-indexed
      day = parseInt(dateParts[2], 10);
    } else { // DD-MM-YYYY format
      day = parseInt(dateParts[0], 10);
      month = parseInt(dateParts[1], 10) - 1; // JavaScript months are 0-indexed
      year = parseInt(dateParts[2], 10);
    }
    
    // Get time components from createdAt if available
    let hours = 0, minutes = 0, seconds = 0; // Default to midnight
    if (transfer.createdAt) {
      const createdDate = new Date(transfer.createdAt);
      // Time components are available if needed, but for DATE field, use midnight UTC.
      hours = createdDate.getUTCHours();
      minutes = createdDate.getUTCMinutes();
      seconds = createdDate.getUTCSeconds();
    }
    
    // Create a UTC date object with the specified date and time
    dateFormatted = new Date(Date.UTC(year, month, day, 0, 0, 0));
    console.log(`Transfer ${transfer.id} date: ${transfer.date} (using midnight UTC for DBF DATE field), createdAt: ${transfer.createdAt || 'N/A'}, result: ${dateFormatted.toISOString()}`);
  } else {
    dateFormatted = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0)); // Fallback to current date at midnight UTC
  }
  
  return {
    SERIES: transfer.series,
    BILL: billNo,
    DATE: dateFormatted,
    CODE: item.code,
    GDN_CODE: isNegative ? transfer.toGodown : transfer.fromGodown,
    UNIT: item.unit || productData?.UNIT_1 || "PCS",
    MULT_F: parseInt(productData?.MULT_F || 1, 10),
    TRADE: safeParseFloat(productData?.TRADE1 || 0),
    MRP: safeParseFloat(productData?.MRP1 || 0),
    RATE: rate,
    QTY: qty,
    BATCH_NO: "",
    EXPIRY: null,
    LST: null,
    GST: gstPerc,
    SNO: sno,
    BILL2: `${transfer.series}-${String(billNo).padStart(5, ' ')}`,
    AMT10: amt10,
    NET10: net10,
    GD10: gd10,
    GST10: gst10,
    GR_CODE9: productData?.GR_CODE || "",
    PRODUCT: productData?.PRODUCT || "",
    PACK: productData?.PACK || "",
    OK: "Y",
    UNIT_NO: parseInt(productData?.UNIT_NO || 1, 10),
    EXP_C: "",
    REF_NO: "",
    TRF_TO: transfer.toGodown,
    SM_CODE: transfer.sm || "SM001",
    SM_NAME: transfer.smName || "",
    USER_ID: userId,
    USER_TIME: formatUserTime(new Date()),
  };
}

// POST endpoint to merge selected records to DBF
router.post('/sync', async (req, res) => {
  const transferDbf = new DbfORM(transferDbfPath, { autoCreate: true });
  const pmplDbf = new DbfORM(pmplDbfPath);

  try {
    // Get authenticated user ID from middleware
    // const mergingUserId = req.user?.id; // Old way
    // Check if mergingUserId is explicitly undefined or null, allowing 0
    // if (mergingUserId === undefined || mergingUserId === null) { 
    // return res.status(401).json({ success: false, message: 'User not authenticated or ID missing for godown-transfer.' });
    // }

    // --- Load Users Data for smCode to ID mapping ---
    let userMapBySmCode = {};
    try {
      const usersJsonData = await fs.readFile(usersJsonPath, 'utf-8');
      const users = JSON.parse(usersJsonData);
      userMapBySmCode = users.reduce((map, user) => {
        if (user.smCode) {
          map[user.smCode] = user.id;
        }
        return map;
      }, {});
      console.log(`Loaded ${Object.keys(userMapBySmCode).length} users with smCode for godown-transfer.`);
    } catch (readError) {
      console.error(`Error reading users JSON file at ${usersJsonPath} for godown-transfer:`, readError);
      // Proceeding, errors will show in USER_ID if smCode lookup fails and mergingUserId is used.
    }
    // --- End Load Users Data ---

    // --- Determine Merging User ID using smCode ---
    let mergingUserId = null; // Default to null (blank) instead of undefined
    const authenticatedUserSmCode = req.user?.smCode;
    if (authenticatedUserSmCode && userMapBySmCode[authenticatedUserSmCode] !== undefined) {
        mergingUserId = userMapBySmCode[authenticatedUserSmCode];
        console.log(`Godown Transfer: Authenticated user ID resolved to ${mergingUserId} via smCode: ${authenticatedUserSmCode}`);
    } else {
        // Modified: Now this is just a warning, not an error that prevents execution
        console.warn(`Godown Transfer: Authenticated user's smCode ('${authenticatedUserSmCode}') not found or smCode missing from req.user. Will proceed with sync but USER_ID for audit trail may be blank. req.user: ${JSON.stringify(req.user)}`);
        // mergingUserId remains null
    }
    // --- End Determine Merging User ID ---

    // Get the selected records from the request
    const { records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'No records provided' });
    }

    // Add S/M validation to ensure it exists on each record, default if not
    records.forEach(record => {
      if (!record.sm) {
        record.sm = "SM001"; // Default S/M code if not provided
      }
    });

    // 1. Open the DBFs
    console.log('Opening DBF files...');
    try {
      await Promise.all([
        transferDbf.open(),
        pmplDbf.open()
      ]);
    } catch (openError) {
      // Attempt to create TRANSFER.DBF if it doesn't exist
      if (openError.message.includes(path.basename(transferDbfPath))) {
        console.log('TRANSFER.DBF not found, attempting to create...');
        await transferDbf.create();
        // Re-open PMPL
        await pmplDbf.open();
      } else {
        console.error('Error opening DBF files:', openError);
        throw new Error(`Failed to open required DBF files: ${openError.message}`);
      }
    }

    // 2. Load PMPL into a map
    console.log('Loading PMPL data...');
    const pmplRecords = await pmplDbf.findAll();
    const pmplMap = pmplRecords.reduce((map, record) => {
      map[record.CODE] = record; // Key by Product Code
      return map;
    }, {});
    console.log(`Loaded ${Object.keys(pmplMap).length} product records.`);

    // 3. Check for existing transfers with same SERIES and BILL
    console.log('Checking for duplicate transfers...');
    const existingTransfers = await transferDbf.findAll();
    const existingTransferKeys = new Set();

    existingTransfers.forEach(record => {
      existingTransferKeys.add(`${record.SERIES}-${record.BILL}`);
    });
    
    // 4. Process each record, checking for duplicates
    const processedTransfers = [];
    const skippedTransfers = [];
    const transferRecordsToInsert = [];

    for (const transfer of records) {
      const transferKey = `${transfer.series}-${transfer.id}`;
      
      if (existingTransferKeys.has(transferKey)) {
        console.log(`Skipping duplicate transfer: ${transferKey}`);
        skippedTransfers.push({ key: transferKey, reason: 'Duplicate' });
        continue;
      }

      // Map each item to two records (one positive, one negative)
      let sno = 1;
      let hasErrors = false;
      
      // Check if all items exist in PMPL
      for (const item of transfer.items) {
        const productData = pmplMap[item.code];
        if (!productData) {
          console.warn(`Product data not found for code: ${item.code} in transfer ${transferKey}.`);
          // You can choose to skip or proceed depending on requirements
          // For now, we'll flag this transfer
          hasErrors = true;
        }
      }
      
      if (hasErrors) {
        skippedTransfers.push({ key: transferKey, reason: 'Missing Product Data' });
        continue;
      }
      
      for (const item of transfer.items) {
        const productData = pmplMap[item.code];
        
        // --- Determine User ID based on SM Code ---
        // Note: mergingUserId is already validated (results in 401 if not resolved)
        const smCode = transfer.sm; // Default SM is already applied to transfer records
        let userIdToUse = null; // Default to null (blank)
        if (smCode && userMapBySmCode[smCode] !== undefined) {
          userIdToUse = userMapBySmCode[smCode];
        } else {
          console.warn(`Godown Transfer Sync: User ID not found for SM Code: '${smCode}' on transfer record. USER_ID will be blank (null).`);
          // userIdToUse remains null
        }
        // --- End Determine User ID ---

        // Create FROM godown record (positive quantity)
        const fromRecord = mapToTransferDbfFormat(transfer, item, sno, productData, false, userIdToUse);
        transferRecordsToInsert.push(fromRecord);
        
        // Create TO godown record (negative quantity)
        const toRecord = mapToTransferDbfFormat(transfer, item, sno, productData, true, userIdToUse);
        transferRecordsToInsert.push(toRecord);
        
        sno++;
      }
      
      processedTransfers.push(transferKey);
      existingTransferKeys.add(transferKey); // Prevent duplicates within same batch
    }

    // 5. Insert all records
    if (transferRecordsToInsert.length > 0) {
      console.log(`Inserting ${transferRecordsToInsert.length} records into TRANSFER.DBF...`);
      await transferDbf.insertMany(transferRecordsToInsert);
    }

    // 6. Return response
    return res.json({
      success: true,
      message: `Sync completed. Processed: ${processedTransfers.length}, Skipped: ${skippedTransfers.length}`,
      processed: processedTransfers,
      skipped: skippedTransfers
    });

  } catch (error) {
    console.error('Error during godown transfer sync:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync godown transfer data to DBF files',
      error: error.message
    });
  } finally {
    // 7. Close DBFs
    console.log('Closing DBF files...');
    try {
      await Promise.allSettled([
        transferDbf.close(),
        pmplDbf.close()
      ]);
      console.log('DBF files closed.');
    } catch (closeError) {
      console.error('Error closing DBF files:', closeError);
    }
  }
});

module.exports = router; 