const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM, DataTypes } = require('../../dbf-orm'); // Assuming dbf-orm is correctly set up
const { format } = require('date-fns'); // For date formatting

// Paths
const cashDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CASH.dbf');
const cmplDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CMPL.dbf');
const approvedJsonPath = path.join(__dirname, '..', '..', 'db', 'approved', 'cash-receipts.json');
const dbJsonPath = path.join(__dirname, '..', '..', 'db', 'database', 'cash-receipts.json'); // Path for reverting

// Helper function to get the next VR number for Cash Receipts (CR)
async function getNextCrVrNumber(dbfOrm) {
  const records = await dbfOrm.findAll();
  const crRecords = records.filter(r => r.VR && r.VR.startsWith('CR-'));
  if (crRecords.length === 0) {
    return 'CR-000001';
  }
  const maxVr = crRecords.reduce((max, r) => {
    const num = parseInt(r.VR.split('-')[1], 10);
    return num > max ? num : max;
  }, 0);
  const nextNum = maxVr + 1;
  return `CR-${String(nextNum).padStart(6, '0')}`;
}

// Map JSON record to CASH.DBF format for Cash Receipt
async function mapToCashDbfFormat(record, vr, userId, customerData) {
  // Parse date components from the date field
  let dateFormatted = null;
  if (record.date) {
    const dateParts = record.date.split('-'); // Assuming MM-DD-YYYY format
    const month = parseInt(dateParts[0], 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);
    
    // Get time components from createdAt if available
    let hours = 0, minutes = 0, seconds = 0;
    if (record.createdAt) {
      const createdDate = new Date(record.createdAt);
      hours = createdDate.getUTCHours();
      minutes = createdDate.getUTCMinutes();
      seconds = createdDate.getUTCSeconds();
    }
    
    // Create a UTC date object with the specified date and time
    dateFormatted = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    console.log(`Parsed date: ${record.date}, createdAt: ${record.createdAt || 'N/A'}, result: ${dateFormatted.toISOString()}`);
  }

  const amount = parseFloat(record.amount) || 0;
  const discount = parseFloat(record.discount) || 0;

  return {
    DATE: dateFormatted,
    VR: vr,
    M_GROUP1: "DT", // Debtor group for Cash Receipt
    C_CODE: record.party || "",
    CR: amount,
    DR: 0.00,
    REMARK: record.narration || "",
    CD: discount, // Cash Discount
    QCR: 0.000, // Assuming quantity not relevant
    QDR: 0.000,
    R_NO: record.receiptNo || "", // Receipt Number
    SERIES: record.series || "",
    BILL: "", // Assuming not relevant for basic receipt
    DT_BILL: null, // Assuming not relevant
    BOOK: "CB", // Cash Book? Assuming default
    E_TYPE: "G", // Assuming default
    ITEM: "",
    PUR_CODE: "", // Assuming not relevant
    REC_AMT: amount, // Received amount
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
    PRINT: "N", // Assuming not printed yet
    BILL2: "",
    TR_TYPE: "",
    CHQ_ISSUE: "",
    CASH: "Y", // Assuming Cash transaction
    FINANCE: "",
    DN_PAY: 0.00,
    AC_MOBILE: customerData?.C_MOBILE || "",
    TAX: 0.00,
    TRAN_TYPE: "",
    CODE_ORG: record.party || "",
    SM_ORG: record.sm || "SM007", 
    BANK: "",
    ST_CODE: customerData?.C_STATE || "", // State Code from CMPL
    ST_NAME: customerData?.STATE_NAME || "", // State Name from CMPL? Need to confirm CMPL structure
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
    USER_ID: userId || 0, // User ID from request
    USER_TIME: new Date(), // Current time
    USER_ID2: 0,
    USER_TIME2: null,
    SPID: "",
    INVVALUE: 0.00,
    REGD: customerData?.GSTNO ? "Y" : "N", // Registered if GST exists?
    GST_TYPE: "", // Determine based on state?
    GD00: 0.00, GD03: 0.00, GD05: 0.00, GD12: 0.00, GD18: 0.00, GD28: 0.00,
    TAX00: 0.00, TAX03: 0.00, TAX05: 0.00, TAX12: 0.00, TAX18: 0.00, TAX28: 0.00,
    CESS: 0.00,
    PST9: customerData?.C_STATE || "", // Assuming PST9 is state code
    MST9: customerData?.C_STATE || "", // Assuming MST9 is state code
    B_IGST: "", // Inter-state? Needs logic
    TCODE: "",
    OLDVR: ""
  };
}

