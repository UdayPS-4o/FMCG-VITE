const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM, DataTypes } = require('../../dbf-orm'); // Assuming dbf-orm is correctly set up
const { format } = require('date-fns'); // For date formatting
const axios = require('axios'); // Added for API calls

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
async function checkRecordExists(dbfOrm, receiptNo, series) {
  // Normalize and trim inputs
  let normalizedReceiptNo = typeof receiptNo === 'string' ? receiptNo.trim() : receiptNo;
  const normalizedSeries = typeof series === 'string' ? series.trim().toUpperCase() : series;

  // Convert receiptNo to number if it's a numeric string, as R_NO is often numeric in DBF or treated as such
  if (typeof normalizedReceiptNo === 'string' && /^\d+$/.test(normalizedReceiptNo)) {
    normalizedReceiptNo = parseInt(normalizedReceiptNo, 10);
  }

  // Skip check if receipt number or series is empty after normalization
  if ((normalizedReceiptNo === null || normalizedReceiptNo === undefined || normalizedReceiptNo === '') || 
      (normalizedSeries === null || normalizedSeries === undefined || normalizedSeries === '')) {
    return false;
  }
  

  const allRecords = await dbfOrm.findAll();

  //filter VR that starts with CR-
  const crRecords = allRecords.filter(r => r.VR && r.VR.startsWith('CR-'));

  //filter crRecords where R_NO and SERIES match the normalizedReceiptNo and normalizedSeries
  const existingRecords = crRecords.filter(r => r.R_NO === normalizedReceiptNo && r.SERIES === normalizedSeries);
  console.log(`Found ${existingRecords.length} existing records for receipt number ${normalizedReceiptNo} and series ${normalizedSeries}`); 

  return existingRecords.length > 0;
}
// --- End Helper function ---

// Paths
const cashDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CASH.dbf');
const cmplDbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CMPL.dbf');
const approvedJsonPath = path.join(__dirname, '..', '..', 'db', 'approved', 'cash-receipts.json');
const dbJsonPath = path.join(__dirname, '..', '..', 'db', 'cash-receipts.json'); // Path for reverting
const dbUsersPath = path.join(__dirname, '..', '..', 'db', 'users.json');

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

// Helper function to get the next VR number for Journal Vouchers (JB)
async function getNextJbVrNumber(dbfOrm) {
  const records = await dbfOrm.findAll();
  const jbRecords = records.filter(r => r.VR && r.VR.startsWith('JB-'));
  if (jbRecords.length === 0) {
    return 'JB-000001';
  }
  const maxVr = jbRecords.reduce((max, r) => {
    const num = parseInt(r.VR.split('-')[1], 10);
    return num > max ? num : max;
  }, 0);
  const nextNum = maxVr + 1;
  return `JB-${String(nextNum).padStart(6, '0')}`;
}

