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

// GET /api/pnb-stock-statement - PNB Stock Statement Report
router.get('/pnb-stock-statement', async (req, res) => {
    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }

        // Read required JSON files
        const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json');
        const purdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'purdtl.json');
        const transferPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'transfer.json');
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        const stockPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'stock.json');

        // Read all files
        const [billdtlData, purdtlData, transferData, cmplData, stockData] = await Promise.all([
            fs.readFile(billdtlPath, 'utf8').then(data => JSON.parse(data)),
            fs.readFile(purdtlPath, 'utf8').then(data => JSON.parse(data)),
            fs.readFile(transferPath, 'utf8').then(data => JSON.parse(data)),
            fs.readFile(cmplPath, 'utf8').then(data => JSON.parse(data)),
            fs.readFile(stockPath, 'utf8').then(data => JSON.parse(data))
        ]);

        // Process stock data
        const stockMap = new Map();
        stockData.forEach(item => {
            if (item.CODE) {
                stockMap.set(item.CODE, {
                    opening: parseFloat(item.OPENING || 0),
                    purchase: parseFloat(item.PURCHASE || 0),
                    sales: parseFloat(item.SALES || 0),
                    transfer: parseFloat(item.TRANSFER || 0),
                    closing: parseFloat(item.CLOSING || 0),
                    product: item.PRODUCT || 'Unknown Product'
                });
            }
        });

        // Calculate current stock from billdtl, purdtl, and transfer
        const itemStockMap = new Map();
        
        // Process bill details (sales - reduce stock)
        billdtlData.forEach(item => {
            if (item.CODE && item.QTY) {
                const code = item.CODE;
                const qty = parseFloat(item.QTY) || 0;
                if (!itemStockMap.has(code)) {
                    itemStockMap.set(code, {
                        code: code,
                        product: item.PRODUCT || stockMap.get(code)?.product || 'Unknown Product',
                        sales: 0,
                        purchases: 0,
                        transfers: 0
                    });
                }
                itemStockMap.get(code).sales += qty;
            }
        });

        // Process purchase details (purchases - increase stock)
        purdtlData.forEach(item => {
            if (item.CODE && item.QTY) {
                const code = item.CODE;
                const qty = parseFloat(item.QTY) || 0;
                if (!itemStockMap.has(code)) {
                    itemStockMap.set(code, {
                        code: code,
                        product: item.PRODUCT || stockMap.get(code)?.product || 'Unknown Product',
                        sales: 0,
                        purchases: 0,
                        transfers: 0
                    });
                }
                itemStockMap.get(code).purchases += qty;
            }
        });

        // Process transfer details
        transferData.forEach(item => {
            if (item.CODE && item.QTY) {
                const code = item.CODE;
                const qty = parseFloat(item.QTY) || 0;
                if (!itemStockMap.has(code)) {
                    itemStockMap.set(code, {
                        code: code,
                        product: item.PRODUCT || stockMap.get(code)?.product || 'Unknown Product',
                        sales: 0,
                        purchases: 0,
                        transfers: 0
                    });
                }
                itemStockMap.get(code).transfers += qty;
            }
        });

        // Generate stock data with current stock calculation
        const stockDataResult = [];
        for (const [code, data] of itemStockMap) {
            const stockInfo = stockMap.get(code);
            const currentStock = stockInfo ? stockInfo.closing : (data.purchases + data.transfers - data.sales);
            
            if (currentStock > 0) {
                stockDataResult.push({
                    code: code,
                    product: data.product,
                    currentStock: currentStock,
                    unit: 'PCS' // Default unit
                });
            }
        }

        // Process debtor balances from CMPL.json
        const debtorData = [];
        cmplData.forEach(company => {
            const balance = parseFloat(company.CUR_BAL || company.CB_VAL || 0);
            const drCr = company.DR || '';
            
            // Only include debtors (DR balances) with positive amounts
            if (drCr === 'DR' && balance > 0) {
                debtorData.push({
                    code: company.C_CODE || 'Unknown',
                    name: company.C_NAME || 'Unknown Company',
                    balance: balance
                });
            }
        });

        // Calculate summary data
        const totalSales = billdtlData.reduce((sum, item) => {
            return sum + (parseFloat(item.AMOUNT || item.AMT || 0));
        }, 0);

        const totalPurchases = purdtlData.reduce((sum, item) => {
            return sum + (parseFloat(item.AMOUNT || item.AMT || 0));
        }, 0);

        const summary = {
            totalSales: totalSales,
            totalPurchases: totalPurchases,
            totalStockItems: stockDataResult.length,
            totalDebtors: debtorData.length
        };

        // Sort data
        stockDataResult.sort((a, b) => a.code.localeCompare(b.code));
        debtorData.sort((a, b) => a.code.localeCompare(b.code));

        res.json({
            stockData: stockDataResult,
            debtorData: debtorData,
            summary: summary
        });

    } catch (error) {
        console.error('Error generating PNB stock statement:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: 'Required data files not found', error: error.message });
        } else {
            res.status(500).json({ message: 'Failed to generate PNB stock statement', error: error.message });
        }
    }
});

