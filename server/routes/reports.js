const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getDbfData } = require('./utilities'); // Assuming utilities are in the same directory or adjust path

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

// Helper function to convert DBF date (YYYYMMDD) to Date object - THIS IS NO LONGER USED FOR BILLDTL.json DATE
// const dbfDateToDate = (dbfDate) => {
//   if (!dbfDate || dbfDate.length !== 8) return null;
//   const year = parseInt(dbfDate.substring(0, 4), 10);
//   const month = parseInt(dbfDate.substring(4, 6), 10) - 1; // JS months are 0-indexed
//   const day = parseInt(dbfDate.substring(6, 8), 10);
//   return new Date(year, month, day);
// };


// GET /api/reports/item-wise-sales
router.get('/item-wise-sales', async (req, res) => {
  try {
    const { fromDate, toDate, itemCodes, partyCode, series } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'fromDate and toDate are required' });
    }

    const startDate = parseDate(fromDate);
    const endDate = parseDate(toDate);
    endDate.setHours(23, 59, 59, 999); // Include the entire end date

    const billdtlPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'CMPL.json'); // Changed from ACMAST.json

    let billdtlData = [];
    let cmplData = []; // Changed from acmastData

    try {
      const billdtlFileContents = await fs.readFile(billdtlPath, 'utf-8');
      billdtlData = JSON.parse(billdtlFileContents);
    } catch (error) {
      console.error('Error reading or parsing BILLDTL.json:', error);
      return res.status(500).json({ message: 'Error loading sales data.' });
    }
    
    try {
        const cmplFileContents = await fs.readFile(cmplPath, 'utf-8'); // Read CMPL.json
        cmplData = JSON.parse(cmplFileContents); // Parse CMPL.json
    } catch (error) {
        console.error('Error reading or parsing CMPL.json:', error); // Updated error message
    }
    
    const partyDetailsMap = cmplData.reduce((acc, party) => { // Changed from partyNameMap
        acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE }; // Store name and place using C_CODE
        return acc;
    }, {});

    const filteredData = billdtlData.filter(item => {
      const itemDate = item.DATE ? new Date(item.DATE) : null;
      if (!itemDate) return false;

      const isDateInRange = itemDate >= startDate && itemDate <= endDate;
      let isItemMatch = true;
      let isPartyMatch = true;
      let isSeriesMatch = true;

      if (itemCodes && Array.isArray(itemCodes) && itemCodes.length > 0) {
        isItemMatch = itemCodes.includes(item.CODE);
      } else if (itemCodes && typeof itemCodes === 'string') {
        isItemMatch = item.CODE === itemCodes;
      }

      if (partyCode) {
        isPartyMatch = item.C_CODE === partyCode;
      }

      if (series) {
        isSeriesMatch = item.BILL_NO && item.BILL_NO.startsWith(series.toUpperCase());
      }

      return isDateInRange && isItemMatch && isPartyMatch && isSeriesMatch;
    });

    const report = filteredData.map(item => {
      const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
      const transactionDate = item.DATE ? new Date(item.DATE) : null;
      return {
          Date: formatDateDDMMYYYY(transactionDate),
          Series: item.SERIES,
          BillNo: item.BILL,
          Code: item.CODE,
          ItemName: item.PRODUCT || 'N/A',
          Party: partyInfo.name,
          Place: partyInfo.place,
          Unit: item.UNIT,
          Qty: parseFloat(item.QTY) || 0,
          Free: parseFloat(item.FREE) || 0,
          Gross: (parseFloat(item.QTY) || 0) * (parseFloat(item.RATE) || 0),
          Scheme: parseFloat(item.SCHEME) || 0,
          SchPct: parseFloat(item.DISCOUNT) || 0,
          CD: parseFloat(item.CASH_DIS) || 0,
          NetAmt: parseFloat(item.AMT10) || 0,
          GoodsAmt: parseFloat(item.BAS10) || 0,
          GSTAmt: parseFloat(item.GST10) || 0,
          FreeV: 0,
          originalRate: parseFloat(item.RATE) || 0,
          gstPercentage: parseFloat(item.GST) || 0
      };
    });
    
    const processedReport = report.map(row => {
        const grossAmount = row.Qty * row.originalRate;
        const schemeValue = row.Scheme + (grossAmount * row.SchPct / 100);
        const amountAfterScheme = grossAmount - schemeValue;
        const cdValue = amountAfterScheme * row.CD / 100;
        const netAmountFinal = amountAfterScheme - cdValue;
        
        let goodsAmount = netAmountFinal;
        let gstAmount = 0;
        if (row.gstPercentage > 0) {
            goodsAmount = parseFloat((netAmountFinal / (1 + (row.gstPercentage / 100))).toFixed(2));
            gstAmount = parseFloat((netAmountFinal - goodsAmount).toFixed(2));
        } else {
            goodsAmount = netAmountFinal;
            gstAmount = 0;
        }

        return {
            Date: row.Date,
            Series: row.Series,
            BillNo: row.BillNo,
            Code: row.Code,
            ItemName: row.ItemName,
            Party: row.Party,
            Place: row.Place,
            Unit: row.Unit,
            Qty: row.Qty,
            Free: row.Free,
            Gross: parseFloat(grossAmount.toFixed(2)),
            Scheme: parseFloat(row.Scheme.toFixed(2)),
            SchPct: parseFloat(row.SchPct.toFixed(2)),
            CD: parseFloat(row.CD.toFixed(2)),
            NetAmt: parseFloat(netAmountFinal.toFixed(2)),
            GoodsAmt: goodsAmount,
            GSTAmt: gstAmount,
            FreeV: row.FreeV,
        };
    });

    res.json(processedReport);
  } catch (error) {
    console.error('Error processing item-wise sales report:', error);
    res.status(500).json({ message: 'Error generating report', error: error.message });
  }
});

