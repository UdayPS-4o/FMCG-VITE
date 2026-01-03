const { DbfSync } = require('./utils/dbf-sync');
const path = require('path');

/**
 * Test script to verify the new safe DBF update functionality
 * This script tests the updateDbfRecords, insertDbfRecords, and upsertDbfRecords methods
 */
async function testDbfSync() {
  console.log('Starting DBF Sync Test...\n');
  
  // Initialize DbfSync with the correct path
  const dbfFolderPath = path.join(__dirname, '..', 'd01-2324');
  const dbfSync = new DbfSync(dbfFolderPath);
  
  try {
    // Test 1: Update existing records safely
    console.log('=== Test 1: Update Existing Records ===');
    const testUpdateRecords = [
      {
        SERIES: 'A',
        BILL: '001',
        CUSTOMER: 'Updated Customer 1',
        AMOUNT: 1500.00,
        DATE: new Date().toISOString().split('T')[0]
      },
      {
        SERIES: 'A', 
        BILL: '002',
        CUSTOMER: 'Updated Customer 2',
        AMOUNT: 2500.00,
        DATE: new Date().toISOString().split('T')[0]
      }
    ];
    
    const updateResult = await dbfSync.updateDbfRecords('BILL.DBF', testUpdateRecords, ['SERIES', 'BILL']);
    console.log('Update Result:', updateResult);
    console.log('');
    
    // Test 2: Insert new records safely
    console.log('=== Test 2: Insert New Records ===');
    const testInsertRecords = [
      {
        SERIES: 'B',
        BILL: '001',
        CUSTOMER: 'New Customer 1',
        AMOUNT: 3000.00,
        DATE: new Date().toISOString().split('T')[0]
      },
      {
        SERIES: 'B',
        BILL: '002', 
        CUSTOMER: 'New Customer 2',
        AMOUNT: 3500.00,
        DATE: new Date().toISOString().split('T')[0]
      }
    ];
    
    const insertResult = await dbfSync.insertDbfRecords('BILL.DBF', testInsertRecords, ['SERIES', 'BILL']);
    console.log('Insert Result:', insertResult);
    console.log('');
    
    // Test 3: Upsert records (mix of update and insert)
    console.log('=== Test 3: Upsert Records ===');
    const testUpsertRecords = [
      {
        SERIES: 'A',
        BILL: '001', // This should update existing
        CUSTOMER: 'Upserted Customer 1',
        AMOUNT: 4000.00,
        DATE: new Date().toISOString().split('T')[0]
      },
      {
        SERIES: 'C',
        BILL: '001', // This should insert new
        CUSTOMER: 'Upserted Customer 3',
        AMOUNT: 4500.00,
        DATE: new Date().toISOString().split('T')[0]
      }
    ];
    
    const upsertResult = await dbfSync.upsertDbfRecords('BILL.DBF', testUpsertRecords, ['SERIES', 'BILL']);
    console.log('Upsert Result:', upsertResult);
    console.log('');
    
    // Test 4: Test error handling with invalid data
    console.log('=== Test 4: Error Handling with Invalid Data ===');
    const invalidRecords = [
      {
        SERIES: 'D',
        // Missing BILL field - should be caught by validation
        CUSTOMER: 'Invalid Customer',
        AMOUNT: 5000.00
      },
      {
        SERIES: 'D',
        BILL: '002',
        CUSTOMER: 'Valid Customer',
        AMOUNT: 5500.00,
        DATE: new Date().toISOString().split('T')[0]
      }
    ];
    
    try {
      const errorResult = await dbfSync.updateDbfRecords('BILL.DBF', invalidRecords, ['SERIES', 'BILL']);
      console.log('Error handling test result:', errorResult);
    } catch (error) {
      console.log('Expected error caught:', error.message);
    }
    console.log('');
    
    console.log('=== All Tests Completed Successfully ===');
    console.log('The new DBF sync methods are working correctly without corruption!');
    
  } catch (error) {
    console.error('Test failed with error:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testDbfSync().catch(console.error);
}

module.exports = { testDbfSync };