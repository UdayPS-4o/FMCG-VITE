const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM } = require('../../dbf-orm'); // Assuming dbf-orm is correctly set up
const { format } = require('date-fns'); // For date formatting

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

// --- Helper function to check if record already exists in CASH.DBF ---
async function checkRecordExists(dbfOrm, voucherNo, series) {
  // Normalize and trim inputs
  let normalizedVoucherNo = typeof voucherNo === 'string' ? voucherNo.trim() : voucherNo;
  const normalizedSeries = typeof series === 'string' ? series.trim().toUpperCase() : series;

  // Convert voucherNo to number if it's a numeric string, as R_NO is often numeric in DBF or treated as such
  if (typeof normalizedVoucherNo === 'string' && /^\d+$/.test(normalizedVoucherNo)) {
    normalizedVoucherNo = parseInt(normalizedVoucherNo, 10);
  }

  // Skip check if voucher number or series is empty after normalization
  if ((normalizedVoucherNo === null || normalizedVoucherNo === undefined || normalizedVoucherNo === '') || 
      (normalizedSeries === null || normalizedSeries === undefined || normalizedSeries === '')) {
    return false;
  }
  
  const allRecords = await dbfOrm.findAll();
  //filter VR that starts with CP-
  const cpRecords = allRecords.filter(r => r.VR && r.VR.startsWith('CP-'));

  //filter cpRecords where R_NO and SERIES match the normalizedVoucherNo and normalizedSeries
  const existingRecords = cpRecords.filter(r => r.R_NO === normalizedVoucherNo && r.SERIES === normalizedSeries);
  console.log(`Found ${existingRecords.length} existing records for voucher number ${normalizedVoucherNo} and series ${normalizedSeries}`); 

  return existingRecords.length > 0;
}
// --- End Helper function ---

// Paths
const cashDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CASH.dbf');
const cmplDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CMPL.dbf');
const approvedJsonPath = path.join(__dirname, '..', '..', 'db', 'approved', 'cash-payments.json');
const dbJsonPath = path.join(__dirname, '..', '..', 'db', 'database', 'cash-payments.json'); // Path for reverting
const dbUsersPath = path.join(__dirname, '..', '..', 'db', 'users.json'); // Path to users.json

// Helper function to get the next VR number for Cash Payments (CP)
async function getNextCpVrNumber(dbfOrm) {
  const records = await dbfOrm.findAll();
  const cpRecords = records.filter(r => r.VR && r.VR.startsWith('CP-'));
  if (cpRecords.length === 0) {
    return 'CP-000001';
  }
  const maxVr = cpRecords.reduce((max, r) => {
    const num = parseInt(r.VR.split('-')[1], 10);
    return num > max ? num : max;
  }, 0);
  const nextNum = maxVr + 1;
  return `CP-${String(nextNum).padStart(6, '0')}`;
}

