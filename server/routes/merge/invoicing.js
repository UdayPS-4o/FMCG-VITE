const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises; // To read the JSON file
const crypto = require('crypto'); // Added for hashing
const axios = require('axios'); // Added for API calls
const { DbfORM } = require('../../dbf-orm');
const { getPartyByCode } = require('../utilities');

// Define DBF file paths using environment variable
const dbfFolderPath = process.env.DBF_FOLDER_PATH;
const billDbfPath = path.join(dbfFolderPath, 'data', 'BILL.DBF');
const billDtlDbfPath = path.join(dbfFolderPath, 'data', 'BILLDTL.DBF');
const pmplDbfPath = path.join(dbfFolderPath, 'data', 'PMPL.DBF'); // Product Master
const cmplDbfPath = path.join(dbfFolderPath, 'data', 'CMPL.DBF'); // Customer Master

// Source JSON data
const invoicingJsonPath = path.resolve(__dirname, '..', '..', 'db', 'approved', 'invoicing.json');
const usersJsonPath = path.resolve(__dirname, '..', '..', 'db', 'users.json'); // Path to users.json
const pdfBaseDir = path.resolve(__dirname, '..', '..', 'db', 'pdfs'); // Base directory for PDFs

// --- Mapping Functions ---

// Helper to safely parse float and round
function safeParseFloat(value, decimals = 2) {
  const num = parseFloat(value || 0);
  return parseFloat(num.toFixed(decimals));
}

