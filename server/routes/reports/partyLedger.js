const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Function to parse date strings (YYYY-MM-DD)
const parseDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // Month is 0-indexed in JavaScript Date
};

// Helper function to format a Date object to DD-MM-YYYY string
const formatDateDDMMYYYY = (dateObj) => {
  if (!dateObj || !(dateObj instanceof Date)) return 'N/A';
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
};

// GET /api/reports/party-ledger
router.get('/party-ledger', async (req, res) => {
  try {
    const { fromDate, toDate, partyCode } = req.query;

    if (!fromDate || !toDate || !partyCode) {
      return res.status(400).json({ message: 'fromDate, toDate, and partyCode are required' });
    }

    const startDate = parseDate(fromDate);
    const endDate = parseDate(toDate);
    endDate.setHours(23, 59, 59, 999); // Include the entire end date

    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');

    let cashData = [];
    let cmplData = [];

    try {
      const cashFileContents = await fs.readFile(cashPath, 'utf-8');
      cashData = JSON.parse(cashFileContents);
    } catch (error) {
      console.error('Error reading or parsing CASH.json:', error);
      return res.status(500).json({ message: 'Error loading cash data.' });
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading or parsing CMPL.json:', error);
      return res.status(500).json({ message: 'Error loading party data.' });
    }

    // Get party name
    const party = cmplData.find(p => p.C_CODE === partyCode);
    const partyName = party ? party.C_NAME : 'Unknown Party';

    // Filter cash data for the selected party and date range
    let filteredData = cashData.filter(item => {
      if (item.C_CODE !== partyCode) return false;
      
      const itemDate = item.DATE ? new Date(item.DATE) : null;
      if (!itemDate) return false;

      return itemDate >= startDate && itemDate <= endDate;
    });

    // Sort by date
    filteredData.sort((a, b) => {
      const dateA = new Date(a.DATE);
      const dateB = new Date(b.DATE);
      return dateA - dateB;
    });

    // Calculate opening balance
    let openingBalance = 0;
    
    // Calculate opening balance by summing all transactions up to the day before fromDate
    // for all VR types for the given party (including OA, BR, SB, etc.)
    const dayBeforeFromDate = new Date(startDate);
    dayBeforeFromDate.setDate(dayBeforeFromDate.getDate() - 1);
    dayBeforeFromDate.setHours(23, 59, 59, 999);
    
    const openingEntries = cashData.filter(item => {
      if (item.C_CODE !== partyCode) return false;
      
      const itemDate = item.DATE ? new Date(item.DATE) : null;
      if (!itemDate) return false;
      
      // Include all transactions up to the day before fromDate
      return itemDate <= dayBeforeFromDate;
    });
    
    // Calculate opening balance as (sumCR - sumDR)
    openingEntries.forEach(entry => {
      const cr = parseFloat(entry.CR) || 0;
      const dr = parseFloat(entry.DR) || 0;
      openingBalance += (cr - dr);
    });

    // Process the filtered data and calculate running balance
    let runningBalance = openingBalance;
    const processedData = [];

    // Add opening balance row if there are transactions
    if (filteredData.length > 0 || openingBalance !== 0) {
      processedData.push({
        date: 'Opening Balance',
        narration: 'Opening Balance',
        book: '',
        cr: openingBalance > 0 ? Math.abs(openingBalance) : 0,
        dr: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        balance: Math.abs(openingBalance),
        balanceType: openingBalance >= 0 ? 'CR' : 'DR'
      });
    }

    // Process each transaction
    filteredData.forEach(item => {
      const cr = parseFloat(item.CR) || 0;
      const dr = parseFloat(item.DR) || 0;
      const transactionAmount = cr - dr;
      runningBalance += transactionAmount;

      processedData.push({
        date: formatDateDDMMYYYY(new Date(item.DATE)),
        narration: item.REMARK || '',
        book: item.VR || '',
        cr: cr,
        dr: dr,
        balance: Math.abs(runningBalance),
        balanceType: runningBalance >= 0 ? 'CR' : 'DR'
      });
    });

    res.json({
      success: true,
      data: processedData,
      partyName: partyName,
      partyCode: partyCode,
      fromDate: fromDate,
      toDate: toDate
    });

  } catch (error) {
    console.error('Error generating party ledger report:', error);
    res.status(500).json({ message: 'Failed to generate party ledger report' });
  }
});

// GET /api/reports/balance-slip-batch
router.get('/balance-slip-batch', async (req, res) => {
  try {
    const { partyCodes } = req.query;

    if (!partyCodes) {
      return res.status(400).json({ message: 'partyCodes is required' });
    }

    const partyCodeArray = partyCodes.split(',').map(code => code.trim()).filter(Boolean);
    if (partyCodeArray.length === 0) {
      return res.status(400).json({ message: 'At least one partyCode is required' });
    }

    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');

    let billData = [];
    let cmplData = [];
    let cashData = [];

    try {
      const billFileContents = await fs.readFile(billPath, 'utf-8');
      billData = JSON.parse(billFileContents);
    } catch (error) {
      console.error('Error reading or parsing BILL.json:', error);
      return res.status(500).json({ message: 'Error loading bill data.' });
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading or parsing CMPL.json:', error);
      return res.status(500).json({ message: 'Error loading party data.' });
    }

    try {
      const cashFileContents = await fs.readFile(cashPath, 'utf-8');
      cashData = JSON.parse(cashFileContents);
    } catch (error) {
      console.error('Error reading or parsing CASH.json:', error);
      return res.status(500).json({ message: 'Error loading cash data.' });
    }

    const results = {};

    // Process each party code
    for (const partyCode of partyCodeArray) {
      // Get party name
      const party = cmplData.find(p => p.C_CODE === partyCode);
      const partyName = party ? party.C_NAME : 'Unknown Party';

      // Calculate max days for this party
      let maxDays = 0;
      const partyBills = billData.filter(bill => bill.C_CODE === partyCode);
      
      for (const bill of partyBills) {
        const billDate = new Date(bill.DATE);
        const currentDate = new Date();
        const timeDiff = currentDate.getTime() - billDate.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        if (daysDiff > maxDays) {
          maxDays = daysDiff;
        }
      }

      results[partyCode] = {
        partyName,
        maxDays
      };
    }

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Error generating batch balance slip:', error);
    res.status(500).json({ message: 'Failed to generate batch balance slip' });
  }
});

