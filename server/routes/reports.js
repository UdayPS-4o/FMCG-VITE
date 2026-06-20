const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const axios = require('axios');
const { getDbfData } = require('./utilities'); // Assuming utilities are in the same directory or adjust path
require('dotenv').config();

// Import Cash Book report routes
const cashBookRoutes = require('./reports/cashBook');
router.use(cashBookRoutes);

// Import Party Ledger report routes
const partyLedgerRoutes = require('./reports/partyLedger');
router.use(partyLedgerRoutes);

// Import Item Wise Stock Register report routes
const itemWiseStockRegisterRoutes = require('./reports/itemWiseStockRegister');
router.use(itemWiseStockRegisterRoutes);

// Import PNB Statement routes
const pnbStatementRoutes = require('./reports/pnbStatement');
router.use(pnbStatementRoutes);

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

// GET /api/companies - Fetches company list
router.get('/companies', async (req, res) => {
  try {
    // Adjusted path to COMPANY.json, assuming it's in the same 'json' directory
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const companyFilePath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'COMPANY.json');
    const data = await fs.readFile(companyFilePath, 'utf8');
    const companies = JSON.parse(data);
    
    // The frontend expects { value: string, text: string }
    // Assuming COMPANY.json has C_CODE and C_NAME (or similar)
    const formattedCompanies = companies.map(company => ({
      value: company.C_CODE, // Adjust if your company code field is named differently
      text: company.C_NAME   // Adjust if your company name field is named differently
    }));
    res.json(formattedCompanies);

  } catch (error) {
    console.error('Error fetching company data:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ message: 'COMPANY.json file not found. Please check path: ' + error.path });
    } else if (error instanceof SyntaxError) {
      res.status(500).json({ message: 'Error parsing COMPANY.json data.' });
    } else {
      res.status(500).json({ message: 'Failed to fetch company data' });
    }
  }
});

