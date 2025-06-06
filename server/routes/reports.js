const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getDbfData } = require('./utilities'); // Assuming utilities are in the same directory or adjust path
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
    let { fromDate, toDate, itemCodes, partyCode, companyCodes, series, billNumbers, unit } = req.query;

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
      
    const filteredData = billdtlData.filter(item => {
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
        let { fromDate, toDate, itemCodes, partyCode, companyCodes, series, billNumbers, unit } = req.query;

        if (itemCodes) {
            itemCodes = itemCodes.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (billNumbers) {
            billNumbers = billNumbers.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (companyCodes) {
            companyCodes = companyCodes.split(',').map(s => s.trim()).filter(Boolean);
            if (companyCodes.length === 0) {
                companyCodes = undefined;
            }
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

        const filteredData = purdtlData.filter(item => {
            const itemDate = item.DATE ? new Date(item.DATE) : null;
            if (!itemDate) return false;

            const isDateInRange = itemDate >= startDate && itemDate <= endDate;
            let isItemMatch = true;
            let isPartyMatch = true;
            let isCompanyMatch = true;
            let isSeriesMatch = true;
            let isBillNumberMatch = true;
            let isUnitMatch = true;

            if (itemCodes && itemCodes.length > 0) {
                isItemMatch = itemCodes.includes(item.CODE);
            }

            if (partyCode) {
                isPartyMatch = item.C_CODE === partyCode;
            }

            if (companyCodes && companyCodes.length > 0) {
                if (item.CODE && item.CODE.length >= 2) {
                    const itemCompanyCode = item.CODE.substring(0, 2).toUpperCase();
                    isCompanyMatch = companyCodes.includes(itemCompanyCode);
                } else {
                    isCompanyMatch = false;
                }
            }

            if (series) {
                isSeriesMatch = item.SERIES === series.toUpperCase();
                if (billNumbers && billNumbers.length > 0) {
                    isBillNumberMatch = billNumbers.includes(String(item.BILL));
                }
            }

            if (unit && unit !== 'All') {
                isUnitMatch = item.UNIT && item.UNIT.toLowerCase() === unit.toLowerCase();
            }

            return isDateInRange && isItemMatch && isPartyMatch && isCompanyMatch && isSeriesMatch && isBillNumberMatch && isUnitMatch;
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

module.exports = router; 