// Helper to pad bill number
function padBillNumber(series, billNo) {
  // Format as "X-    Y" where X is series and Y is billNo with left padding to total 5 chars
  const combinedString = `${series}-${" ".repeat(5-`${billNo}`.length)}${billNo}`;
  return combinedString;
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

function mapToBillDbfFormat(parsedUtcDate, invoice, customerData, calculatedTotals, billCreatorUserId) {
  console.log("Mapping BILL for:", invoice.billNo, "Customer:", customerData?.C_NAME);
  const { netAmountRounded, roundOff } = calculatedTotals;

  return {
    SERIES: invoice.series,
    BILL: parseInt(invoice.billNo, 10),
    CASH: invoice.cash || 'N',
    DATE: parsedUtcDate,
    DUE_DAYS: parseInt(invoice.dueDays, 10) || 0,
    RECD: "",
    C_CODE: invoice.party,
    BR_CODE: invoice.sm,
    C_NAME: customerData?.C_NAME || invoice.partyName,
    C_ADD1: customerData?.C_ADD1 || "",
    C_ADD2: customerData?.C_ADD2 || "",
    C_PLACE: customerData?.C_PLACE || "",
    C_MOBILE: customerData?.C_MOBILE || "",
    TRANSFER: "",
    TRUCK_NO: "",
    TR_DRIVER: "",
    TR_LIC_NO: "",
    TRNS_NAME: "",
    BILL_BB: padBillNumber(invoice.series, invoice.billNo),
    BILL_DD: "",
    BILL2: padBillNumber(invoice.series, invoice.billNo),
    BILL1: "",
    N_B_AMT: netAmountRounded,
    R_OFF: roundOff,
    DM_SER: "",
    DM_NO: null,
    CON_DATE: null,
    CON_BILL: "",
    AD_SERIES: "",
    AD_BILL: null,
    REF_NO: invoice.ref || "",
    CASH_DIS: null,
    BILL_REM: "",
    PST9: customerData?.C_STATE || "",
    C_CST: customerData?.C_CST || "",
    DVD_PAY: null,
    FINANCE: "",
    FN_CODE: "",
    DN_PAY: null,
    FN_ID: "",
    DISTANCE: customerData?.DISTANCE || null,
    EWAY: "",
    EWAYBNO: "",
    EWAYDATE: null,
    EWAYVALID: null,
    EWAYVEH: "",
    EWAYTRAN: "",
    CODE_ORG: invoice.party,
    SM_ORG: invoice.sm,
    USER_ID: billCreatorUserId,
    USER_TIME: formatUserTime(new Date()),
    ORG_AMT: netAmountRounded,
    EWAYDOC: "",
    BILTYNO: "",
    BILTYDATE: null,
    IRN: "",
    ACK_NO: "",
    ACK_DATE: "",
    GST_TYPE: "",
    USER_ID2: null,
    USER_TIME2: null,
    ORG_AMT2: null,
    BILLSTATUS: null,
  };
}

function mapToBillDtlDbfFormat(parsedUtcDate, invoice, item, sno, productData, customerData) {
  console.log("Mapping BILLDTL for:", invoice.billNo, "Item:", item.item, "Product:", productData?.PRODUCT);

  const qty = safeParseFloat(item.qty, 3);
  const rate = safeParseFloat(item.rate, 2);
  const schRs = safeParseFloat(item.schRs, 2);
  const schPerc = safeParseFloat(item.sch, 2);
  const cdPerc = safeParseFloat(item.cd, 2);
  const cessPerUnit = safeParseFloat(item.cess, 2);

  const gstPerc = safeParseFloat(productData?.GST || 0, 2);

  const amt10 = safeParseFloat(qty * rate, 2);
  const sch10 = safeParseFloat(schRs, 2);
  const amountAfterSchRs = safeParseFloat(amt10 - sch10, 2);
  const dis10 = safeParseFloat(amountAfterSchRs * (schPerc / 100), 2);
  const amountAfterSchDisc = safeParseFloat(amountAfterSchRs - dis10, 2);
  const cd10 = safeParseFloat(amountAfterSchDisc * (cdPerc / 100), 2);
  const net10 = safeParseFloat(amountAfterSchDisc - cd10, 2);

  const gstFactor = 1 + (gstPerc / 100);
  const gd10 = safeParseFloat(net10 / gstFactor, 2);
  const gst10 = safeParseFloat(net10 - gd10, 2);

  const bas10 = safeParseFloat(rate / gstFactor, 2);

  const cess10 = safeParseFloat(cessPerUnit * qty, 2);
  
  // Determine if item unit matches UNIT_2, if so multiply TRADE by MULT_F
  const multFactor = safeParseFloat(productData?.MULT_F || 1, 0);
  const isUnit2 = item.unit.toUpperCase() === (productData?.UNIT_2 || '').toUpperCase();
  const trade = safeParseFloat(productData?.TRADE1 || rate, 2);
  const adjustedTrade = isUnit2 ? safeParseFloat(trade * multFactor, 2) : trade;
  
  // Determine UNIT_NO based on which unit matches
  let unitNo = 1; // Default to UNIT_1
  if (item.unit.toUpperCase() === (productData?.UNIT_2 || '').toUpperCase()) {
    unitNo = 2;
  } else if (item.unit.toUpperCase() === (productData?.UNIT_1 || '').toUpperCase()) {
    unitNo = 1;
  }

  const result = {
    SERIES: invoice.series,
    BILL: parseInt(invoice.billNo, 10),
    DATE: parsedUtcDate,
    CODE: item.item,
    GDN_CODE: item.godown,
    UNIT: item.unit,
    MULT_F: item.unit.toUpperCase() === (productData?.UNIT_2 || '').toUpperCase() ? multFactor : 1,
    TRADE: adjustedTrade,
    R_OPT: "",
    MRP: safeParseFloat(productData?.MRP1 || 0, 2),
    RATE: rate,
    FILL: null,
    BAGS: null,
    QTY: qty,
    DAMAGE: null,
    FREE: null,
    FREE_SH: null,
    DISCOUNT: schPerc,
    SCHEME: sch10,
    C_DIS: null,
    CASH_DIS: cdPerc, // Map to item.cd value
    EXT_DESC: "",
    BATCH_NO: "",
    EXPIRY: null,
    IMEI_NO: "",
    LST: null,
    GST: gstPerc,
    CESS_TAX: safeParseFloat(productData?.CESS_TAX || 0, 2),
    CESS_RS: cessPerUnit,
    CESS_TOT: cess10,
    SNO: sno,
    BILL_BB: padBillNumber(invoice.series, invoice.billNo),
    BILL2: padBillNumber(invoice.series, invoice.billNo),
    DM_SERIES: "",
    DM_NO: null,
    CON_BILL: "",
    AD_SERIES: "",
    AD_BILL: null,
    BAS10: bas10,
    AMT10: amt10,
    SCH10: sch10,
    DIS10: dis10,
    CD10: cd10,
    CESS10: cess10,
    NET10: net10,
    GD10: gd10,
    GST10: gst10,
    GR_CODE9: productData?.GR_CODE || "",
    PRODUCT: productData?.PRODUCT || "",
    PRODUCT_L: productData?.PRODUCT_L || productData?.PRODUCT || "",
    PACK: productData?.PACK || "",
    OK: "Y",
    UNIT_NO: unitNo,
    C_CODE: invoice.party,
    BR_CODE: invoice.sm,
    C_CST: customerData?.C_CST || "", // Use customer's C_CST
    VR_NO_B: "",
    VR_NO_D: "",
    HSN_CODE: productData?.H_CODE || "",
    OLDCODE: item.item,
    OLDUNIT: null,
    OLDQTY: null,
    EXP_MY: "",
    EXP_C: "",
    RBILL2: "",
    SPID: `${invoice.party}${item.item} ${new Date().getTime()}`,
    GST_TYPE: "",
    GD00: gstPerc === 0 ? gd10 : null,
    GD03: gstPerc === 3 ? gd10 : null,
    GD05: gstPerc === 5 ? gd10 : null,
    GD12: gstPerc === 12 ? gd10 : null,
    GD18: gstPerc === 18 ? gd10 : null,
    GD28: gstPerc === 28 ? gd10 : null,
    TAX00: gstPerc === 0 ? gst10 : null,
    TAX03: gstPerc === 3 ? gst10 : null,
    TAX05: gstPerc === 5 ? gst10 : null,
    TAX12: gstPerc === 12 ? gst10 : null,
    TAX18: gstPerc === 18 ? gst10 : null,
    TAX28: gstPerc === 28 ? gst10 : null,
    CESS: null,
    PST9: customerData?.C_STATE || "",
    MST9: "",
    B_IGST: "",
    SH_NAME: "",
    WEIGHT: safeParseFloat(productData?.WEIGHT || 0, 3),
    WT_UNIT: productData?.WT_UNIT || "",
    QTY_MAIN: "",
    QDR: null,
    PRODREM: "",
    GROSS_RATE: null,
    LESS_RATE: null,
    LESS_DIS: null,
    LREM: "",
    BRAND: productData?.BRAND || "",
  };

  return { record: result, net10: net10 };
}

// --- /sync Endpoint ---

router.post('/sync', async (req, res) => {
  const billDbf = new DbfORM(billDbfPath, { autoCreate: true });
  const billDtlDbf = new DbfORM(billDtlDbfPath, { autoCreate: true });
  const pmplDbf = new DbfORM(pmplDbfPath);
  const cmplDbf = new DbfORM(cmplDbfPath);

  try {
    console.log('[Invoicing Handler] Request received. req.user:', JSON.stringify(req.user));

    // --- Load Users Data ---
    let userMapBySmCode = {};
    try {
      const usersJsonData = await fs.readFile(usersJsonPath, 'utf-8');
      const users = JSON.parse(usersJsonData);
      userMapBySmCode = users.reduce((map, user) => {
        if (user.smCode) { // Only map users with an smCode
          map[user.smCode] = user.id;
        }
        return map;
      }, {});
      console.log(`Loaded ${Object.keys(userMapBySmCode).length} users with smCode.`);
    } catch (readError) {
      console.error(`Error reading users JSON file at ${usersJsonPath}:`, readError);
      // Continue without the map, or return an error depending on requirements
      // return res.status(500).json({ success: false, message: 'Failed to read users data file.', error: readError.message });
    }
    // --- End Load Users Data ---

    // --- Determine Merging User ID (called 'userId' in this file scope) using smCode ---
    let userId = null; // This is the merging user's ID for this context (defaulting to null/blank)
    const authenticatedUserSmCode = req.user?.smCode;
    if (authenticatedUserSmCode && userMapBySmCode[authenticatedUserSmCode] !== undefined) {
        userId = userMapBySmCode[authenticatedUserSmCode];
        console.log(`Invoicing: Authenticated user ID (userId) resolved to ${userId} via smCode: ${authenticatedUserSmCode}`);
    } else {
        // Modified: Now this is just a warning, not an error that prevents execution
        console.warn(`Invoicing: Authenticated user's smCode ('${authenticatedUserSmCode}') not found or smCode missing from req.user. Will proceed with sync but USER_ID for audit trail may be blank. req.user: ${JSON.stringify(req.user)}`);
        // userId remains null
    }
    // --- End Determine Merging User ID ---

    // 1. Check if records are provided in the request
    if (!req.body.records || !Array.isArray(req.body.records) || req.body.records.length === 0) {
      return res.status(400).json({ success: false, message: 'No invoice records provided in the request.' });
    }

    // Use the records from the request body instead of reading from file
    const invoicesData = req.body.records;

    // 2. Open DBFs
    await Promise.all([
      billDbf.open(),
      billDtlDbf.open(),
      pmplDbf.open(),
      cmplDbf.open()
    ]).catch(async (openError) => {
        if (openError.message.includes(path.basename(billDbfPath)) || openError.message.includes(path.basename(billDtlDbfPath))) {
            console.log('BILL.DBF or BILLDTL.DBF not found, attempting to create...');
            try {
                await billDbf.create();
                await billDtlDbf.create();
                await pmplDbf.open();
                await cmplDbf.open();
            } catch (createError) {
                console.error('Error creating or opening DBF files:', createError);
                throw new Error(`Failed to open/create required DBF files: ${createError.message}`);
            }
        } else {
             console.error('Error opening DBF files:', openError);
             throw new Error(`Failed to open required DBF files (PMPL/CMPL might be missing): ${openError.message}`);
        }
    });

    // 3. Load PMPL, CMPL into maps
    console.log('Loading PMPL data...');
    const pmplRecords = await pmplDbf.findAll();
    const pmplMap = pmplRecords.reduce((map, record) => {
      map[record.CODE] = record; // Key by Product Code
      return map;
    }, {});
    console.log(`Loaded ${Object.keys(pmplMap).length} product records.`);

    console.log('Loading CMPL data...');
    const cmplRecords = await cmplDbf.findAll();
    const cmplMap = cmplRecords.reduce((map, record) => {
      map[record.C_CODE] = record; // Key by Customer Code
      return map;
    }, {});
    console.log(`Loaded ${Object.keys(cmplMap).length} customer records.`);


    // 4. Load existing BILL keys (SERIES+BILL)
    console.log('Loading existing BILL keys...');
    const existingBillRecords = await billDbf.findAll();
    const existingBillKeys = new Set(existingBillRecords.map(rec => `${rec.SERIES}-${rec.BILL}`));
    console.log(`Found ${existingBillKeys.size} existing bill keys.`);


    // 5. Iterate invoices, check duplicates, map data
    const billRecordsToInsert = [];
    const billDtlRecordsToInsert = [];
    const skippedInvoices = [];
    const processedInvoices = [];
    let messagesAttempted = 0;
    let messagesSent = 0;
    let messagesSkippedPdfNotFound = 0;
    let messagesSkippedNoMobile = 0;

    for (const invoice of invoicesData) {
      const billKey = `${invoice.series}-${invoice.billNo}`;
      if (existingBillKeys.has(billKey)) {
        console.log(`Skipping duplicate bill: ${billKey}`);
        skippedInvoices.push({ key: billKey, reason: 'Duplicate' });
        continue;
      }

      // Parse date components from the date field (DD-MM-YYYY)
      const dateParts = invoice.date.split('-'); 
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
      let hours = 0, minutes = 0, seconds = 0;
      if (invoice.createdAt) {
        const createdDate = new Date(invoice.createdAt);
        hours = createdDate.getUTCHours();
        minutes = createdDate.getUTCMinutes();
        seconds = createdDate.getUTCSeconds();
      }
      
      // Create a UTC date object with the exact date and time components
      // This ensures the date remains as specified regardless of server timezone
      const combinedDate = new Date(Date.UTC(year, month, day, 0, 0, 0)); 
      
      console.log(`Original date string: ${invoice.date}, Created at: ${invoice.createdAt || 'N/A'} (using midnight UTC for DBF DATE field), Combined date: ${combinedDate.toISOString()}`);

      // Look up customer data
      const customerData = cmplMap[invoice.party] || null;
      if (!customerData) {
          console.warn(`Customer data not found for party code: ${invoice.party} in bill ${billKey}. Proceeding with limited data.`);
          // Decide if you want to skip or proceed with partial data
          // skippedInvoices.push({ key: billKey, reason: 'Missing Customer Data' });
          // continue;
      }

      let currentBillDetails = [];
      let totalNetAmountExact = 0;
      let hasMissingProductData = false;

      // Map BILLDTL records first to calculate totals
      let sno = 1;
      for (const item of invoice.items) {
        const productData = pmplMap[item.item] || null;
        if (!productData) {
           console.warn(`Product data not found for item code: ${item.item} in bill ${billKey}. Proceeding with limited data.`);
           hasMissingProductData = true;
        }
        // Pass customerData to detail mapping for fields like PST9
        const { record: billDtlRecord, net10 } = mapToBillDtlDbfFormat(combinedDate, invoice, item, sno, productData, customerData);
        currentBillDetails.push(billDtlRecord);
        totalNetAmountExact += net10;
        sno++;
      }

      // Optional: Skip bill if critical product data was missing
      // if (hasMissingProductData) {
      //    skippedInvoices.push({ key: billKey, reason: 'Missing Product Data' });
      //    continue;
      // }

      // Calculate totals for BILL header
      const netAmountRounded = Math.round(totalNetAmountExact);
      const roundOff = safeParseFloat(netAmountRounded - totalNetAmountExact, 2);
      const calculatedTotals = { netAmountRounded, roundOff };

      // --- Determine User ID for the specific invoice record ---
      const invoiceSmCode = invoice.sm;
      let recordUserId = null; // Default to null (blank)
      if (invoiceSmCode && userMapBySmCode[invoiceSmCode] !== undefined) {
          recordUserId = userMapBySmCode[invoiceSmCode];
      } else {
          console.warn(`Invoicing Sync: User ID not found for SM Code: '${invoiceSmCode}' in bill ${billKey}. Record's USER_ID will be blank (null).`);
          // recordUserId remains null
      }
      // --- End Determine User ID for the specific invoice record ---

      // Map BILL record using calculated totals and the record-specific userId
      const billRecord = mapToBillDbfFormat(combinedDate, invoice, customerData, calculatedTotals, recordUserId);
      billRecordsToInsert.push(billRecord);

      // Add the processed details to the main list
      billDtlRecordsToInsert.push(...currentBillDetails);

      // --- New logic for PDF hash, existence check, and API call ---
      try {
        const hash = crypto.createHash('md5').update(JSON.stringify(invoice)).digest('hex');
        const PdfFilename = `${invoice.series}-${invoice.billNo}-${hash}.pdf`;
        const pdfFullPath = path.join(pdfBaseDir, PdfFilename);

        try {
          await fs.access(pdfFullPath, fs.constants.F_OK); // Check if file exists
          console.log(`[Invoicing Sync] PDF found for bill ${billKey}: ${pdfFullPath}`);

          const mobileNumber = customerData?.C_MOBILE; // Using C_MOBILE from existing customerData

          if (mobileNumber && mobileNumber.trim() !== "") {
            // const apiFilePath = `db/pdfs/${PdfFilename}`; // Path for the API as per user spec
            const apiFilePath = path.join(pdfBaseDir, PdfFilename);
            const apiFileName = `${invoice.series}-${invoice.billNo}.pdf`;

            console.log(`[Invoicing Sync] Attempting to send message for ${apiFileName} (Bill: ${billKey}), Mobile: ${mobileNumber}, PDF Path: ${apiFilePath}`);
            console.log(`[Invoicing Sync] Mock URL: http://localhost:4292/sendMessage?filePath=${encodeURIComponent(apiFilePath)}&fileName=${encodeURIComponent(apiFileName)}`);
            messagesAttempted++;
            try {
              // Send WhatsApp PDF message
              const sendMessageResponse = await axios.get('http://localhost:4292/sendMessage', {
                params: {
                  filePath: apiFilePath,
                  fileName: apiFileName,
                  phoneNumber: mobileNumber
                }
              });

              // console.log get query req params
              console.log(`[Invoicing Sync] Get query req params: ${JSON.stringify(sendMessageResponse.config.params)}`);
              if (sendMessageResponse.status === 200) {
                console.log(`[Invoicing Sync] Message sent successfully for ${apiFileName} (Bill: ${billKey}). Response: ${JSON.stringify(sendMessageResponse.data)}`);
                messagesSent++;
              } else {
                console.warn(`[Invoicing Sync] API call for ${apiFileName} (Bill: ${billKey}) returned status ${sendMessageResponse.status}. Response: ${JSON.stringify(sendMessageResponse.data)}`);
              }
              
              // Send SMS using TextLocal API
              try {
                // Format the SMS message
                let customerName = customerData?.C_NAME || invoice.partyName || '';
                customerName = customerName.substring(0, 30);
                const billNumberFormatted = `${invoice.series}- ${invoice.billNo}`;
                const billAmount = netAmountRounded.toFixed(2);
                
                const smsMessage = `Dear ${customerName} Thank you for Purchasing Bill No. ${billNumberFormatted} For Amount : ${billAmount} Regards Ekta Enterprises`;
                
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
                  console.log(`[Invoicing Sync] SMS sent successfully for ${billKey}. Response: ${JSON.stringify(textLocalResponse.data)}`);
                } else {
                  console.warn(`[Invoicing Sync] TextLocal SMS API call for ${billKey} failed. Response: ${JSON.stringify(textLocalResponse.data)}`);
                }
              } catch (smsError) {
                console.error(`[Invoicing Sync] Error sending SMS via TextLocal for ${billKey}:`, smsError.message || smsError);
              }
            } catch (apiError) {
              console.error(`[Invoicing Sync] Error calling sendMessage API for ${apiFileName} (Bill: ${billKey}):`, apiError.message || apiError);
            }
          } else {
            console.log(`[Invoicing Sync] Mobile number not found or empty for party ${invoice.party} in bill ${billKey}. Skipping message send.`);
            messagesSkippedNoMobile++;
          }
        } catch (fileError) {
          if (fileError.code === 'ENOENT') {
            console.log(`[Invoicing Sync] PDF not found for bill ${billKey}: ${pdfFullPath}. Skipping message send.`);
            messagesSkippedPdfNotFound++;
          } else {
            console.warn(`[Invoicing Sync] Error checking PDF file ${pdfFullPath} for bill ${billKey}:`, fileError.message);
          }
        }
      } catch (hashOrPdfError) {
        console.error(`[Invoicing Sync] Error during hashing or PDF processing for bill ${billKey}:`, hashOrPdfError.message);
      }
      // --- End new logic ---

      processedInvoices.push(billKey);
      existingBillKeys.add(billKey); // Add to set to prevent duplicates within the same batch
    }

    // 6. Insert into BILL and BILLDTL
    if (billRecordsToInsert.length > 0) {
      console.log(`Inserting ${billRecordsToInsert.length} new records into BILL.DBF...`);
      await billDbf.insertMany(billRecordsToInsert);
    }
     if (billDtlRecordsToInsert.length > 0) {
      console.log(`Inserting ${billDtlRecordsToInsert.length} new records into BILLDTL.DBF...`);
      await billDtlDbf.insertMany(billDtlRecordsToInsert);
    }


    // 8. Return response
    return res.json({
      success: true,
      message: `Sync completed. Processed: ${processedInvoices.length}, Skipped: ${skippedInvoices.length}`,
      processed: processedInvoices,
      skipped: skippedInvoices,
      messagesAttempted: messagesAttempted,
      messagesSent: messagesSent,
      messagesSkippedPdfNotFound: messagesSkippedPdfNotFound,
      messagesSkippedNoMobile: messagesSkippedNoMobile
    });


  } catch (error) {
    console.error('Error during invoicing sync:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync invoicing data to DBF files',
      error: error.message
    });
  } finally {
    // 7. Close DBFs
    console.log('Closing DBF files...');
    try {
        await Promise.allSettled([
            billDbf.close(),
            billDtlDbf.close(),
            pmplDbf.close(),
            cmplDbf.close()
        ]);
        console.log('DBF files closed.');
    } catch (closeError) {
        // Log errors during close but don't crash the response
        console.error('Error closing DBF files:', closeError);
    }
  }
});

module.exports = router; 