// GET /api/reports/item-wise-sales
router.get('/item-wise-sales', async (req, res) => {
  try {
    let { fromDate, toDate, itemCodes, partyCode, series, billNumbers, unit, companyCodes, seriesBillFilters } = req.query;

    if (itemCodes) {
        itemCodes = itemCodes.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (billNumbers) {
        billNumbers = billNumbers.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // If companyCodes is not provided, it will be undefined.
    // If it is provided, ensure it's a clean array of non-empty strings.
    if (companyCodes) {
        companyCodes = companyCodes.split(',').map(s => s.trim()).filter(Boolean);
        if (companyCodes.length === 0) {
            companyCodes = undefined; // Treat empty array as no filter
        }
    }

    console.log('[ITEM-WISE-SALES] Processed companyCodes:', companyCodes);

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'fromDate and toDate are required' });
    }

    const startDate = parseDate(fromDate);
    const endDate = parseDate(toDate);
    endDate.setHours(23, 59, 59, 999); // Include the entire end date

    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json'); 
    const companyPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'COMPANY.json');

    let billdtlData = [];
    let cmplData = []; // Changed from acmastData
    let companyData = []; // Changed from acmastData

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
    
    try {
        const companyFileContents = await fs.readFile(companyPath, 'utf-8');// Read COMPANY.json
        companyData = JSON.parse(companyFileContents);// Parse COMPANY.json
    } catch (error) {
        console.error('Error reading or parsing COMPANY.json:', error); // Updated error message
    }
    
    const partyDetailsMap = cmplData.reduce((acc, party) => { // Changed from partyNameMap
        acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE }; // Store name and place using C_CODE
        return acc;
    }, {});

    const companyDetailsMap = companyData.reduce((acc, company) => { // Changed from partyNameMap
        acc[company.C_CODE] = { name: company.C_NAME, place: company.C_PLACE }; // Store name and place using C_CODE
        return acc;
    }, {});
      
    // Filtering logic
    let filteredData = billdtlData.filter(item => {
      const itemDate = item.DATE ? new Date(item.DATE) : null;
      if (!itemDate) return false;

      const isDateInRange = itemDate >= startDate && itemDate <= endDate;
      let isItemMatch = true;
      let isPartyMatch = true;
      let isCompanyMatch = true;
      let isSeriesMatch = true;
      let isBillNumberMatch = true;
      let isUnitMatch = true;
      
      if (itemCodes && Array.isArray(itemCodes) && itemCodes.length > 0) {
        isItemMatch = itemCodes.includes(item.CODE);
      } else if (itemCodes && typeof itemCodes === 'string') {
        isItemMatch = item.CODE === itemCodes;
      }

      if (partyCode) {
        isPartyMatch = item.C_CODE === partyCode;
      }

      if (companyCodes && Array.isArray(companyCodes) && companyCodes.length > 0) {
        console.log('[DEBUG] companyCodes being used for filtering:', companyCodes);
        if (item.CODE && item.CODE.length >= 2) {
          const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
          console.log(`[DEBUG] Item CODE: ${item.CODE}, Extracted itemCompanyCode: ${itemCompanyCode}`);
          isCompanyMatch = companyCodes.includes(itemCompanyCode);
          console.log(`[DEBUG] companyCodes: "${String(companyCodes)}" includes "${itemCompanyCode}"? ${isCompanyMatch}`);
        } else {
          console.log(`[DEBUG] Item CODE: ${item.CODE} is too short or undefined for company matching.`);
          isCompanyMatch = false;
        }
      } else {
        // If no company codes are selected, this log can be helpful too, or can be removed if too noisy
        // console.log('[DEBUG] No companyCodes provided, so isCompanyMatch remains true by default.');
      }

      if (series) {
        isSeriesMatch = item.SERIES === series.toUpperCase();
        if (billNumbers && Array.isArray(billNumbers) && billNumbers.length > 0) {
          const billNumbersStr = billNumbers.map(bn => String(bn));
          isBillNumberMatch = billNumbersStr.includes(String(item.BILL));
        } else if (billNumbers && typeof billNumbers === 'string' && billNumbers.trim() !== '') {
          isBillNumberMatch = String(item.BILL) === billNumbers.trim();
        }
      }

      if (unit && unit !== 'All') {
        isUnitMatch = item.UNIT && item.UNIT.toLowerCase() === unit.toLowerCase();
      }

      return isDateInRange && isItemMatch && isPartyMatch && isCompanyMatch && isSeriesMatch && isBillNumberMatch && isUnitMatch;
    });

    // New filtering for series and bill numbers
    if (seriesBillFilters) {
      try {
          const filters = JSON.parse(seriesBillFilters);
          if (Array.isArray(filters) && filters.length > 0) {
              filteredData = filteredData.filter(item => {
                  return filters.some(filter => {
                      // Check if series matches
                      if (item.SERIES !== filter.series) {
                          return false;
                      }
                      // If there are bill numbers for this series, check if the item's bill number is in the list
                      if (filter.billNumbers) {
                          const billNumberSet = new Set(filter.billNumbers.split(',').map(bn => bn.trim()));
                          return billNumberSet.has(String(item.BILL));
                      }
                      // If no bill numbers are specified for this series, it's a match for the series
                      return true;
                  });
              });
          }
      } catch (e) {
          console.error("Error parsing seriesBillFilters:", e);
          // Optionally, handle the error, e.g., by sending a 400 response
      }
    } else if (series) { // Fallback to old logic if new filter is not present
      const seriesList = series.split(',').map(s => s.trim());
      filteredData = filteredData.filter(item => seriesList.includes(item.SERIES));
      if (billNumbers && seriesList.length === 1) { // This logic for single series bill numbers is kept for compatibility
        const billNumberSet = new Set(billNumbers.split(',').map(bn => bn.trim()));
        filteredData = filteredData.filter(item => billNumberSet.has(String(item.BILL)));
      }
    }

    const report = filteredData.map(item => {
      const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
      const transactionDate = item.DATE ? new Date(item.DATE) : null;
      
      let itemCompanyInfo = { name: 'N/A', place: '' };
      if (item.CODE && item.CODE.length >= 2) {
        const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
        itemCompanyInfo = companyDetailsMap[itemCompanyCode] || { name: itemCompanyCode, place: '' };
      }

      return {
          Date: formatDateDDMMYYYY(transactionDate),
          Company: itemCompanyInfo.name,
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
            Company: row.Company,
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
router.get('/reports/company-wise-sales', async (req, res) => {
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

    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;    
    const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json'); // Changed from ACMAST.json

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
    let { fromDate, toDate, partyCode, companyCodes } = req.query;

    // If companyCodes is not provided, it will be undefined.
    // If it is provided, ensure it's a clean array of non-empty strings.
    if (companyCodes) {
        companyCodes = companyCodes.split(',').map(c => c.trim()).filter(Boolean);
        if (companyCodes.length === 0) {
            companyCodes = undefined; // Treat empty array as no filter
        }
    }

    console.log('[FILTER-OPTIONS] Processed companyCodes:', companyCodes);

    if (!fromDate || !toDate) {
        return res.status(400).json({ message: 'fromDate and toDate are required for fetching filter options' });
    }

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');

        const billDtlData = JSON.parse(await fs.readFile(billDtlPath, 'utf-8'));
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf-8'));

        const partyMap = new Map(cmplData.map(cmp => [cmp.C_CODE, cmp.C_NAME]));

        const startDate = parseDate(fromDate);
        const endDate = parseDate(toDate);
        endDate.setHours(23, 59, 59, 999);

        const relevantBillDtls = billDtlData.filter(item => {
            const itemDate = new Date(item.DATE);
            if (!(itemDate >= startDate && itemDate <= endDate)) {
                return false;
            }

            // ---- START COMPANY FILTER DEBUGGING for /filter-options ----
            if (companyCodes && Array.isArray(companyCodes) && companyCodes.length > 0) {
                console.log('[FILTER-OPTIONS-DEBUG] companyCodes being used for filtering:', companyCodes);
                if (item.CODE && item.CODE.length >= 2) {
                    const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
                    console.log(`[FILTER-OPTIONS-DEBUG] Item CODE: ${item.CODE}, Extracted itemCompanyCode: ${itemCompanyCode}`);
                    if (!companyCodes.includes(itemCompanyCode)) {
                        console.log(`[FILTER-OPTIONS-DEBUG] companyCodes: "${String(companyCodes)}" does NOT include "${itemCompanyCode}". Excluding item.`);
                        return false; // Does not belong to selected companies
                    }
                    console.log(`[FILTER-OPTIONS-DEBUG] companyCodes: "${String(companyCodes)}" includes "${itemCompanyCode}". Keeping item for now.`);
                } else {
                    console.log(`[FILTER-OPTIONS-DEBUG] Item CODE: ${item.CODE} is too short or undefined. Excluding item.`);
                    return false; // Item code invalid for company filtering
                }
            }
            // ---- END COMPANY FILTER DEBUGGING for /filter-options ----

            // Apply party filter if partyCode is provided
            if (partyCode) {
                if (item.C_CODE !== partyCode) {
                    return false;
                }
            }
            return true;
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

// GET /api/reports/item-wise-purchase
router.get('/item-wise-purchase', async (req, res) => {
    try {
        let { fromDate, toDate, itemCodes, partyCode, companyCodes, series, billNumbers, unit, seriesBillFilters } = req.query;

        if (itemCodes) {
            const codes = Array.isArray(itemCodes) ? itemCodes : String(itemCodes).split(',');
            itemCodes = codes.map(s => s.trim()).filter(Boolean);
        }
        if (billNumbers) {
            const bills = Array.isArray(billNumbers) ? billNumbers : String(billNumbers).split(',');
            billNumbers = bills.map(s => s.trim()).filter(Boolean);
        }
        if (companyCodes) {
            const codes = Array.isArray(companyCodes) ? companyCodes : String(companyCodes).split(',');
            companyCodes = codes.map(s => s.trim()).filter(Boolean);
            if (companyCodes.length === 0) {
                companyCodes = undefined;
            }
            console.log('[ITEM-WISE-PURCHASE] Processed companyCodes:', companyCodes);
        }

        if (series) {
            const sList = Array.isArray(series) ? series : String(series).split(',');
            series = sList.map(s => s.trim()).filter(Boolean);
        }
        
        if (!fromDate || !toDate) {
            return res.status(400).json({ message: 'fromDate and toDate are required' });
        }

        const startDate = parseDate(fromDate);
        const endDate = parseDate(toDate);
        endDate.setHours(23, 59, 59, 999);

        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        const purdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'PURDTL.json');
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        const companyPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'COMPANY.json');

        let purdtlData = [];
        let cmplData = [];
        let companyData = [];

        try {
            const purdtlFileContents = await fs.readFile(purdtlPath, 'utf-8');
            purdtlData = JSON.parse(purdtlFileContents);
        } catch (error) {
            console.error('Error reading or parsing PURDTL.json:', error);
            return res.status(500).json({ message: 'Error loading purchase data.' });
        }

        try {
            const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
            cmplData = JSON.parse(cmplFileContents);
        } catch (error) {
            console.error('Error reading or parsing CMPL.json:', error);
        }

        try {
            const companyFileContents = await fs.readFile(companyPath, 'utf-8');
            companyData = JSON.parse(companyFileContents);
        } catch (error) {
            console.error('Error reading or parsing COMPANY.json:', error);
        }

        const partyDetailsMap = cmplData.reduce((acc, party) => {
            acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
            return acc;
        }, {});

        const companyDetailsMap = companyData.reduce((acc, company) => {
            acc[company.C_CODE] = { name: company.C_NAME, place: company.C_PLACE };
            return acc;
        }, {});

        let parsedSeriesFilters = null;
        if (seriesBillFilters) {
            try {
                parsedSeriesFilters = JSON.parse(seriesBillFilters);
            } catch (e) {
                console.error("Error parsing seriesBillFilters for purchase report:", e);
            }
        }

        const itemCodeSet = itemCodes ? new Set(itemCodes) : null;

        const filteredData = purdtlData.filter(item => {
            const itemDate = new Date(item.DATE);
            if (itemDate < startDate || itemDate > endDate) {
                return false;
            }

            if (companyCodes && Array.isArray(companyCodes) && companyCodes.length > 0) {
                if (item.CODE && item.CODE.length >= 2) {
                    const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
                    if (!companyCodes.includes(itemCompanyCode)) {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            if (parsedSeriesFilters && Array.isArray(parsedSeriesFilters) && parsedSeriesFilters.length > 0) {
                const matchesSeries = parsedSeriesFilters.some(filter => {
                    if (item.SERIES !== filter.series) return false;
                    if (filter.billNumbers) {
                        const billNumberSet = new Set(filter.billNumbers.split(',').map(bn => bn.trim()));
                        return billNumberSet.has(String(item.PBILL));
                    }
                    return true;
                });
                if (!matchesSeries) return false;
            } else if (series) {
                const seriesList = series;
                if (!seriesList.includes(item.SERIES)) return false;
                if (billNumbers && seriesList.length === 1) {
                    const billNumberSet = new Set(billNumbers);
                    if (!billNumberSet.has(String(item.PBILL))) return false;
                }
            }

            if (partyCode) {
                // Check both PCODE and C_CODE fields for party code matching
                if (item.PCODE !== partyCode && item.C_CODE !== partyCode) {
                    return false;
                }
            }

            if (itemCodeSet) {
                if (!itemCodeSet.has(item.CODE)) return false;
            }

            if (unit === 'Box' || unit === 'Pcs') {
                const lowerCaseUnit = unit.toLowerCase();
                if (!item.UNIT || item.UNIT.toLowerCase() !== lowerCaseUnit) return false;
            }
            
            return true;
        });

        const report = filteredData.map(item => {
            const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
            const transactionDate = item.DATE ? new Date(item.DATE) : null;

            let itemCompanyInfo = { name: 'N/A', place: '' };
            if (item.CODE && item.CODE.length >= 2) {
                const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
                itemCompanyInfo = companyDetailsMap[itemCompanyCode] || { name: itemCompanyCode, place: '' };
            }

            return {
                Date: formatDateDDMMYYYY(transactionDate),
                Company: itemCompanyInfo.name,
                Series: item.SERIES,
                BillNo: item.PBILL,
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
                NetAmt: 0, // Will be calculated
                GoodsAmt: 0, // Will be calculated
                GSTAmt: 0, // Will be calculated
                FreeV: 0,
                originalRate: parseFloat(item.RATE) || 0,
                gstPercentage: parseFloat(item.GST) || 0
            };
        });
        
        const processedReport = report.map(row => {
            const grossAmount = row.Gross; // Already Qty * Rate
            const schemeValue = row.Scheme + (grossAmount * row.SchPct / 100);
            const amountAfterScheme = grossAmount - schemeValue;
            const cdValue = amountAfterScheme * row.CD / 100;
            const netAmountFinal = amountAfterScheme - cdValue;
            
            let goodsAmount = netAmountFinal;
            let gstAmount = 0;
            if (row.gstPercentage > 0) {
                goodsAmount = parseFloat((netAmountFinal / (1 + (row.gstPercentage / 100))).toFixed(2));
                gstAmount = parseFloat((netAmountFinal - goodsAmount).toFixed(2));
            }

            return {
                ...row,
                Gross: parseFloat(grossAmount.toFixed(2)),
                Scheme: parseFloat(schemeValue.toFixed(2)),
                NetAmt: parseFloat(netAmountFinal.toFixed(2)),
                GoodsAmt: goodsAmount,
                GSTAmt: gstAmount
            };
        });

        res.json(processedReport);
    } catch (error) {
        console.error('Error processing item-wise purchase report:', error);
        res.status(500).json({ message: 'Error generating report', error: error.message });
    }
});

// GET /api/reports/purchase-filter-options
router.get('/purchase-filter-options', async (req, res) => {
    let { fromDate, toDate, partyCode, companyCodes } = req.query;

    if (companyCodes) {
        companyCodes = companyCodes.split(',').map(c => c.trim()).filter(Boolean);
        if (companyCodes.length === 0) {
            companyCodes = undefined;
        }
    }

    if (!fromDate || !toDate) {
        return res.status(400).json({ message: 'fromDate and toDate are required for fetching filter options' });
    }

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        const purdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'PURDTL.json');
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');

        const purdtlData = JSON.parse(await fs.readFile(purdtlPath, 'utf-8'));
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf-8'));

        const partyMap = new Map(cmplData.map(cmp => [cmp.C_CODE, cmp.C_NAME]));

        const startDate = parseDate(fromDate);
        const endDate = parseDate(toDate);
        endDate.setHours(23, 59, 59, 999);

        const relevantPurDtls = purdtlData.filter(item => {
            const itemDate = new Date(item.DATE);
            if (!(itemDate >= startDate && itemDate <= endDate)) {
                return false;
            }

            if (companyCodes && companyCodes.length > 0) {
                if (item.CODE && item.CODE.length >= 2) {
                    const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
                    if (!companyCodes.includes(itemCompanyCode)) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            if (partyCode) {
                if (item.C_CODE !== partyCode) {
                    return false;
                }
            }
            return true;
        });

        const distinctItems = new Map();
        const distinctPartyCodes = new Set();

        relevantPurDtls.forEach(item => {
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
            text: `${name} (${code})`
        }));

        const partyOptions = Array.from(distinctPartyCodes).map(code => ({
            value: code,
            label: `${partyMap.get(code) || code} (${code})`
        }));
        
        itemOptions.sort((a, b) => a.text.localeCompare(b.text));
        partyOptions.sort((a, b) => a.label.localeCompare(b.label));

        res.json({ itemOptions, partyOptions });

    } catch (error) {
        console.error('Error fetching dynamic purchase filter options:', error);
        res.status(500).json({ message: 'Error fetching filter options', error: error.message });
    }
});

// GET /api/reports/pnb-stock-statement - PNB Stock Statement Report
router.get('/pnb-stock-statement', async (req, res) => {
    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }

        const path = require('path');
        const fsPromises = require('fs').promises;

        // Accept period filter: month (1-12) and year (e.g. 2026)
        const { month, year } = req.query;
        const filterMonth = month ? parseInt(month, 10) : null;  // 1-based
        const filterYear  = year  ? parseInt(year,  10) : null;

        const billdtlPath  = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
        const purdtlPath   = path.join(DBF_FOLDER_PATH, 'data', 'json', 'purdtl.json');
        const transferPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'TRANSFER.json');
        const cmplPath     = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        const prodPath     = path.join(DBF_FOLDER_PATH, 'data', 'json', 'prod.json');

        const [billdtlData, purdtlData, transferData, cmplData, prodData] = await Promise.all([
            fsPromises.readFile(billdtlPath, 'utf8').then(d => JSON.parse(d)).catch(() => []),
            fsPromises.readFile(purdtlPath,  'utf8').then(d => JSON.parse(d)).catch(() => []),
            fsPromises.readFile(transferPath,'utf8').then(d => JSON.parse(d)).catch(() => []),
            fsPromises.readFile(cmplPath,    'utf8').then(d => JSON.parse(d)).catch(() => []),
            fsPromises.readFile(prodPath,    'utf8').then(d => JSON.parse(d)).catch(() => [])
        ]);

        // Build product name map from prod.json
        const prodNameMap = new Map();
        prodData.forEach(p => { if (p.CODE) prodNameMap.set(p.CODE, p.PRODUCT || p.NAME || p.CODE); });

        // Filter helper by period
        const inPeriod = (dateStr) => {
            if (!filterMonth || !filterYear) return true;
            if (!dateStr) return false;
            
            const d = new Date(dateStr);
            // Convert UTC DBF time to IST exactly
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset() + 330);
            return d.getFullYear() === filterYear && (d.getMonth() + 1) === filterMonth;
        };

        // --- Calculate current stock ---
        const itemStockMap = new Map();

        const ensureItem = (code, product, unit, rate = 0) => {
            if (!itemStockMap.has(code)) {
                itemStockMap.set(code, {
                    code, product: product || prodNameMap.get(code) || code, unit: unit || 'PCS',
                    sales: 0, purchases: 0, transferOut: 0, transferIn: 0, rate: 0
                });
            }
            const item = itemStockMap.get(code);
            if ((!item.product || item.product === code) && product) item.product = product;
            if (rate > 0) item.rate = rate; // capture latest non-zero rate
            return item;
        };

        billdtlData.forEach(row => {
            if (!row.CODE || !row.QTY || row._deleted) return;
            if (!inPeriod(row.DATE)) return;
            const qty = parseFloat(row.QTY) || 0;
            if (qty <= 0) return;
            const rate = parseFloat(row.RATE) || parseFloat(row.MRP) || 0;
            const item = ensureItem(row.CODE, row.PRODUCT, row.UNIT, rate);
            item.sales += qty;
        });

        purdtlData.forEach(row => {
            if (!row.CODE || !row.QTY || row._deleted) return;
            if (!inPeriod(row.DATE)) return;
            const qty = parseFloat(row.QTY) || 0;
            if (qty <= 0) return;
            const rate = parseFloat(row.RATE) || parseFloat(row.MRP) || 0;
            const item = ensureItem(row.CODE, row.PRODUCT, row.UNIT, rate);
            item.purchases += qty;
        });

        transferData.forEach(row => {
            if (!row.CODE || !row.QTY || row._deleted) return;
            if (!inPeriod(row.DATE)) return;
            const qty = parseFloat(row.QTY) || 0;
            if (qty <= 0) return;
            ensureItem(row.CODE, row.PRODUCT, row.UNIT);
        });

        const stockDataResult = [];
        for (const [code, data] of itemStockMap) {
            const closingStock = Math.round((data.purchases - data.sales) * 1000) / 1000;
            if (closingStock > 0) {
                stockDataResult.push({
                    code,
                    product: data.product,
                    currentStock: closingStock,
                    unit: data.unit || 'PCS',
                    purchases: data.purchases,
                    sales: data.sales,
                    rate: data.rate
                });
            }
        }

        // --- Read balance.json ---
        const balancePath = path.join(__dirname, '../db/balance.json');
        let balanceData = [];
        try {
            const bFile = await fsPromises.readFile(balancePath, 'utf8');
            balanceData = JSON.parse(bFile).data || [];
        } catch (e) {
            console.error('Could not load balance.json, falling back to CMPL.json CUR_BAL');
        }

        const cmplMap = new Map();
        cmplData.forEach(p => cmplMap.set(p.C_CODE, p));

        // --- Debtors from CMPL where M_GROUP = DT ---
        const debtorData = [];
        if (balanceData.length > 0) {
            balanceData.forEach(row => {
                const party = cmplMap.get(row.partycode);
                if (!party || party._deleted || party.M_GROUP !== 'DT') return;
                
                let amtStr = (row.result || '').toString().trim();
                let isDr = amtStr.endsWith('DR');
                let amt = parseFloat(amtStr.replace(/[^\d.]/g, '')) || 0;
                
                if (isDr && amt > 0) {
                    debtorData.push({
                        code:    party.C_CODE || '',
                        name:    party.C_NAME || '',
                        balance: amt,
                        gstin:   party.C_GST  || party.C_CST || ''
                    });
                }
            });
        } else {
            cmplData.forEach(party => {
                if (party._deleted) return;
                if (party.M_GROUP !== 'DT') return;
                const balance = parseFloat(party.CUR_BAL || 0);
                if (balance > 0) {
                    debtorData.push({
                        code:    party.C_CODE || '',
                        name:    party.C_NAME || '',
                        balance: balance,
                        gstin:   party.C_GST  || party.C_CST || ''
                    });
                }
            });
        }

        // --- Creditors from CMPL where M_GROUP = CT ---
        const creditorData = [];
        if (balanceData.length > 0) {
            balanceData.forEach(row => {
                const party = cmplMap.get(row.partycode);
                if (!party || party._deleted || party.M_GROUP !== 'CT') return;
                
                let amtStr = (row.result || '').toString().trim();
                let isCr = amtStr.endsWith('CR');
                let amt = parseFloat(amtStr.replace(/[^\d.]/g, '')) || 0;
                
                if (isCr && amt > 0) {
                    creditorData.push({
                        code:    party.C_CODE || '',
                        name:    party.C_NAME || '',
                        balance: amt,
                        gstin:   party.C_GST  || party.C_CST || ''
                    });
                }
            });
        } else {
            cmplData.forEach(party => {
                if (party._deleted) return;
                if (party.M_GROUP !== 'CT') return;
                const balance = parseFloat(party.CUR_BAL || 0);
                if (balance > 0) {
                    creditorData.push({
                        code:    party.C_CODE || '',
                        name:    party.C_NAME || '',
                        balance: balance,
                        gstin:   party.C_GST  || party.C_CST || ''
                    });
                }
            });
        }

        const filteredBills = billdtlData.filter(r => inPeriod(r.DATE) && !r._deleted);
        const filteredPurs  = purdtlData.filter( r => inPeriod(r.DATE) && !r._deleted);

        const totalSales     = filteredBills.reduce((s, r) => s + (parseFloat(r.NET10 || r.AMT10 || r.AMOUNT || 0)), 0);
        const totalPurchases = filteredPurs.reduce( (s, r) => s + (parseFloat(r.NET10 || r.AMT10 || r.AMOUNT || 0)), 0);

        // --- Calculate Upto Last Month (FY starts 1 April) ---
        // e.g. for May 2026: count sales from 1 Apr 2026 to 30 Apr 2026
        const isInFYBeforePeriod = (dateStr) => {
            if (!filterMonth || !filterYear || !dateStr) return false;
            const d = new Date(dateStr);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset() + 330);

            // FY start: 1 April of current FY year
            // If report month is Apr-Dec, FY started this year; if Jan-Mar, FY started last year
            const fyStartYear = filterMonth >= 4 ? filterYear : filterYear - 1;
            const fyStart = new Date(fyStartYear, 3, 1); // April = month index 3

            // Upper bound: first day of the selected report month
            const periodStart = new Date(filterYear, filterMonth - 1, 1);

            return d >= fyStart && d < periodStart;
        };
        const billsBefore = billdtlData.filter(r => isInFYBeforePeriod(r.DATE) && !r._deleted);
        const pursBefore  = purdtlData.filter( r => isInFYBeforePeriod(r.DATE) && !r._deleted);
        const salesUptoLastMonth     = billsBefore.reduce((s, r) => s + (parseFloat(r.NET10 || r.AMT10 || r.AMOUNT || 0)), 0);
        const purchasesUptoLastMonth = pursBefore.reduce((s, r) => s + (parseFloat(r.NET10 || r.AMT10 || r.AMOUNT || 0)), 0);

        stockDataResult.sort((a, b) => a.code.localeCompare(b.code));
        debtorData.sort((a,  b) => b.balance - a.balance);
        creditorData.sort((a, b) => b.balance - a.balance);

        res.json({
            stockData:    stockDataResult,
            debtorData,
            creditorData,
            summary: {
                totalSales,
                totalPurchases,
                salesUptoLastMonth,
                purchasesUptoLastMonth,
                totalStockItems: stockDataResult.length,
                totalDebtors:    debtorData.length,
                period: filterMonth && filterYear ? { month: filterMonth, year: filterYear } : null
            }
        });

    } catch (error) {
        console.error('Error generating PNB stock statement:', error);
        res.status(500).json({ message: 'Failed to generate PNB stock statement', error: error.message });
    }
});

// POST /api/reports/pnb-stock-statement/excel - Generate Excel (Python zipfile, preserves VBA 100%)
router.post('/pnb-stock-statement/excel', async (req, res) => {
    const { execFile } = require('child_process');
    const os           = require('os');
    const path         = require('path');
    const fsPromises   = require('fs').promises;
    const fsUnlink     = require('fs').unlink;
    try {
        const { stockData, debtorData, creditorData, summaryData, period } = req.body;
        if (!stockData || !debtorData || !summaryData) {
            return res.status(400).json({ message: 'Missing required data for Excel generation' });
        }

        const templatePath = path.join(__dirname, '../../0490008700003292_052026.xlsm');
        const scriptPath   = path.join(__dirname, '../pnb_excel_gen.py');
        const tmpDir       = os.tmpdir();
        const tmpData      = path.join(tmpDir, 'pnb_data_' + Date.now() + '.json');
        const tmpOut       = path.join(tmpDir, 'pnb_out_'  + Date.now() + '.xlsm');

        // Write JSON data to temp file
        await fsPromises.writeFile(tmpData, JSON.stringify({ stockData, debtorData, period, summaryData }));

        // Run Python script
        await new Promise((resolve, reject) => {
            execFile('python', [scriptPath, templatePath, tmpOut, tmpData], { timeout: 30000 },
                (err, stdout, stderr) => {
                    if (err) return reject(new Error(stderr || err.message));
                    if (!stdout.startsWith('OK:')) return reject(new Error('Python error: ' + stdout + stderr));
                    resolve();
                }
            );
        });

        // Read generated file
        const outputBuffer = await fsPromises.readFile(tmpOut);

        // Cleanup temp files
        fsUnlink(tmpData, () => {});
        fsUnlink(tmpOut,  () => {});

        const pMonthNumber = period ? period.month : (new Date().getMonth() + 1);
        const mm = String(pMonthNumber).padStart(2, '0');
        const pYear = period ? period.year : new Date().getFullYear();
        const accountNumber = '0490008700003292'; // Using the account number from the template/screenshot
        const filename = `${accountNumber}_${mm}${pYear}.xlsm`;

        res.setHeader('Content-Type',        'application/vnd.ms-excel.sheet.macroEnabled.12');
        res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-Length',      outputBuffer.length);
        res.send(outputBuffer);

    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).json({ message: 'Failed to generate Excel file', error: error.message });
    }
});

// GET /api/reports/gstr2a-purchase-data - Load purchase data for GSTR2A matching
router.get('/gstr2a-purchase-data', async (req, res) => {
    try {
        const { month } = req.query;
        
        if (!month || month.length !== 6) {
            return res.status(400).json({ message: 'Month parameter is required in MMYYYY format (e.g., 082025)' });
        }
        
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }
        
        const purPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'pur.json');
        const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');
        
        // Read purchase data from both files
        const purData = JSON.parse(await fs.readFile(purPath, 'utf8'));
        const cashData = JSON.parse(await fs.readFile(cashPath, 'utf8'));
        
        // Filter data for the specified month
        const monthStr = month.substring(0, 2);
        const yearStr = month.substring(2, 6);
        
        const filteredPurData = purData.filter(record => {
            if (!record.PBILLDATE) return false;
            
            const recordDate = new Date(record.PBILLDATE);
            const recordMonth = String(recordDate.getMonth() + 1).padStart(2, '0');
            const recordYear = String(recordDate.getFullYear());
            
            return recordMonth === monthStr && recordYear === yearStr;
        });
        
        const filteredCashData = cashData.filter(record => {
            if (!record.DATE) return false;
            
            const recordDate = new Date(record.DATE);
            const recordMonth = String(recordDate.getMonth() + 1).padStart(2, '0');
            const recordYear = String(recordDate.getFullYear());
            
            return recordMonth === monthStr && recordYear === yearStr;
        });
        
        // Create a map of cash data by bill number for quick lookup
        const cashMap = new Map();
        filteredCashData.forEach(record => {
            const billKey = record.BILL;
            if (billKey) {
                if (!cashMap.has(billKey)) {
                    cashMap.set(billKey, []);
                }
                cashMap.get(billKey).push(record);
            }
        });
        
        // Transform data to include GST details from CASH.json
        const transformedData = filteredPurData.map(record => {
            const billNumber = record.PBILL;
            const cashRecords = cashMap.get(billNumber) || [];
            
            // Calculate taxable value from CASH records where C_CODE starts with 'GG'
            const totalTaxableValue = cashRecords.reduce((sum, cashRecord) => {
                if (cashRecord.C_CODE && cashRecord.C_CODE.startsWith('GG')) {
                    const taxableValue = parseFloat(cashRecord.DR) || 0;
                    return sum + taxableValue;
                }
                return sum;
            }, 0);
            
            // Calculate GST amounts from CASH records
            // VG codes for CGST/SGST and VI codes for IGST
            const totalGSTAmount = cashRecords.reduce((sum, cashRecord) => {
                if (cashRecord.C_CODE && 
                    (cashRecord.C_CODE.startsWith('VG') || cashRecord.C_CODE.startsWith('VI'))) {
                    const gstAmount = parseFloat(cashRecord.DR) || 0;
                    return sum + gstAmount;
                }
                return sum;
            }, 0);
            
            // Separate CGST/SGST and IGST amounts for detailed breakdown
            const cgstSgstAmount = cashRecords.reduce((sum, cashRecord) => {
                if (cashRecord.C_CODE && cashRecord.C_CODE.startsWith('VG')) {
                    const gstAmount = parseFloat(cashRecord.DR) || 0;
                    return sum + gstAmount;
                }
                return sum;
            }, 0);
            
            const igstAmount = cashRecords.reduce((sum, cashRecord) => {
                if (cashRecord.C_CODE && cashRecord.C_CODE.startsWith('VI')) {
                    const gstAmount = parseFloat(cashRecord.DR) || 0;
                    return sum + gstAmount;
                }
                return sum;
            }, 0);
            
            return {
                PBILL: record.PBILL || '',
                PBILLDATE: record.PBILLDATE || '',
                C_CST: record.C_CST || '',
                N_B_AMT: record.N_B_AMT || 0,
                C_CODE: record.C_CODE || '',
                PRODUCT: record.PRODUCT || '',
                QTY: record.QTY || 0,
                RATE: record.RATE || 0,
                AMT: record.AMT || 0,
                // GST details from CASH.json
                TOTAL_GST_AMOUNT: parseFloat(totalGSTAmount.toFixed(2)),
                TOTAL_TAXABLE_VALUE: parseFloat(totalTaxableValue.toFixed(2)),
                CGST_SGST_AMOUNT: parseFloat(cgstSgstAmount.toFixed(2)),
                IGST_AMOUNT: parseFloat(igstAmount.toFixed(2)),
                CASH_RECORDS: cashRecords.filter(cr => 
                    cr.C_CODE && (cr.C_CODE.startsWith('GG') || cr.C_CODE.startsWith('VG') || cr.C_CODE.startsWith('VI'))
                )
            };
        });
        
        console.log(`[GSTR2A-PURCHASE-DATA] Loaded ${transformedData.length} purchase records with GST details from CASH.json for month ${month}`);
        
        res.json(transformedData);
        
    } catch (error) {
        console.error('Error loading GSTR2A purchase data:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: 'Purchase data files not found. Please check the DBF folder path.' });
        } else if (error instanceof SyntaxError) {
            res.status(500).json({ message: 'Error parsing purchase data files.' });
        } else {
            res.status(500).json({ message: 'Failed to load purchase data for GSTR2A matching.' });
        }
    }
});