// GET /api/reports/balance-slip
router.get('/balance-slip', async (req, res) => {
  try {
    const { partyCode } = req.query;

    if (!partyCode) {
      return res.status(400).json({ message: 'partyCode is required' });
    }

    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');

    let billData = [];
    let cmplData = [];
    let cashData = [];

    try {
      const billFileContents = await fs.readFile(billPath, 'utf-8');
      billData = JSON.parse(billFileContents);
    } catch (error) {
      console.error('Error reading or parsing BILL.json:', error);
      return res.status(500).json({ message: 'Error loading bill data.' });
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading or parsing CMPL.json:', error);
      return res.status(500).json({ message: 'Error loading party data.' });
    }

    try {
      const cashFileContents = await fs.readFile(cashPath, 'utf-8');
      cashData = JSON.parse(cashFileContents);
    } catch (error) {
      console.error('Error reading or parsing CASH.json:', error);
      return res.status(500).json({ message: 'Error loading cash data.' });
    }

    // Get party name
    const party = cmplData.find(p => p.C_CODE === partyCode);
    const partyName = party ? party.C_NAME : 'Unknown Party';

    // Step 1: Calculate the final balance of the party
    const partyCashEntries = cashData.filter(item => item.C_CODE === partyCode);
    
    let finalBalance = 0;
    partyCashEntries.forEach(entry => {
      const cr = parseFloat(entry.CR) || 0;
      const dr = parseFloat(entry.DR) || 0;
      finalBalance += (cr - dr);
    });

    // Filter bills for the selected party
    const partyBills = billData.filter(bill => bill.C_CODE === partyCode);
    console.log(`Found ${partyBills.length} bills for party ${partyCode}`);
    if (partyBills.length > 0) {
      console.log('Sample bill:', partyBills[0]);
    }

    // Get all payments for this party from cash data
    const partyPayments = cashData.filter(cash => 
      cash.C_CODE === partyCode && 
      (cash.VR === 'BR' || cash.VR === 'CR') // Bank Receipt or Cash Receipt
    );
    console.log(`Found ${partyPayments.length} payments for party ${partyCode}`);

    // Prepare all bills for balance distribution
    const allBills = [];
    
    partyBills.forEach(bill => {
      const billKey = `${bill.SERIES}-${bill.BILL}`;
      const billAmount = parseFloat(bill.N_B_AMT) || 0;
      const billDate = bill.DATE ? new Date(bill.DATE) : null;
      
      allBills.push({
        billDate: formatDateDDMMYYYY(billDate),
        narration: bill.REMARK || `Bill ${billKey}`,
        billNo: billKey,
        billdr: billAmount, // Original bill amount
        days: billDate ? Math.floor((new Date() - billDate) / (1000 * 60 * 60 * 24)) : 0,
        originalDate: billDate
      });
    });

    // Step 2: Sort by date (newest first for bottom-to-top calculation)
    allBills.sort((a, b) => {
      if (!a.originalDate || !b.originalDate) return 0;
      return b.originalDate - a.originalDate; // Newest first
    });

    // Step 3: Distribute final balance across bills from bottom to top (newest to oldest)
    let remainingBalance = Math.abs(finalBalance); // Work with absolute value
    const processedBills = [];
    
    // Process bills from newest to oldest, distributing the final balance
    for (let i = 0; i < allBills.length; i++) {
      const bill = allBills[i];
      
      // Determine how much of this bill amount to allocate
      let billPendingAmount;
      if (remainingBalance >= bill.billdr) {
        // Full bill amount can be allocated
        billPendingAmount = bill.billdr;
        remainingBalance -= bill.billdr;
      } else {
        // Partial bill amount (remaining balance)
        billPendingAmount = remainingBalance;
        remainingBalance = 0;
      }
      
      // Only include bills with pending amount > 0
      if (billPendingAmount > 0.01) {
        // Calculate running balance after this bill
        const runningBalance = remainingBalance;
        
        processedBills.push({
          billDate: bill.billDate,
          narration: bill.narration,
          billNo: bill.billNo,
          dr: billPendingAmount, // Amount allocated to this bill
          billdr: bill.billdr, // Original bill amount
          days: bill.days,
          balance: runningBalance,
          balanceType: finalBalance >= 0 ? 'CR' : 'DR'
        });
      }
      
      // Stop if we've distributed all the balance
      if (remainingBalance <= 0.01) break;
    }

    // Reverse to show oldest bills first in the UI
    processedBills.reverse();

    console.log(`Final response: ${processedBills.length} processed bills`);
    console.log('Processed bills:', processedBills);
    console.log('Final balance:', finalBalance);
    console.log('Total pending amount:', processedBills.reduce((sum, bill) => sum + bill.dr, 0));

    res.json({
      success: true,
      data: processedBills,
      partyName: partyName,
      partyCode: partyCode,
      finalBalance: finalBalance,
      totalPendingAmount: processedBills.reduce((sum, bill) => sum + bill.dr, 0)
    });

  } catch (error) {
    console.error('Error generating balance slip:', error);
    res.status(500).json({ message: 'Failed to generate balance slip' });
  }
});

module.exports = router;