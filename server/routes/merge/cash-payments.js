const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM } = require('../../dbf-orm'); // Assuming dbf-orm is correctly set up
const { format } = require('date-fns'); // For date formatting

// Paths
const cashDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CASH.dbf');
const cmplDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CMPL.dbf');
const approvedJsonPath = path.join(__dirname, '..', '..', 'db', 'approved', 'cash-payments.json');
const dbJsonPath = path.join(__dirname, '..', '..', 'db', 'database', 'cash-payments.json'); // Path for reverting

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
    const dateParts = record.date.split('-'); // Assuming DD-MM-YYYY format
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // JavaScript months are 0-indexed
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
    M_GROUP1: "PT", // Creditor/Payment group for Cash Payment (Assumption)
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
    USER_ID: userId || 0,
    USER_TIME: new Date(),
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
    const userId = req.user?.id || 2; // Use 2 as fallback if missing
    
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

    const nextVrStart = await getNextCpVrNumber(cashDbfOrm);
    let currentVrCounter = parseInt(nextVrStart.split('-')[1], 10);

    const dbfRecords = [];
    const customerCache = new Map();
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
                customerData = {};
            }
        }

        const vr = `CP-${String(currentVrCounter++).padStart(6, '0')}`;
        // Pass the authenticated user ID to the mapping function
        const dbfRecord = await mapToCashDbfFormat(record, vr, userId, customerData);
        dbfRecords.push(dbfRecord);
    }

    if (dbfRecords.length > 0) {
      await cashDbfOrm.insertMany(dbfRecords);
    }

    cashDbfOrm.close();
    cmplDbfOrm.close();

    const remainingApprovedRecords = approvedRecords.filter(appRec =>
      !recordsToSync.some(selRec => selRec.voucherNo === appRec.voucherNo && selRec.party === appRec.party && selRec.date === appRec.date)
    );
    await fs.writeFile(approvedJsonPath, JSON.stringify(remainingApprovedRecords, null, 2));

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