// Map JSON record to CASH.DBF format for Cash Receipt
async function mapToCashDbfFormat(record, vr, userId, customerData) {
  // Parse date components from the date field
  let dateFormatted = null;
  if (record.date) {
    const dateParts = record.date.split('-'); // Assuming DD-MM-YYYY format
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
      // These time components are available if needed elsewhere, 
      // but for the main DATE field, we'll use midnight UTC to avoid timezone shifts.
      hours = createdDate.getUTCHours(); 
      minutes = createdDate.getUTCMinutes();
      seconds = createdDate.getUTCSeconds();
    }
    
    // Create a UTC date object, ensuring it's midnight UTC for the given year, month, day.
    // This helps prevent date shifts due to timezones when storing in a date-only DBF field.
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
    CASH: "", 
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
    USER_ID: userId, // Use passed userId, which can now be null
    USER_TIME: formatUserTime(new Date()), // Current time
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

// Map JSON record to CASH.DBF format for Discount Account Debit Entry
async function mapToDiscountDebitDbfFormat(record, jbVr, crVr, userId, customerData) {
  // Parse date components from the date field
  let dateFormatted = null;
  if (record.date) {
    const dateParts = record.date.split('-'); // Assuming DD-MM-YYYY format
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
    
    dateFormatted = new Date(Date.UTC(year, month, day, 0, 0, 0));
  }

  const discount = parseFloat(record.discount) || 0;

  return {
    DATE: dateFormatted,
    VR: jbVr,
    M_GROUP1: "", 
    C_CODE: "EE034", // Discount Account
    CR: 0.00,
    DR: discount, // Debit the discount amount
    REMARK: `CD- BY ON R/NO ${record.receiptNo || ""}`,
    CD: 0.00,
    QCR: 0.000,
    QDR: 0.000,
    R_NO: record.receiptNo || "",
    SERIES: record.series || "",
    BILL: "",
    DT_BILL: null,
    BOOK: "CB",
    E_TYPE: "G",
    ITEM: "",
    PUR_CODE: "",
    REC_AMT: 0.00,
    ET_PAID: " ",
    R_CODE: record.party || "", // Reference to the party code
    CR_NOTE: 0.00,
    B_PLACE: "",
    PTRAN: " ",
    PBILL: 0,
    PSERIES: " ",
    JB_ENO: 0,
    BR_CODE: record.sm || "SM001",
    BILL1: "",
    REC_VR: "",
    SMPSER: "",
    BFLAG: " ",
    AC_NAME: "DISCOUNT A/C",
    AC_PLACE: "",
    AC_GST: "",
    CD_ENTRY: "Y",
    CD_VRNO: crVr,
    IST_PUR: " ",
    UNIT_NO: 0,
    BANK_DATE: null,
    OK: " ",
    PRINT: "N",
    BILL2: "",
    TR_TYPE: "",
    CHQ_ISSUE: "",
    CASH: " ",
    FINANCE: " ",
    DN_PAY: 0.00,
    AC_MOBILE: "",
    TAX: 0.00,
    TRAN_TYPE: "",
    CODE_ORG: "EE034",
    SM_ORG: record.sm || "SM001",
    BANK: "",
    ST_CODE: "",
    ST_NAME: "",
    CESS_TAX: 0.00,
    GST_TAX: 0.00,
    C_ADD1: "",
    C_PLACE: "",
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
    REGD: " ",
    GST_TYPE: "",
    GD00: 0.00, GD03: 0.00, GD05: 0.00, GD12: 0.00, GD18: 0.00, GD28: 0.00,
    TAX00: 0.00, TAX03: 0.00, TAX05: 0.00, TAX12: 0.00, TAX18: 0.00, TAX28: 0.00,
    CESS: 0.00,
    PST9: "",
    MST9: "",
    B_IGST: " ",
    TCODE: "",
    OLDVR: ""
  };
}

// Map JSON record to CASH.DBF format for Party Credit Entry (for discount)
async function mapToPartyCreditDbfFormat(record, jbVr, crVr, userId, customerData) {
  // Parse date components from the date field
  let dateFormatted = null;
  if (record.date) {
    const dateParts = record.date.split('-'); // Assuming DD-MM-YYYY format
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
    
    dateFormatted = new Date(Date.UTC(year, month, day, 0, 0, 0));
  }

  const discount = parseFloat(record.discount) || 0;
  const mgroup = customerData?.M_GROUP || "DT";

  return {
    DATE: dateFormatted,
    VR: jbVr,
    M_GROUP1: mgroup, 
    C_CODE: record.party || "", // Party code
    CR: discount, // Credit the party with discount amount
    DR: 0.00,
    REMARK: `CD- BY ON R/NO ${record.receiptNo || ""}`,
    CD: 0.00,
    QCR: 0.000,
    QDR: 0.000,
    R_NO: record.receiptNo || "",
    SERIES: record.series || "",
    BILL: "",
    DT_BILL: null,
    BOOK: "CB",
    E_TYPE: "G",
    ITEM: "",
    PUR_CODE: "",
    REC_AMT: 0.00,
    ET_PAID: " ",
    R_CODE: "EE034", // Reference to discount account
    CR_NOTE: 0.00,
    B_PLACE: customerData?.C_PLACE || "",
    PTRAN: " ",
    PBILL: 0,
    PSERIES: " ",
    JB_ENO: 0,
    BR_CODE: record.sm || "SM001",
    BILL1: "",
    REC_VR: "",
    SMPSER: "",
    BFLAG: " ",
    AC_NAME: customerData?.C_NAME || "",
    AC_PLACE: customerData?.C_PLACE || "",
    AC_GST: customerData?.C_GST || "",
    CD_ENTRY: "Y",
    CD_VRNO: crVr,
    IST_PUR: " ",
    UNIT_NO: 0,
    BANK_DATE: null,
    OK: " ",
    PRINT: "N",
    BILL2: "",
    TR_TYPE: "",
    CHQ_ISSUE: "",
    CASH: " ",
    FINANCE: " ",
    DN_PAY: 0.00,
    AC_MOBILE: customerData?.C_MOBILE || "",
    TAX: 0.00,
    TRAN_TYPE: "",
    CODE_ORG: record.party || "",
    SM_ORG: record.sm || "SM001",
    BANK: "",
    ST_CODE: customerData?.C_STATE || "",
    ST_NAME: customerData?.STATE_NAME || "",
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
    B_IGST: " ",
    TCODE: "",
    OLDVR: ""
  };
}

// POST endpoint to merge selected records to CASH.DBF
router.post('/sync', async (req, res) => {
  try {
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
      console.log(`Loaded ${Object.keys(userMapBySmCode).length} users with smCode for cash-receipts.`);
    } catch (readError) {
      console.error(`Error reading users JSON file at ${dbUsersPath} for cash-receipts:`, readError);
      // Decide if this is a fatal error or if we can proceed with mergingUserId as fallback
      // For now, proceeding, errors will show in USER_ID if smCode lookup fails and mergingUserId is used.
    }
    // --- End Load Users Data ---

    // --- Determine Merging User ID using smCode ---
    let mergingUserId = null; // Default to null (blank) instead of 2
    const authenticatedUserSmCode = req.user?.smCode;
    if (authenticatedUserSmCode && userMapBySmCode[authenticatedUserSmCode] !== undefined) {
        mergingUserId = userMapBySmCode[authenticatedUserSmCode];
        console.log(`Cash Receipts: Authenticated user ID resolved to ${mergingUserId} via smCode: ${authenticatedUserSmCode}`);
    } else {
        console.warn(`Cash Receipts: Authenticated user's smCode ('${authenticatedUserSmCode}') not found or smCode missing from req.user. Will proceed with sync but USER_ID for audit trail may be blank. req.user: ${JSON.stringify(req.user)}`);
        // mergingUserId remains null
    }
    // --- End Determine Merging User ID ---

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

    // --- Check for existing records ---
    const duplicateRecords = [];
    const validRecords = [];

    for (const record of selectedApprovedRecords) {
      const exists = await checkRecordExists(cashDbfOrm, record.receiptNo, record.series);
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
        message: 'All selected records have receipt numbers and series that already exist in the database.',
        duplicateRecords
      });
    }
    // --- End Check for existing records ---

    const nextVrStart = await getNextCrVrNumber(cashDbfOrm);
    let currentVrCounter = parseInt(nextVrStart.split('-')[1], 10);

    // Get next JB voucher number for discount entries
    const nextJbStart = await getNextJbVrNumber(cashDbfOrm);
    let currentJbCounter = parseInt(nextJbStart.split('-')[1], 10);

    const dbfRecords = [];
    const customerCache = new Map(); // Cache for customer data
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
            customerData = {}; // Use empty object to avoid errors later
        }
      }

      // --- Message Sending Logic (WhatsApp and TextLocal) ---
      try {
        const mobileNumber = customerData?.C_PHONE || customerData?.C_MOBILE; // Using AC_MOBILE from customerData

        // Declare these variables here so they are in scope for both if/else blocks
        const amount = parseFloat(record.amount) || 0;
        const receiptNo = record.receiptNo || ""; // This 'receiptNo' is now in scope for the else block
        const receiptDate = record.date || "Date N/A"; // Use record date

        if (mobileNumber && mobileNumber.trim() !== "") {
          // Format the WhatsApp message
          const whatsappMessage = `We Thankfully Acknowledge Receipt of Rs Amount : ${amount.toFixed(2)} Receipt No.${receiptNo} on Date ${receiptDate}\nRegards\nEKTA ENTERPRISES`;

          console.log(`[Cash Receipts Sync] Attempting to send WhatsApp text message for Receipt: ${receiptNo}, Mobile: ${mobileNumber}`);
          console.log(`[Cash Receipts Sync] Mock WhatsApp URL: http://localhost:4292/sendMessage?phoneNumber=${encodeURIComponent(mobileNumber)}&textMessage=${encodeURIComponent(whatsappMessage)}`);

          try {
            // Send WhatsApp text message
            const sendMessageResponse = await axios.get('http://localhost:4292/sendMessage', {
              params: {
                phoneNumber: mobileNumber,
                textMessage: whatsappMessage // Assuming the API supports textMessage parameter
              }
            });

            console.log(`[Cash Receipts Sync] WhatsApp Get query req params: ${JSON.stringify(sendMessageResponse.config.params)}`);
            if (sendMessageResponse.status === 200) {
              console.log(`[Cash Receipts Sync] WhatsApp message sent successfully for Receipt: ${receiptNo}. Response: ${JSON.stringify(sendMessageResponse.data)}`);
            } else {
              console.warn(`[Cash Receipts Sync] WhatsApp API call for Receipt: ${receiptNo} returned status ${sendMessageResponse.status}. Response: ${JSON.stringify(sendMessageResponse.data)}`);
            }

            // Send SMS using TextLocal API
            try {
              // Format the SMS message
              //format date to dd-mm-yyyy
              const formattedDate = format(new Date(receiptDate), 'dd-MM-yyyy');
              const smsMessage = `We Thankfully Acknowledge Receipt of Rs Amount : ${amount.toFixed(2)} on Date ${formattedDate} Regards Ekta Enterprises`;

              // Make TextLocal API call
              const textLocalResponse = await axios.get('https://api.textlocal.in/send/', {
                params: {
                  apikey: 'NmE0ODYyNDEzNDUzNWE2MTRhNTQ1YTQ1NDc0ZjRlNmE=',
                  sender: 'EKTAEN',
                  numbers: mobileNumber.replace(/\D/g, ''), // Remove non-digit characters
                  message: encodeURIComponent(smsMessage)
                }
              });

              if (textLocalResponse.data && textLocalResponse.data.status === 'success') {
                console.log(`[Cash Receipts Sync] TextLocal SMS sent successfully for Receipt: ${receiptNo}. Response: ${JSON.stringify(textLocalResponse.data)}`);
              } else {
                console.warn(`[Cash Receipts Sync] TextLocal SMS API call for Receipt: ${receiptNo} failed. Response: ${JSON.stringify(textLocalResponse.data)}`);
              }
            } catch (smsError) {
              console.error(`[Cash Receipts Sync] Error sending SMS via TextLocal for Receipt: ${receiptNo}: ${smsError.message}`, smsError);
            }
          } catch (apiError) {
            console.error(`[Cash Receipts Sync] Error calling WhatsApp sendMessage API for Receipt: ${receiptNo}: ${apiError.message}`, apiError);
          }
        } else {
          // 'receiptNo' is now correctly in scope here
          console.log(`[Cash Receipts Sync] Mobile number not found or empty for party ${record.party} in receipt ${receiptNo}. Skipping message send.`);
        }
      } catch (messageError) {
        // Log the full error object for better diagnostics (includes stack trace)
        console.error(`[Cash Receipts Sync] Error during message processing for receipt ${record.receiptNo}: ${messageError.message}`, messageError);
      }
      // --- End Message Sending Logic ---

      const vr = `CR-${String(currentVrCounter++).padStart(6, '0')}`;
      
      // --- Determine User ID based on SM Code ---
      const smCode = record.sm; // Default SM is already applied to selectedApprovedRecords
      let userIdToUse = null; // Default to null (blank)
      if (smCode && userMapBySmCode[smCode] !== undefined) {
        userIdToUse = userMapBySmCode[smCode];
      } else {
        console.warn(`Cash Receipt Sync: User ID not found for SM Code: '${smCode}' on record. USER_ID will be blank (null).`);
        // userIdToUse remains null
      }
      // --- End Determine User ID ---

      // Pass the resolved user ID to the mapping function
      const dbfRecord = await mapToCashDbfFormat(record, vr, userIdToUse, customerData);
      dbfRecords.push(dbfRecord);

      // If discount amount exists and is greater than 0, create additional entries
      const discount = parseFloat(record.discount) || 0;
      if (discount > 0) {
        const jbVr = `JB-${String(currentJbCounter++).padStart(6, '0')}`;
        
        // Create discount account debit entry
        const discountDebitRecord = await mapToDiscountDebitDbfFormat(record, jbVr, vr, userIdToUse, customerData);
        dbfRecords.push(discountDebitRecord);
        
        // Create party credit entry for discount
        const partyCreditRecord = await mapToPartyCreditDbfFormat(record, jbVr, vr, userIdToUse, customerData);
        dbfRecords.push(partyCreditRecord);
      }
    }

    // Append the records to the CASH.DBF file
    if (dbfRecords.length > 0) {
      await cashDbfOrm.insertMany(dbfRecords);
    }

    // Close DBF files
    cashDbfOrm.close();
    cmplDbfOrm.close();

    // --- Update JSON File ---
    // Remove synced records from approved JSON (only the valid ones)
    const validRecordIds = new Set(validRecords.map(r => `${r.receiptNo}-${r.party}-${r.date}`));
    const remainingApprovedRecords = approvedRecords.filter(appRec => {
      const recordId = `${appRec.receiptNo}-${appRec.party}-${appRec.date}`;
      return !validRecordIds.has(recordId);
    });
    
    await fs.writeFile(approvedJsonPath, JSON.stringify(remainingApprovedRecords, null, 2));

    // Return success with info about duplicates if any
    if (duplicateRecords.length > 0) {
      return res.json({
        success: true,
        message: `Successfully synced ${dbfRecords.length} cash receipt records to CASH.DBF. ${duplicateRecords.length} records skipped due to duplicate receipt number and series.`,
        syncedCount: dbfRecords.length,
        skippedCount: duplicateRecords.length,
        skippedRecords: duplicateRecords
      });
    }

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