// GET /api/reports/company-wise-sales
router.get('/company-wise-sales', async (req, res) => {
  try {
    const { fromDate, toDate, partyCode, itemCode } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'From Date and To Date are required.' });
    }
    // if (!partyCode) {
    //   return res.status(400).json({ message: 'Party Code is required.' });
    // }

    const startDate = parseDate(fromDate);
    const endDate = parseDate(toDate);
    endDate.setHours(23, 59, 59, 999); // Include the whole end day

    const billdtlPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'CMPL.json'); // Changed from ACMAST.json

    let billdtlData = [];
    let cmplData = []; // Changed from acmastData

    try {
      const billdtlFileContents = await fs.readFile(billdtlPath, 'utf-8');
      billdtlData = JSON.parse(billdtlFileContents);
    } catch (error) {
      console.error('Error reading or parsing BILLDTL.json:', error);
      return res.status(500).json({ message: 'Error loading sales data.' });
    }
    
    try {
        const cmplFileContents = await fs.readFile(cmplPath, 'utf-8'); // Read CMPL.json
        cmplData = JSON.parse(cmplFileContents); // Parse CMPL.json
    } catch (error) {
        console.error('Error reading or parsing CMPL.json:', error); // Updated error message
    }
    
    const partyDetailsMap = cmplData.reduce((acc, party) => { // Changed from partyNameMap
        acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE }; // Store name and place using C_CODE
        return acc;
    }, {});

    const filteredData = billdtlData.filter(item => {
      // const itemDate = dbfDateToDate(item.DATE); // OLD LOGIC
      const itemDate = item.DATE ? new Date(item.DATE) : null; // CORRECTED: Parse ISO string from BILLDTL.json
      if (!itemDate) return false;

      const isDateInRange = itemDate >= startDate && itemDate <= endDate;
      const isPartyMatch = partyCode ? item.C_CODE === partyCode : true; // Use C_CODE from BILLDTL for party matching
      const isItemMatch = itemCode ? item.CODE === itemCode : true;
      
      // const isSalesTransaction = item.VOUCHER_TYPE === 'SL';
      const isSalesTransaction = true; // Placeholder, adjust as needed
      
      return isDateInRange && isPartyMatch && isItemMatch && isSalesTransaction;
    });

    const report = filteredData.map(item => {
      const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
      const transactionDate = item.DATE ? new Date(item.DATE) : null;
      return {
        Date: formatDateDDMMYYYY(transactionDate), // Added formatted Date
        Code: item.CODE,
        ItemName: item.PRODUCT || 'N/A', // Added Item Name
        Party: partyInfo.name,
        Place: partyInfo.place,
        Unit: item.UNIT,
        Qty: parseFloat(item.QTY) || 0,
        Free: parseFloat(item.FREE) || 0,
        Gross: (parseFloat(item.QTY) || 0) * (parseFloat(item.RATE) || 0),
        Scheme: parseFloat(item.SCHEME) || 0,
        SchPct: parseFloat(item.DISCOUNT) || 0, // Sch(%)
        CD: parseFloat(item.CASH_DIS) || 0,   // CD%
        NetAmt: parseFloat(item.AMT10) || 0,
        GoodsAmt: parseFloat(item.BAS10) || 0,
        GSTAmt: parseFloat(item.GST10) || 0,
        FreeV: 0,
        originalRate: parseFloat(item.RATE) || 0,
        gstPercentage: parseFloat(item.GST) || 0
      };
    });
      
    const processedReport = report.map(row => {
        const grossAmount = row.Qty * row.originalRate;
        const schemeValue = row.Scheme + (grossAmount * row.SchPct / 100);
        const amountAfterScheme = grossAmount - schemeValue;
        const cdValue = amountAfterScheme * row.CD / 100;
        const netAmountFinal = amountAfterScheme - cdValue;
        
        let goodsAmount = netAmountFinal;
        let gstAmount = 0;
        if (row.gstPercentage > 0) {
            goodsAmount = parseFloat((netAmountFinal / (1 + (row.gstPercentage / 100))).toFixed(2));
            gstAmount = parseFloat((netAmountFinal - goodsAmount).toFixed(2));
        } else {
            goodsAmount = netAmountFinal;
            gstAmount = 0;
        }

        return {
            Date: row.Date, // Carry through Date
            Code: row.Code,
            ItemName: row.ItemName, // Ensure ItemName is carried through
            Party: row.Party,
            Place: row.Place,
            Unit: row.Unit,
            Qty: row.Qty,
            Free: row.Free,
            Gross: parseFloat(grossAmount.toFixed(2)),
            Scheme: parseFloat(row.Scheme.toFixed(2)),
            SchPct: parseFloat(row.SchPct.toFixed(2)),
            CD: parseFloat(row.CD.toFixed(2)),
            NetAmt: parseFloat(netAmountFinal.toFixed(2)),
            GoodsAmt: goodsAmount,
            GSTAmt: gstAmount,
            FreeV: row.FreeV,
        };
    });

    res.json(processedReport);
  } catch (error) {
    console.error('Error fetching company wise sales report:', error);
    res.status(500).json({ message: 'Error generating report.', error: error.message });
  }
});

