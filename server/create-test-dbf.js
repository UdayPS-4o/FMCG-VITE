const path = require('path');
const { DbfORM } = require('./dbf-orm');

// Field definitions for CMPL.dbf
const fieldDescriptors = [
  { name: 'M_GROUP', type: 'C', size: 5 },
  { name: 'M_NAME', type: 'C', size: 40 },
  { name: 'PARTY_MAP', type: 'C', size: 40 },
  { name: 'C_CODE', type: 'C', size: 10 },
  { name: 'C_NAME', type: 'C', size: 40 },
  { name: 'HIN_NAME', type: 'C', size: 40 },
  { name: 'QTY_MAIN', type: 'C', size: 10 },
  { name: 'NO_BILL', type: 'C', size: 10 },
  { name: 'CUST_CAT', type: 'C', size: 10 },
  { name: 'UNIT', type: 'C', size: 10 },
  { name: 'C_ADD1', type: 'C', size: 40 },
  { name: 'C_ADD2', type: 'C', size: 40 },
  { name: 'C_PLACE', type: 'C', size: 40 },
  { name: 'C_PIN', type: 'C', size: 10 },
  { name: 'DISTANCE', type: 'N', size: 8, decimals: 2 },
  { name: 'C_PHONE', type: 'C', size: 15 },
  { name: 'C_MOBILE', type: 'C', size: 15 },
  { name: 'C_CST', type: 'C', size: 20 },
  { name: 'C_GST', type: 'C', size: 20 },
  { name: 'C_DL_NO', type: 'C', size: 20 },
  { name: 'C_DLNO', type: 'C', size: 20 },
  { name: 'C_FGLNO', type: 'C', size: 20 },
  { name: 'C_PAN_NO', type: 'C', size: 20 },
  { name: 'C_ADHAR', type: 'C', size: 20 },
  { name: 'C_STATE', type: 'C', size: 2 },
  { name: 'TAXTYPE', type: 'C', size: 5 },
  { name: 'GST_TAX', type: 'N', size: 8, decimals: 2 },
  { name: 'VAT_TAX', type: 'N', size: 8, decimals: 2 },
  { name: 'OTHER_TAX', type: 'N', size: 8, decimals: 2 },
  { name: 'RATE', type: 'N', size: 8, decimals: 2 },
  { name: 'PROFIT', type: 'N', size: 8, decimals: 2 },
  { name: 'DEPR_RATE', type: 'N', size: 8, decimals: 2 },
  { name: 'SHARE', type: 'N', size: 8, decimals: 2 },
  { name: 'CUR_BAL', type: 'N', size: 12, decimals: 2 },
  { name: 'CR', type: 'N', size: 12, decimals: 2 },
  { name: 'QCR', type: 'N', size: 12, decimals: 2 },
  { name: 'DR', type: 'N', size: 12, decimals: 2 },
  { name: 'QDR', type: 'N', size: 12, decimals: 2 },
  { name: 'PUR_CODE', type: 'C', size: 10 },
  { name: 'FILLING', type: 'N', size: 8, decimals: 2 },
  { name: 'UNIT_2', type: 'C', size: 10 },
  { name: 'SNO', type: 'N', size: 8, decimals: 0 },
  { name: 'P_DIS', type: 'N', size: 8, decimals: 2 },
  { name: 'BL_LIMIT', type: 'N', size: 12, decimals: 2 },
  { name: 'CB_VAL', type: 'N', size: 12, decimals: 2 },
  { name: 'CB_DATE', type: 'D' },
  { name: 'NET_PROFIT', type: 'N', size: 12, decimals: 2 },
  { name: 'MP_PUR', type: 'C', size: 10 },
  { name: 'AC_NO', type: 'C', size: 20 },
  { name: 'B2B', type: 'C', size: 1 },
  { name: 'C_BRANCH', type: 'C', size: 40 },
  { name: 'GSTNO', type: 'C', size: 15 },
  { name: 'FSAAINO', type: 'C', size: 20 },
  { name: 'DEFAULTER', type: 'C', size: 1 },
  { name: 'CR_LIMIT', type: 'N', size: 12, decimals: 2 },
  { name: 'CR_DAYS', type: 'N', size: 5, decimals: 0 },
  { name: 'SM_CODE', type: 'C', size: 10 },
  { name: 'CESS_TAX', type: 'N', size: 8, decimals: 2 },
  { name: 'EMAIL', type: 'C', size: 40 },
  { name: 'TCS', type: 'C', size: 1 },
  { name: 'TCS_PER', type: 'N', size: 8, decimals: 2 },
  { name: 'SUBGR', type: 'C', size: 5 },
  { name: 'ST_NAME', type: 'C', size: 40 },
  { name: 'WA_MOB', type: 'C', size: 15 },
  { name: 'VSEND', type: 'L' },
  { name: 'ADDEDON', type: 'D' },
  { name: 'DOA', type: 'D' },
  { name: 'DOB', type: 'D' }
];

async function createTestDbf() {
  const dbfFilePath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'dbf', 'CMPL.dbf');
  console.log(`Creating test DBF file at: ${dbfFilePath}`);

  try {
    // Create DBF ORM instance with the field descriptors
    const dbfOrm = new DbfORM(dbfFilePath, {
      autoCreate: true // Create the file if it doesn't exist
    });

    // Define the fields
    dbfOrm.defineFields(fieldDescriptors);

    // Create the DBF file
    await dbfOrm.create();

    // Add a test record
    const testRecord = {
      M_GROUP: 'CT',
      M_NAME: 'Sundry Creditors',
      C_CODE: 'TEST01',
      C_NAME: 'Test Account',
      C_ADD1: 'Test Address Line 1',
      C_ADD2: 'Test Address Line 2',
      C_PLACE: 'Test Place',
      C_PIN: '452001',
      C_MOBILE: '9876543210',
      C_PAN_NO: 'ABCDE1234F',
      C_STATE: '23',
      EMAIL: 'test@example.com',
      // Other fields will be null or empty by default
    };

    await dbfOrm.insert(testRecord);

    // Close the file
    dbfOrm.close();

    console.log('DBF file created successfully with a test record.');
  } catch (error) {
    console.error('Error creating DBF file:', error);
  }
}

// Execute the function
createTestDbf().then(() => console.log('Script completed')); 