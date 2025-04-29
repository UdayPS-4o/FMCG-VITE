const express = require('express');
const router = express.Router();
const path = require('path');
const { DbfORM } = require('../../dbf-orm');

// Set the path to the DBF file
const dbfFilePath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CMPL.dbf');

console.log({dbfFilePath})
// Map fields from JSON to DBF format
function mapToDbfFormat(record) {
  return {
    M_GROUP: "DT", // Default group for accounts
    M_NAME: "Sundry Debtors", // Default name
    C_CODE: record.subgroup  || "", // Use ID or empty string
    C_NAME: record.achead || "",
    HIN_NAME: "",
    C_ADD1: record.addressline1 || "",
    C_ADD2: record.addressline2 || "",
    C_PLACE: record.place || "",
    C_PIN: record.pincode || "",
    C_PHONE: "",
    C_MOBILE: record.mobile || "",
    C_PAN_NO: record.pan || "",
    C_ADHAR: record.aadhar || "",
    C_CST: record.gst || "",
    C_GST: record.gst || "",
    C_DL_NO: record.dlno || "",
    C_FGLNO: "",
    FSAAINO: record.fssaino || "",
    C_STATE: record.statecode || "",
    EMAIL: record.email || "",
    SUBGR: "",
    // Set all numeric fields to null or 0
    QTY_MAIN: "",
    NO_BILL: "",
    CUST_CAT: "",
    UNIT: "",
    DISTANCE: null,
    TAXTYPE: "",
    GST_TAX: null,
    VAT_TAX: null,
    OTHER_TAX: null,
    RATE: null,
    PROFIT: null,
    DEPR_RATE: null,
    SHARE: null,
    CUR_BAL: null,
    CR: 0,
    QCR: null,
    DR: 0,
    QDR: null,
    PUR_CODE: "",
    FILLING: null,
    UNIT_2: "",
    SNO: null,
    P_DIS: null,
    BL_LIMIT: null,
    CB_VAL: 0,
    CB_DATE: null,
    NET_PROFIT: 0,
    MP_PUR: "",
    AC_NO: "",
    B2B: "",
    C_BRANCH: "",
    GSTNO: record.gst || "",
    DEFAULTER: "",
    CR_LIMIT: null,
    CR_DAYS: null,
    SM_CODE: "",
    CESS_TAX: null,
    TCS: "",
    TCS_PER: null,
    WA_MOB: "",
    VSEND: null,
    ADDEDON: null,
    DOA: null,
    DOB: null
  };
}

// POST endpoint to merge selected records to DBF
router.post('/sync', async (req, res) => {
  try {
    // Get authenticated user ID from middleware
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated or ID missing.' });
    }

    const { records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'No records provided' });
    }

    // Create DBF ORM instance with field descriptors
    const dbfOrm = new DbfORM(dbfFilePath, { 
      autoCreate: true, // Create the file if it doesn't exist
      includeDeletedRecords: false
    });

    // Check if file exists, create if it doesn't
    try {
      await dbfOrm.open();
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('DBF file does not exist, creating new file');
        await dbfOrm.create();
      } else {
        throw error;
      }
    }

    // Get existing C_CODE values from DBF file to check for duplicates
    const existingRecords = await dbfOrm.findAll();
    const existingCCodes = new Set(existingRecords.map(record => record.C_CODE));

    // Separate records with duplicate C_CODE and valid records
    const duplicateRecords = [];
    const validRecords = [];

    records.forEach(record => {
      const cCode = record.subgroup;
      if (existingCCodes.has(cCode)) {
        duplicateRecords.push(record);
      } else {
        validRecords.push(record);
        // Add to set to prevent duplicates within the same batch
        existingCCodes.add(cCode);
      }
    });

    // Only process valid records
    if (validRecords.length > 0) {
      // Map the valid records to DBF format
      const dbfRecords = validRecords.map(record => mapToDbfFormat(record));
      
      // Append the records to the DBF file
      await dbfOrm.insertMany(dbfRecords);
    }

    // Close the DBF file
    dbfOrm.close();

    return res.json({ 
      success: true, 
      message: `Processed ${records.length} records: ${validRecords.length} synced, ${duplicateRecords.length} failed due to duplicate C_CODE`,
      syncedRecords: validRecords,
      duplicateRecords: duplicateRecords
    });
  } catch (error) {
    console.error('Error syncing to DBF:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to sync records to DBF file',
      error: error.message
    });
  }
});

module.exports = router; 