// Map JSON record to CASH.DBF format for Cash Payment
async function mapToCashDbfFormat(record, vr, userId, customerData) {
  // Parse date components from the date field
  let dateFormatted = null;
  if (record.date) {
    const dateParts = record.date.split('-');
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
    if (record.createdAt) {
      const createdDate = new Date(record.createdAt);
      // Time components are available if needed, but for DATE field, use midnight UTC.
      hours = createdDate.getUTCHours(); 
      minutes = createdDate.getUTCMinutes();
      seconds = createdDate.getUTCSeconds();
    }
    
    // Create a UTC date object, ensuring it's midnight UTC for the given year, month, day.
    dateFormatted = new Date(Date.UTC(year, month, day, 0, 0, 0)); 
    console.log(`Parsed date: ${record.date} (using midnight UTC for DBF DATE field), createdAt: ${record.createdAt || 'N/A'}, result: ${dateFormatted.toISOString()}`);
  }

  const amount = parseFloat(record.amount) || 0;
  const discount = parseFloat(record.discount) || 0;

  // mgroup of party with same party code from CMPL.DBF
  const mgroup = customerData?.M_GROUP || "DT";

  return {
    DATE: dateFormatted,
    VR: vr,
    M_GROUP1: mgroup,
    C_CODE: record.party || "",
    CR: 0.00,
    DR: amount,
    REMARK: record.narration || "",
    CD: discount, // Cash Discount
    QCR: 0.000,
    QDR: 0.000,
    R_NO: record.voucherNo || "", 
    SERIES: record.series || "",
    BILL: "",
    DT_BILL: null,
    BOOK: "CB", // Cash Book? Assuming default
    E_TYPE: "G", // Assuming default
    ITEM: "",
    PUR_CODE: "",
    REC_AMT: 0.00, // No received amount for payment
    ET_PAID: "",
    R_CODE: "",
    CR_NOTE: 0.00,
    B_PLACE: customerData?.C_PLACE || "",
    PTRAN: "",
    PBILL: 0,
    PSERIES: "",
    JB_ENO: 0,
    BR_CODE: record.sm || "SM007", 
    BILL1: "",
    REC_VR: "",
    SMPSER: "",
    BFLAG: "",
    AC_NAME: customerData?.C_NAME || "",
    AC_PLACE: customerData?.C_PLACE || "",
    AC_GST: customerData?.C_GST || "",
    CD_ENTRY: "",
    CD_VRNO: "",
    IST_PUR: "",
    UNIT_NO: 0,
    BANK_DATE: null,
    OK: "",
    PRINT: "N",
    BILL2: "",
    TR_TYPE: "",
    CHQ_ISSUE: "",
    CASH: "Y", // Assuming Cash transaction
    FINANCE: "",
    DN_PAY: amount, // DN Pay amount?
    AC_MOBILE: customerData?.C_MOBILE || "",
    TAX: 0.00,
    TRAN_TYPE: "",
    CODE_ORG: record.party || "",
    SM_ORG: record.sm || "SM007", 
    BANK: "",
    ST_CODE: customerData?.C_STATE || "",
    ST_NAME: customerData?.STATE_NAME || "", // Need to confirm CMPL structure
    CESS_TAX: 0.00,
    GST_TAX: 0.00,
    C_ADD1: customerData?.C_ADD1 || "",
    C_PLACE: customerData?.C_PLACE || "",
    PUR_NAME: "",
    PUR_ADD1: "",
    PUR_PLACE: "",
    PUR_GST: "",
    PUR_ST: "",
    PUR_STNAME: "",
    SGST: 0.00,
    CGST: 0.00,
    IGST: 0.00,
    CESS_TOTAL: 0.00,
    DUMMY: "",
    USER_ID: userId,
    USER_TIME: formatUserTime(new Date()),
    USER_ID2: 0,
    USER_TIME2: null,
    SPID: "",
    INVVALUE: 0.00,
    REGD: customerData?.GSTNO ? "Y" : "N",
    GST_TYPE: "",
    GD00: 0.00, GD03: 0.00, GD05: 0.00, GD12: 0.00, GD18: 0.00, GD28: 0.00,
    TAX00: 0.00, TAX03: 0.00, TAX05: 0.00, TAX12: 0.00, TAX18: 0.00, TAX28: 0.00,
    CESS: 0.00,
    PST9: customerData?.C_STATE || "",
    MST9: customerData?.C_STATE || "",
    B_IGST: "",
    TCODE: "",
    OLDVR: ""
  };
}