// POST endpoint to merge selected records to CASH.DBF
router.post('/sync', async (req, res) => {
  try {
    // Access the user ID from the request object populated by the middleware
    const userId = req.user?.id || 2; // Use 2 as fallback if missing
    
    // Read approved records from JSON
    let approvedRecords;
    try {
      const data = await fs.readFile(approvedJsonPath, 'utf-8');
      approvedRecords = JSON.parse(data);
    } catch (err) {
      // If file doesn't exist or is empty, treat as no records
      if (err.code === 'ENOENT') {
        approvedRecords = [];
      } else {
        throw err; // Rethrow other errors
      }
    }

    const { records: recordsToSync } = req.body; // Records selected by the user

    if (!recordsToSync || !Array.isArray(recordsToSync) || recordsToSync.length === 0) {
      return res.status(400).json({ success: false, message: 'No records selected for sync' });
    }

    // Ensure S/M field exists on each record, default if not
    recordsToSync.forEach(record => {
      if (!record.sm) {
        record.sm = "SM007"; // Default S/M code if not provided
      }
    });

    // Filter approvedRecords to only include those selected by the user
    // Using a unique identifier like receiptNo and party assuming they are unique enough for a batch
    const selectedApprovedRecords = approvedRecords.filter(appRec =>
        recordsToSync.some(selRec => selRec.receiptNo === appRec.receiptNo && selRec.party === appRec.party && selRec.date === appRec.date)
    );

    // Also ensure sm field on selectedApprovedRecords
    selectedApprovedRecords.forEach(record => {
      if (!record.sm) {
        // Find matching record in recordsToSync to get its sm
        const matchingRecord = recordsToSync.find(
          rec => rec.receiptNo === record.receiptNo && rec.party === record.party && rec.date === record.date
        );
        record.sm = matchingRecord?.sm || "SM007";
      }
    });

    if (selectedApprovedRecords.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected records not found in approved list.' });
    }

    // --- DBF Operations ---
    const cashDbfOrm = new DbfORM(cashDbfPath, { autoCreate: true, includeDeletedRecords: false });
    const cmplDbfOrm = new DbfORM(cmplDbfPath, { includeDeletedRecords: false }); // Don't autocreate CMPL

    await cashDbfOrm.open(); // Open CASH.DBF
    await cmplDbfOrm.open(); // Open CMPL.DBF

    const nextVrStart = await getNextCrVrNumber(cashDbfOrm);
    let currentVrCounter = parseInt(nextVrStart.split('-')[1], 10);

    const dbfRecords = [];
    const customerCache = new Map(); // Cache for customer data
    console.log('Reading all customers from CMPL.DBF...');
    const allCustomers = await cmplDbfOrm.findAll(); // Read all customers once
    console.log(`Found ${allCustomers.length} customers.`);

    for (const record of selectedApprovedRecords) {
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
            customerData = {}; // Use empty object to avoid errors later
        }
      }

      const vr = `CR-${String(currentVrCounter++).padStart(6, '0')}`;
      // Pass the authenticated user ID to the mapping function
      const dbfRecord = await mapToCashDbfFormat(record, vr, userId, customerData);
      dbfRecords.push(dbfRecord);
    }

    // Append the records to the CASH.DBF file
    if (dbfRecords.length > 0) {
      await cashDbfOrm.insertMany(dbfRecords);
    }

    // Close DBF files
    cashDbfOrm.close();
    cmplDbfOrm.close();

    // --- Update JSON File ---
    // Remove synced records from approved JSON
    const remainingApprovedRecords = approvedRecords.filter(appRec =>
      !recordsToSync.some(selRec => selRec.receiptNo === appRec.receiptNo && selRec.party === appRec.party && selRec.date === appRec.date)
    );
    await fs.writeFile(approvedJsonPath, JSON.stringify(remainingApprovedRecords, null, 2));


    return res.json({
      success: true,
      message: `Successfully synced ${dbfRecords.length} cash receipt records to CASH.DBF`,
      syncedCount: dbfRecords.length,
    });

  } catch (error) {
    console.error('Error syncing cash receipts to DBF:', error);
    // Ensure DBF files are closed on error if open
    // Note: dbf-orm might handle this internally, check its documentation
    return res.status(500).json({
      success: false,
      message: 'Failed to sync cash receipt records to DBF file',
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

        // Read current approved and database records
        let approvedRecords = [];
        let databaseRecords = [];

        try {
            const approvedData = await fs.readFile(approvedJsonPath, 'utf-8');
            approvedRecords = JSON.parse(approvedData);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err; // Ignore if approved file doesn't exist
        }

        try {
            const dbData = await fs.readFile(dbJsonPath, 'utf-8');
            databaseRecords = JSON.parse(dbData);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err; // Ignore if database file doesn't exist
             await fs.writeFile(dbJsonPath, JSON.stringify([], null, 2)); // Create if not exists
        }


        const recordsToMove = [];
        const remainingApproved = [];
        const revertedIds = new Set(recordsToRevert.map(r => `${r.receiptNo}-${r.party}-${r.date}`)); // Create unique IDs for lookup


        approvedRecords.forEach(record => {
            const recordId = `${record.receiptNo}-${record.party}-${record.date}`;
            if (revertedIds.has(recordId)) {
                 // Check if record already exists in databaseRecords to prevent duplicates
                 const existsInDb = databaseRecords.some(dbRec =>
                    `${dbRec.receiptNo}-${dbRec.party}-${dbRec.date}` === recordId
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


        // Add the reverted records to the database JSON
        const updatedDatabaseRecords = [...databaseRecords, ...recordsToMove];

        // Write back the updated lists
        await fs.writeFile(approvedJsonPath, JSON.stringify(remainingApproved, null, 2));
        await fs.writeFile(dbJsonPath, JSON.stringify(updatedDatabaseRecords, null, 2));

        return res.json({
            success: true,
            message: `Successfully reverted ${recordsToMove.length} records.`,
            revertedCount: recordsToMove.length
        });

    } catch (error) {
        console.error('Error reverting cash receipt records:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to revert records',
            error: error.message
        });
    }
});


module.exports = router; 