// GST API Proxy Routes

// Helper to extract GST credentials from sv.vcc
router.get('/gst-credentials', async (req, res) => {
  try {
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    if (!DBF_FOLDER_PATH) {
      return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
    }
    const svPath = path.join(DBF_FOLDER_PATH, 'data', 'sv.vcc');
    
    // Read sv.vcc manually since it's a VFP DBF with unsupported field types for standard libraries
    const buf = await fs.readFile(svPath);
    const headerLength = buf.readUInt16LE(8);
    let pos = 32;
    const fields = [];
    while (buf[pos] !== 0x0D && pos < buf.length) {
      const name = buf.toString('utf8', pos, pos + 11).replace(/\0/g, '').trim();
      const type = String.fromCharCode(buf[pos + 11]);
      let length = buf[pos + 16];
      if (length === 0 && type === 'C') length = 256;
      fields.push({ name, type, length });
      pos += 32;
    }
    pos = headerLength + 1; // Start of records + skip deleted flag
    const record = {};
    fields.forEach(f => {
      const val = buf.toString('utf8', pos, pos + f.length).replace(/\0/g, '').trim();
      record[f.name] = val;
      pos += f.length;
    });

    res.json({
      aspid: record.ASPID || '',
      password: record.ASPPWD || '',
      gstin: record.PARTYGST || '',
      // Using SV_CL_ID (SMS Client ID) as requested for the GST portal username, stripping any potential wrapping quotes
      username: (record.SV_CL_ID || '').replace(/^['"]|['"]$/g, ''),
      // In case they need the GST password too
      gstpwd: record.GSTPWD || ''
    });
  } catch (error) {
    console.error('Error reading GST credentials from sv.vcc:', error);
    res.status(500).json({ message: 'Failed to read GST credentials', error: error.message });
  }
});

// Route to request OTP from GST API
router.post('/gst-otp-request', async (req, res) => {
  try {
    const { gstin, username, aspid, password } = req.body;
    
    const response = await axios.get(
      `http://gstapi.charteredinfo.com/taxpayerapi/dec/v1.0/authenticate?action=OTPREQUEST&gstin=${gstin}&username=${username}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'aspid': aspid,
          'password': password
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('GST OTP Request Error:', error.message);
    if (error.response) {
      console.error('GST API Response:', error.response.status, error.response.data);
      return res.status(error.response.status).json({
        error: 'GST API Error',
        details: error.response.data
      });
    }
    res.status(500).json({ 
      error: 'Failed to request OTP from GST API',
      details: error.message 
    });
  }
});

// Route to get auth token from GST API
router.post('/gst-auth-token', async (req, res) => {
  try {
    const { gstin, username, otp, aspid, password } = req.body;
    
    const response = await axios.get(
      `http://gstapi.charteredinfo.com/taxpayerapi/dec/v1.0/authenticate?action=AUTHTOKEN&gstin=${gstin}&username=${username}&OTP=${otp}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'aspid': aspid,
          'password': password
        },
        timeout: 30000
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('GST Auth Token Error:', error.message);
    if (error.response) {
      console.error('GST API Response:', error.response.status, error.response.data);
      return res.status(error.response.status).json({
        error: 'GST API Error',
        details: error.response.data
      });
    }
    res.status(500).json({ 
      error: 'Failed to get auth token from GST API',
      details: error.message 
    });
  }
});

// Route to download GSTR2A data from GST API
router.post('/gst-download-gstr2a', async (req, res) => {
  try {
    const { action, gstin, ret_period, authtoken, username, aspid, password } = req.body;
    
    const response = await axios.get(
      `http://gstapi.charteredinfo.com/taxpayerapi/dec/v2.0/returns/gstr2a?action=${action}&gstin=${gstin}&username=${username}&ret_period=${ret_period}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'aspid': aspid,
          'password': password,
          'auth-token': authtoken
        },
        timeout: 60000 // 60 second timeout for data download
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('GST GSTR2A Download Error:', error.message);
    if (error.response) {
      console.error('GST API Response:', error.response.status, error.response.data);
      return res.status(error.response.status).json({
        error: 'GST API Error',
        details: error.response.data
      });
    }
    res.status(500).json({ 
      error: 'Failed to download GSTR2A data from GST API',
      details: error.message 
    });
  }
});

// GSTR2A File Management Routes
// Route to save GSTR2A data to dedicated folder
router.post('/gstr2a-save-file', async (req, res) => {
  try {
    const { month, fileType, data } = req.body; // fileType: 'B2B' or 'CDN'
    
    if (!month || !fileType || !data) {
      return res.status(400).json({ error: 'Missing required parameters: month, fileType, data' });
    }
    
    // Create month-specific folder
    const monthFolder = path.join(__dirname, '../../public/gstr2a-data', month);
    await fs.mkdir(monthFolder, { recursive: true });
    
    // Save file
    const fileName = `gstr2a${fileType}${month}.json`;
    const filePath = path.join(monthFolder, fileName);
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    
    console.log(`[GSTR2A-SAVE] Saved ${fileName} to ${monthFolder}`);
    res.json({ success: true, filePath: `/gstr2a-data/${month}/${fileName}` });
    
  } catch (error) {
    console.error('Error saving GSTR2A file:', error);
    res.status(500).json({ error: 'Failed to save GSTR2A file', details: error.message });
  }
});

// Route to load GSTR2A data from dedicated folder
router.get('/gstr2a-load-file/:month/:fileType', async (req, res) => {
  try {
    const { month, fileType } = req.params; // fileType: 'B2B' or 'CDN'
    
    const fileName = `gstr2a${fileType}${month}.json`;
    const filePath = path.join(__dirname, '../../public/gstr2a-data', month, fileName);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      console.log(`[GSTR2A-LOAD] Loaded ${fileName} from month folder ${month}`);
      res.json(data);
      
    } catch (fileError) {
      if (fileError.code === 'ENOENT') {
        res.status(404).json({ error: `File not found: ${fileName}` });
      } else {
        throw fileError;
      }
    }
    
  } catch (error) {
    console.error('Error loading GSTR2A file:', error);
    res.status(500).json({ error: 'Failed to load GSTR2A file', details: error.message });
  }
});

// Route to list available GSTR2A files for a month
router.get('/gstr2a-list-files/:month', async (req, res) => {
  try {
    const { month } = req.params;
    
    const monthFolder = path.join(__dirname, '../../public/gstr2a-data', month);
    
    try {
      const files = await fs.readdir(monthFolder);
      const gstr2aFiles = files.filter(file => file.startsWith('gstr2a') && file.endsWith('.json'));
      
      const fileInfo = gstr2aFiles.map(file => {
        const fileType = file.includes('B2B') ? 'B2B' : file.includes('CDN') ? 'CDN' : 'Unknown';
        return {
          fileName: file,
          fileType,
          filePath: `/gstr2a-data/${month}/${file}`
        };
      });
      
      console.log(`[GSTR2A-LIST] Found ${fileInfo.length} files for month ${month}`);
      res.json({ files: fileInfo });
      
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        res.json({ files: [] }); // No folder exists yet
      } else {
        throw dirError;
      }
    }
    
  } catch (error) {
    console.error('Error listing GSTR2A files:', error);
    res.status(500).json({ error: 'Failed to list GSTR2A files', details: error.message });
  }
});

module.exports = router;