// POST endpoint to merge selected records to CASH.DBF
router.post('/sync', async (req, res) => {
  try {
    // Access the user ID from the request object populated by the middleware
    // const mergingUserId = req.user?.id || 2; // Old way
    
    // --- Load Users Data for smCode to ID mapping ---
    let userMapBySmCode = {};
    try {
      const usersJsonData = await fs.readFile(dbUsersPath, 'utf-8');
      const users = JSON.parse(usersJsonData);
      userMapBySmCode = users.reduce((map, user) => {
        if (user.smCode) {
          map[user.smCode] = user.id;
        }
        return map;
      }, {});
      console.log(`Loaded ${Object.keys(userMapBySmCode).length} users with smCode for cash-payments.`);
    } catch (readError) {
      console.error(`Error reading users JSON file at ${dbUsersPath} for cash-payments:`, readError);
      // Proceeding, errors will show in USER_ID if smCode lookup fails and mergingUserId is used.
    }
    // --- End Load Users Data ---

    // --- Determine Merging User ID using smCode ---
    let mergingUserId = null; // Default to null (blank) instead of 2
    const authenticatedUserSmCode = req.user?.smCode;
    if (authenticatedUserSmCode && userMapBySmCode[authenticatedUserSmCode] !== undefined) {
        mergingUserId = userMapBySmCode[authenticatedUserSmCode];
        console.log(`Cash Payments: Authenticated user ID resolved to ${mergingUserId} via smCode: ${authenticatedUserSmCode}`);
    } else {
        console.warn(`Cash Payments: Authenticated user's smCode ('${authenticatedUserSmCode}') not found or smCode missing from req.user. Will proceed with sync but USER_ID for audit trail may be blank. req.user: ${JSON.stringify(req.user)}`);
        // mergingUserId remains null
    }
    // --- End Determine Merging User ID ---

    let approvedRecords;
    try {
      const data = await fs.readFile(approvedJsonPath, 'utf-8');
      approvedRecords = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        approvedRecords = [];
      } else {
        throw err;
      }
    }

    const { records: recordsToSync } = req.body;
    if (!recordsToSync || !Array.isArray(recordsToSync) || recordsToSync.length === 0) {
      return res.status(400).json({ success: false, message: 'No records selected for sync' });
    }

    // Ensure S/M field exists on each record, default if not
    recordsToSync.forEach(record => {
      if (!record.sm) {
        record.sm = "SM007"; // Default S/M code if not provided
      }
    });

    // Using voucherNo and party for identification
    const selectedApprovedRecords = approvedRecords.filter(appRec =>
        recordsToSync.some(selRec => selRec.voucherNo === appRec.voucherNo && selRec.party === appRec.party && selRec.date === appRec.date)
    );

    // Also ensure sm field on selectedApprovedRecords
    selectedApprovedRecords.forEach(record => {
      if (!record.sm) {
        // Find matching record in recordsToSync to get its sm
        const matchingRecord = recordsToSync.find(
          rec => rec.voucherNo === record.voucherNo && rec.party === record.party && rec.date === record.date
        );
        record.sm = matchingRecord?.sm || "SM007";
      }
    });

    if (selectedApprovedRecords.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected records not found in approved list.' });
    }

    const cashDbfOrm = new DbfORM(cashDbfPath, { autoCreate: true, includeDeletedRecords: false });
    const cmplDbfOrm = new DbfORM(cmplDbfPath, { includeDeletedRecords: false });

    await cashDbfOrm.open();
    await cmplDbfOrm.open();

    // --- Check for existing records ---
    const duplicateRecords = [];
    const validRecords = [];

    for (const record of selectedApprovedRecords) {
      const exists = await checkRecordExists(cashDbfOrm, record.voucherNo, record.series);
      if (exists) {
        duplicateRecords.push(record);
      } else {
        validRecords.push(record);
      }
    }

    if (validRecords.length === 0) {
      cashDbfOrm.close();
      cmplDbfOrm.close();
      return res.status(400).json({ 
        success: false, 
        message: 'All selected records have voucher numbers and series that already exist in the database.',
        duplicateRecords
      });
    }
    // --- End Check for existing records ---

    const nextVrStart = await getNextCpVrNumber(cashDbfOrm);
    let currentVrCounter = parseInt(nextVrStart.split('-')[1], 10);

    const dbfRecords = [];
    const customerCache = new Map();
    console.log('Reading all customers from CMPL.DBF...');
    const allCustomers = await cmplDbfOrm.findAll(); // Read all customers once
    console.log(`Found ${allCustomers.length} customers.`);

    for (const record of validRecords) {
        let customerData = customerCache.get(record.party);
        if (!customerData) {
            // Find customer in the manually fetched list
            console.log(`Searching for customer C_CODE: ${record.party}`);
            customerData = allCustomers.find(cust => cust.C_CODE === record.party);

            if (customerData) {
                console.log(`Found customer data for ${record.party}`);
                customerCache.set(record.party, customerData);
            } else {
                console.warn(`Customer data not found for C_CODE: ${record.party}`);
                customerData = {};
            }
        }

        const vr = `CP-${String(currentVrCounter++).padStart(6, '0')}`;
        
        // --- Determine User ID based on SM Code ---
        const smCode = record.sm; // Default SM is already applied to selectedApprovedRecords
        let userIdToUse = null; // Default to null (blank)
        if (smCode && userMapBySmCode[smCode] !== undefined) {
          userIdToUse = userMapBySmCode[smCode];
        } else {
          console.warn(`Cash Payment Sync: User ID not found for SM Code: '${smCode}' on record. USER_ID will be blank (null).`);
          // userIdToUse remains null
        }
        // --- End Determine User ID ---

        // Pass the resolved user ID to the mapping function
        const dbfRecord = await mapToCashDbfFormat(record, vr, userIdToUse, customerData);
        dbfRecords.push(dbfRecord);
    }

    if (dbfRecords.length > 0) {
      await cashDbfOrm.insertMany(dbfRecords);
    }

    cashDbfOrm.close();
    cmplDbfOrm.close();

    // --- Update JSON File ---
    // Remove synced records from approved JSON (only the valid ones)
    const validRecordIds = new Set(validRecords.map(r => `${r.voucherNo}-${r.party}-${r.date}`));
    const remainingApprovedRecords = approvedRecords.filter(appRec => {
      const recordId = `${appRec.voucherNo}-${appRec.party}-${appRec.date}`;
      return !validRecordIds.has(recordId);
    });
    
    await fs.writeFile(approvedJsonPath, JSON.stringify(remainingApprovedRecords, null, 2));

    // Return success with info about duplicates if any
    if (duplicateRecords.length > 0) {
      return res.json({
        success: true,
        message: `Successfully synced ${dbfRecords.length} cash payment records to CASH.DBF. ${duplicateRecords.length} records skipped due to duplicate voucher number and series.`,
        syncedCount: dbfRecords.length,
        skippedCount: duplicateRecords.length,
        skippedRecords: duplicateRecords
      });
    }

    return res.json({
      success: true,
      message: `Successfully synced ${dbfRecords.length} cash payment records to CASH.DBF`,
      syncedCount: dbfRecords.length,
    });

  } catch (error) {
    console.error('Error syncing cash payments to DBF:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync cash payment records to DBF file',
      error: error.message
    });
  }
});

