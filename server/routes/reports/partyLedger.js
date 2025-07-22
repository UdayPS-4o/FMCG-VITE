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

module.exports = router;