// POST /api/reports/pnb-stock-statement/excel - Generate Excel file
router.post('/pnb-stock-statement/excel', async (req, res) => {
    try {
        const { stockData, debtorData, summaryData } = req.body;
        
        if (!stockData || !debtorData || !summaryData) {
            return res.status(400).json({ message: 'Missing required data for Excel generation' });
        }

        // Read the template Excel file
        const templatePath = path.join(__dirname, '../../0490008700003292_072025.xlsm');
        let workbook;
        
        try {
            const templateBuffer = await fs.readFile(templatePath);
            workbook = XLSX.read(templateBuffer, { type: 'buffer' });
workbook = XLSX.read(templateBuffer, { type: 'buffer', bookVBA: true, cellStyles: true, cellNF: true, cellDates: true });
         } catch (error) {
            console.error('Error reading template file:', error);
            // Create a new workbook if template is not found
            workbook = XLSX.utils.book_new();
            
            // Create basic structure similar to template
            const basicInfoSheet = XLSX.utils.aoa_to_sheet([
                ['Name of the Borrower', 'EKTA ENTEPRISES'],
                ['CBS Customer ID', 'C00000968'],
                ['A/c Number', '0490008700003292'],
                ['Branch IFSC', 'PUNB0049000'],
                ['Facility', 'CC'],
                ['Sanctioned Limit (in Absolute Rs.)', '39000000'],
                ['Periodicity', 'Monthly'],
                ['Period ended', 'July'],
                ['Year', new Date().getFullYear()],
                [],
                ['Signature of Borrower'],
                [],
                ['*Yellow Colour cells are input fields']
            ]);
            XLSX.utils.book_append_sheet(workbook, basicInfoSheet, 'Basic Info');
        }

        // Sheet 2: Inventory Details - Preserve existing format and add data
        const inventorySheetName = 'Inventory Details';
        let inventorySheet;
        
        if (workbook.SheetNames.includes(inventorySheetName)) {
            // Get existing sheet to preserve formatting
            inventorySheet = workbook.Sheets[inventorySheetName];
            
            // Find the starting row for data (after headers)
            // Look for the row with "Sr. NO." to determine data start
            let dataStartRow = 15; // Default fallback
            const range = XLSX.utils.decode_range(inventorySheet['!ref']);
            
            for (let row = 0; row <= range.e.r; row++) {
                const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
                const cell = inventorySheet[cellRef];
                if (cell && cell.v && cell.v.toString().includes('Sr. NO.')) {
                    dataStartRow = row + 1;
                    break;
                }
            }
            
            // Add stock data starting from the identified row
            stockData.forEach((item, index) => {
                const rowIndex = dataStartRow + index;
                
                // Add data to specific cells while preserving formatting
                const cells = [
                    { col: 0, value: index + 1 }, // Sr. NO.
                    { col: 1, value: 'Main Godown' }, // Where Lying
                    { col: 2, value: item.product }, // Particular of Goods
                    { col: 3, value: item.currentStock }, // Quantity
                    { col: 4, value: 0 }, // Rate - to be filled manually
                    { col: 5, value: 0 }, // Value - calculated as Qty * Rate
                    { col: 6, value: '' } // Remarks
                ];
                
                cells.forEach(({ col, value }) => {
                    const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: col });
                    const destCell = inventorySheet[cellRef] || {};
                    // Copy style from the template's first data row to preserve formatting
                    const styleRef = XLSX.utils.encode_cell({ r: dataStartRow, c: col });
                    const styleCell = inventorySheet[styleRef];
                    if (styleCell && styleCell.s) destCell.s = styleCell.s;
                    if (styleCell && styleCell.z) destCell.z = styleCell.z;
                    destCell.v = value;
                    destCell.t = typeof value === 'number' ? 'n' : 's';
                    inventorySheet[cellRef] = destCell;
                });
            });
            
            // Update the sheet range to include new data
            const newRange = XLSX.utils.decode_range(inventorySheet['!ref']);
            newRange.e.r = Math.max(newRange.e.r, dataStartRow + stockData.length - 1);
            inventorySheet['!ref'] = XLSX.utils.encode_range(newRange);
        } else {
            // Fallback: create new sheet if template doesn't exist
            const inventoryData = [
                ['Particular', '', '', '', '', '', 'Value (in Absolute Rs)', '', '*Yellow Colour cells are input fields'],
                ['Inventory received on Job work (1)', '', '', '', '', '', '', '', '*All values are to be filled in absolute terms'],
                ['Inventory procured under LC (2)'],
                ['Obsolete Inventory (3)', '', '', '', '', '', '', '', '', '', 'Raw Material'],
                ['Sub Total (1+2+3)', '', '', '', '', '', '0', '', '', '', 'Stores'],
                ['', '', '', '', '', '', '', '', '', '', 'Stock in Progress'],
                ['Sr. NO.', 'Where Lying', 'Particular of Goods', 'Quantity', 'Rate  (in Absolute Rs)', 'Value (in Absolute Rs)', 'Remarks (if any)', '', '', '', 'Finished Goods'],
            ];

            // Add stock data to inventory sheet
            stockData.forEach((item, index) => {
                inventoryData.push([
                    index + 1,
                    'Main Godown', // Default location
                    item.product,
                    item.currentStock,
                    0, // Rate - to be filled manually
                    0, // Value - calculated as Qty * Rate
                    '', // Remarks
                    '', '', '', 'Spares'
                ]);
            });

            // Add total row
            inventoryData.push(['Total', '', '', '', '', '0']);

            inventorySheet = XLSX.utils.aoa_to_sheet(inventoryData);
            XLSX.utils.book_append_sheet(workbook, inventorySheet, inventorySheetName);
        }

        // Sheet 3: Debtor Details - Preserve existing format and add data
        const debtorSheetName = 'Debtor Details';
        let debtorSheet;
        
        if (workbook.SheetNames.includes(debtorSheetName)) {
            // Get existing sheet to preserve formatting
            debtorSheet = workbook.Sheets[debtorSheetName];
            
            // Find the starting row for debtor data (after headers)
            // Look for the row with "Name of Debtors" to determine data start
            let dataStartRow = 20; // Default fallback
            const range = XLSX.utils.decode_range(debtorSheet['!ref']);
            
            for (let row = 0; row <= range.e.r; row++) {
                const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
                const cell = debtorSheet[cellRef];
                if (cell && cell.v && cell.v.toString().includes('Name of Debtors')) {
                    dataStartRow = row + 1;
                    break;
                }
            }
            
            // Add debtor data starting from the identified row
            debtorData.forEach((debtor, index) => {
                const rowIndex = dataStartRow + index;
                
                // Add data to specific cells while preserving formatting
                const cells = [
                    { col: 0, value: debtor.name }, // Name of Debtors
                    { col: 1, value: '' }, // Invoice No - to be filled
                    { col: 2, value: '' }, // Date of Invoice - to be filled
                    { col: 3, value: '' }, // LEI/GST/PAN - to be filled
                    { col: 4, value: debtor.balance }, // Upto 3 months
                    { col: 5, value: 0 }, // > 3 months upto 6 months
                    { col: 6, value: 0 }, // > 6 months upto 1 year
                    { col: 7, value: 0 }, // More Than 1 Year
                    { col: 8, value: debtor.balance } // Total
                ];
                
                cells.forEach(({ col, value }) => {
                    const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: col });
                    const destCell = debtorSheet[cellRef] || {};
                    // Copy style from the template's first data row to preserve formatting
                    const styleRef = XLSX.utils.encode_cell({ r: dataStartRow, c: col });
                    const styleCell = debtorSheet[styleRef];
                    if (styleCell && styleCell.s) destCell.s = styleCell.s;
                    if (styleCell && styleCell.z) destCell.z = styleCell.z;
                    destCell.v = value;
                    destCell.t = typeof value === 'number' ? 'n' : 's';
                    debtorSheet[cellRef] = destCell;
                });
            });
            
            // Update the sheet range to include new data
            const newRange = XLSX.utils.decode_range(debtorSheet['!ref']);
            newRange.e.r = Math.max(newRange.e.r, dataStartRow + debtorData.length - 1);
            debtorSheet['!ref'] = XLSX.utils.encode_range(newRange);
        } else {
            // Fallback: create new sheet if template doesn't exist
            const debtorSheetData = [
                ['Advances taken through Bills/Oustanding under Bils discounted', '', '', '', '', '', '', '', 'Value In Absolute Rs.', '', '', 'Yellow Colour cells are input fields'],
                ['', '', '', '', '', '', '', '', '', '', '', '*All values are to be filled in absolute terms'],
                [],
                ['Upto 3 months'],
                ['> 3 months upto 6 months'],
                ['> 6 months upto 1 year'],
                ['More Than 1 Year'],
                ['Total', '', '', '', '', '', '', '', '0'],
                [],
                ['Debtors (receivables including bills)', '', '', '', 'in Absolute Rs.'],
                ['Name of Debtors', 'Invoice No.', 'Date of Invoice', 'LEI No./GST No./PAN of Debtor', 'Upto 3 months', '> 3 months upto 6 months', '> 6 months upto 1 year', 'More Than 1 Year', 'Total']
            ];

            // Add debtor data
            debtorData.forEach((debtor) => {
                debtorSheetData.push([
                    debtor.name,
                    '', // Invoice No - to be filled
                    '', // Date of Invoice - to be filled
                    '', // LEI/GST/PAN - to be filled
                    debtor.balance, // Assuming all balances are upto 3 months
                    0, // > 3 months upto 6 months
                    0, // > 6 months upto 1 year
                    0, // More Than 1 Year
                    debtor.balance // Total
                ]);
            });

            debtorSheet = XLSX.utils.aoa_to_sheet(debtorSheetData);
            XLSX.utils.book_append_sheet(workbook, debtorSheet, debtorSheetName);
        }

        // Save the updated workbook back to the original template file
        const excelBuffer = XLSX.write(workbook, { 
            type: 'buffer', 
            bookType: 'xlsm',
            compression: true,
            bookVBA: true // Preserve VBA macros when writing
        });

        // Ensure a generated output directory exists and write there to preserve the original template
        const outputDir = path.join(__dirname, '../../generated');
        await fs.mkdir(outputDir, { recursive: true });
        const timeStamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `PNB_Stock_Statement_${timeStamp}.xlsm`);

        // Write the updated data to the new output file (do not overwrite the template)
        await fs.writeFile(outputPath, excelBuffer);

        // Send success response
        res.json({ 
            message: 'Excel file updated successfully', 
            filePath: outputPath,
            timestamp: new Date().toISOString()
        });

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
          'authtoken': authtoken
        },
        timeout: 60000 // 60 second timeout for data download
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('GST GSTR2A Download Error:', error.message);
    if (error.response) {
      console.error('GST API Response:', error.response.status, error.response.data);
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