// POST endpoint to revert selected records from approved to database
router.post('/revert', async (req, res) => {
    try {
        const { records: recordsToRevert } = req.body;

        if (!recordsToRevert || !Array.isArray(recordsToRevert) || recordsToRevert.length === 0) {
            return res.status(400).json({ success: false, message: 'No records selected for revert' });
        }

        let approvedRecords = [];
        let databaseRecords = [];

        try {
            const approvedData = await fs.readFile(approvedJsonPath, 'utf-8');
            approvedRecords = JSON.parse(approvedData);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        try {
            const dbData = await fs.readFile(dbJsonPath, 'utf-8');
            databaseRecords = JSON.parse(dbData);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
            await fs.writeFile(dbJsonPath, JSON.stringify([], null, 2)); // Create if not exists
        }

        const recordsToMove = [];
        const remainingApproved = [];
        // Use voucherNo for identification
        const revertedIds = new Set(recordsToRevert.map(r => `${r.voucherNo}-${r.party}-${r.date}`));

        approvedRecords.forEach(record => {
            const recordId = `${record.voucherNo}-${record.party}-${record.date}`;
            if (revertedIds.has(recordId)) {
                const existsInDb = databaseRecords.some(dbRec =>
                   `${dbRec.voucherNo}-${dbRec.party}-${dbRec.date}` === recordId
                );
                if (!existsInDb) {
                   recordsToMove.push(record);
                } else {
                   console.warn(`Record ${recordId} already exists in database JSON, skipping revert.`);
                }
            } else {
                remainingApproved.push(record);
            }
        });

        const updatedDatabaseRecords = [...databaseRecords, ...recordsToMove];

        await fs.writeFile(approvedJsonPath, JSON.stringify(remainingApproved, null, 2));
        await fs.writeFile(dbJsonPath, JSON.stringify(updatedDatabaseRecords, null, 2));

        return res.json({
            success: true,
            message: `Successfully reverted ${recordsToMove.length} records.`,
            revertedCount: recordsToMove.length
        });

    } catch (error) {
        console.error('Error reverting cash payment records:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to revert records',
            error: error.message
        });
    }
});

module.exports = router; 