// Endpoint to get distinct item and party options based on date range
router.get('/filter-options', async (req, res) => {
    const { fromDate, toDate, partyCode } = req.query;

    if (!fromDate || !toDate) {
        return res.status(400).json({ message: 'fromDate and toDate are required for fetching filter options' });
    }

    try {
        const billDtlPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'BILLDTL.json');
        const cmplPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'CMPL.json');

        const billDtlData = JSON.parse(await fs.readFile(billDtlPath, 'utf-8'));
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf-8'));

        const partyMap = new Map(cmplData.map(cmp => [cmp.C_CODE, cmp.C_NAME]));

        const startDate = parseDate(fromDate);
        const endDate = parseDate(toDate);
        endDate.setHours(23, 59, 59, 999);

        const relevantBillDtls = billDtlData.filter(item => {
            const itemDate = new Date(item.DATE);
            let partyMatch = true;
            if (partyCode) {
                partyMatch = item.C_CODE === partyCode;
            }
            return itemDate >= startDate && itemDate <= endDate && partyMatch;
        });

        const distinctItems = new Map();
        const distinctPartyCodes = new Set();

        relevantBillDtls.forEach(item => {
            if (item.CODE && item.PRODUCT) {
                if (!distinctItems.has(item.CODE)) {
                    distinctItems.set(item.CODE, item.PRODUCT);
                }
            }
            if (item.C_CODE) {
                distinctPartyCodes.add(item.C_CODE);
            }
        });

        const itemOptions = Array.from(distinctItems.entries()).map(([code, name]) => ({
            value: code,
            text: `${name} (${code})` // Format for MultiSelect
        }));

        const partyOptions = Array.from(distinctPartyCodes).map(code => ({
            value: code,
            label: `${partyMap.get(code) || code} (${code})` // Format for Autocomplete
        }));
        
        // Sort options alphabetically by label/text
        itemOptions.sort((a, b) => a.text.localeCompare(b.text));
        partyOptions.sort((a, b) => a.label.localeCompare(b.label));

        res.json({ itemOptions, partyOptions });

    } catch (error) {
        console.error('Error fetching dynamic filter options:', error);
        res.status(500).json({ message: 'Error fetching filter options', error: error.message });
    }
});

module.exports = router; 