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

// Enhanced function to parse various date formats from CASH.json
const parseItemDate = (dateValue) => {
  if (!dateValue) return null;
  
  // If it's already a Date object
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  // If it's a string, try different parsing methods
  if (typeof dateValue === 'string') {
    // Try ISO format first (YYYY-MM-DD or full ISO string)
    let date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try DD-MM-YYYY format
    const ddmmyyyy = dateValue.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Try YYYY-MM-DD format
    const yyyymmdd = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (yyyymmdd) {
      const [, year, month, day] = yyyymmdd;
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  // Try parsing as timestamp if it's a number
  if (typeof dateValue === 'number') {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
};

// Helper function to format a Date object to DD-MM-YYYY string
const formatDateDDMMYYYY = (dateObj) => {
  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'N/A';
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const year = dateObj.getFullYear();
  
  // Additional validation to prevent NaN values
  if (isNaN(day) || isNaN(month) || isNaN(year)) return 'N/A';
  
  return `${day}-${month}-${year}`;
};

// GET /api/reports/cash-book
router.get('/cash-book', async (req, res) => {
  try {
    let { fromDate, toDate, salesmen, openingBalance, series } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'fromDate and toDate are required' });
    }
    
    // Parse salesmen (BR_CODE) as array
    if (salesmen) {
      salesmen = salesmen.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Parse series as array
    if (series) {
      series = series.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Parse opening balance as number
    openingBalance = openingBalance ? parseFloat(openingBalance) : 0;
    


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
        // Log the first 5 items for debugging
        console.log('First 5 cash data items from CASH.json:', cashData.slice(0, 5).map(i => i.DATE));

    } catch (error) {
      console.error('Error reading or parsing CASH.json:', error);
      return res.status(500).json({ message: 'Error loading cash data.' });
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading or parsing CMPL.json:', error);
      // Continue without party data if CMPL.json is not available
    }
    
    // Filtering logic
    let filteredData = cashData.filter(item => {
      // Validate date using enhanced parsing
      const itemDate = parseItemDate(item.DATE);
      if (!itemDate) return false;

      const isDateInRange = itemDate >= startDate && itemDate <= endDate;
      let isSalesmanMatch = true;
      
      if (salesmen && Array.isArray(salesmen) && salesmen.length > 0) {
        isSalesmanMatch = salesmen.includes(item.BR_CODE);
      }

      // Filter by series - exclude blank series and match selected series
      let isSeriesMatch = true;
      if (series && Array.isArray(series) && series.length > 0) {
        // Only include items that have a non-blank SERIES and match the selected series
        isSeriesMatch = item.SERIES && item.SERIES.trim() !== '' && series.includes(item.SERIES.trim());
      } else {
        // If no series filter is applied, exclude items with blank series
        isSeriesMatch = item.SERIES && item.SERIES.trim() !== '';
      }

      // Filter by VR numbers - only show CR, CP transactions (exclude SB)
      const vrFilter = item.VR && (item.VR.includes('CR') || item.VR.includes('CP'));

      return isDateInRange && isSalesmanMatch && isSeriesMatch && vrFilter && !item._deleted;
     });

    // Sort by date
    filteredData.sort((a, b) => {
      const dateA = parseItemDate(a.DATE);
      const dateB = parseItemDate(b.DATE);
      if (!dateA || !dateB) return 0;
      return dateA - dateB;
    });

    // Create a map for quick party lookup
    const partyMap = new Map();
    cmplData.forEach(party => {
      if (party.C_CODE && party.C_NAME) {
        partyMap.set(party.C_CODE, party.C_NAME);
      }
    });

    // Format the data for the report
    const report = filteredData.map(item => {
      const transactionDate = parseItemDate(item.DATE);
      
      // Format date using enhanced parsing
      const formattedDate = transactionDate ? formatDateDDMMYYYY(transactionDate) : 'N/A';
      
      return {
        date: formattedDate,
        narration: item.REMARK || '',
        credit: parseFloat(item.CR) || 0,
        debit: parseFloat(item.DR) || 0,
        vr: item.VR || '',
        br_code: item.BR_CODE || '',
        party_name: item.AC_NAME || '',
        c_code: item.C_CODE || ''
      };
    });

    // Calculate running balance
    let balance = openingBalance;
    const reportWithBalance = [
      // Add opening balance as first row
      {
        date: formatDateDDMMYYYY(startDate),
        narration: 'Opening Balance',
        credit: 0,
        debit: 0,
        balance: openingBalance,
        isOpeningBalance: true
      }
    ];

    // Add transactions with running balance
    report.forEach(item => {
      balance = balance + item.credit - item.debit;
      reportWithBalance.push({
        ...item,
        balance: parseFloat(balance.toFixed(2))
      });
    });

    res.json(reportWithBalance);
  } catch (error) {
    console.error('Error processing cash book report:', error);
    res.status(500).json({ message: 'Error generating report', error: error.message });
  }
});

// GET /api/reports/salesmen
router.get('/salesmen', async (req, res) => {
  try {
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');

    let cashData = [];

    try {
      const cashFileContents = await fs.readFile(cashPath, 'utf-8');
      cashData = JSON.parse(cashFileContents);
    } catch (error) {
      console.error('Error reading or parsing CASH.json:', error);
      return res.status(500).json({ message: 'Error loading cash data.' });
    }
    
    // Extract unique BR_CODE values
    const salesmenSet = new Set();
    cashData.forEach(item => {
      if (item.BR_CODE && !item._deleted) {
        salesmenSet.add(item.BR_CODE);
      }
    });

    // Format for frontend
    const salesmenOptions = Array.from(salesmenSet).map(code => ({
      value: code,
      text: code // You might want to fetch actual names if available
    }));

    res.json(salesmenOptions);
  } catch (error) {
    console.error('Error fetching salesmen options:', error);
    res.status(500).json({ message: 'Error fetching salesmen options', error: error.message });
  }
});

module.exports = router;