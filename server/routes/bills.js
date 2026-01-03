const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const csv = require('fast-csv');
const { DbfSync } = require('../utils/dbf-sync');
require('dotenv').config();

const billsDeliveryStatePath = path.join(__dirname, '..', 'db', 'BillsDeliveryRegister.json');
const vanLoadingHistoryPath = path.join(__dirname, '..', 'db', 'VanLoadingHistory.json');
const dbPath = path.join(__dirname, '..', 'db');

function formatDateToDDMMYYYY(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Route to get bill.json
router.get('/bills', async (req, res) => {
    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }
        const billsPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'bill.json');
        const data = await fs.readFile(billsPath, 'utf8');

        const bills = JSON.parse(data);
        res.json(bills);
    } catch (error) {
        console.error('Error fetching bill.json:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: `bill.json not found at ${error.path}` });
        } else {
            res.status(500).json({ message: 'Failed to fetch bill data' });
        }
    }
});

// Route to get bill delivery statuses
router.get('/bills-delivery-status', async (req, res) => {
    try {
        const data = await fs.readFile(billsDeliveryStatePath, 'utf8');
        const content = JSON.parse(data);
        if (Array.isArray(content)) {
            res.json(content);
        } else {
            res.json([]);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json([]); // If file doesn't exist, it's not an error, just no statuses yet.
        } else {
            console.error('Error fetching BillsDeliveryRegister.json:', error);
            res.status(500).json({ message: 'Failed to fetch bill delivery statuses' });
        }
    }
});

// Route to update a bill's delivery status
router.post('/update-bill-delivery-status', async (req, res) => {
    const { key, status } = req.body;
    if (!key || !status) {
        return res.status(400).json({ message: 'Bill key and status are required.' });
    }

    try {
        let statuses = [];
        try {
            const data = await fs.readFile(billsDeliveryStatePath, 'utf8');
            const content = JSON.parse(data);
            if (Array.isArray(content)) {
                statuses = content;
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        const existingEntryIndex = statuses.findIndex(item => item.key === key);
        const currentDate = formatDateToDDMMYYYY(new Date());

        if (existingEntryIndex > -1) {
            const entry = statuses[existingEntryIndex];
            if (status === 'BILLED') { 
                statuses.splice(existingEntryIndex, 1);
            } else {
                entry.status = status;
                if (status === 'PICKED') {
                    entry.picked_date = currentDate;
                    delete entry.delivered_date;
                } else if (status === 'DELIVERED') {
                    entry.delivered_date = currentDate;
                }
            }
        } else if (status !== 'BILLED') {
            const newEntry = { key, status };
            if (status === 'PICKED') {
                newEntry.picked_date = currentDate;
            } else if (status === 'DELIVERED') {
                newEntry.delivered_date = currentDate;
            }
            statuses.push(newEntry);
        }

        await fs.writeFile(billsDeliveryStatePath, JSON.stringify(statuses, null, 2));
        res.json({ message: 'Status updated successfully.' });
    } catch (error) {
        console.error('Error updating bill delivery status:', error);
        res.status(500).json({ message: 'Failed to update bill delivery status.' });
    }
});

// Route to calculate next day stock
router.post('/calculate-next-day-stock', async (req, res) => {
    const { nextdate, gdnCode, transferItems } = req.body;
    if (!nextdate || !gdnCode) {
        return res.status(400).json({ message: 'nextdate and gdnCode are required.' });
    }

    try {
        const stockFilePath = path.join(dbPath, `daily_stock_${gdnCode}.csv`);
        
        const [day, month, year] = nextdate.split('-');
        const nextDateObj = new Date(`${year}-${month}-${day}`);
        const prevDateObj = new Date(nextDateObj);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevDateStr = `${String(prevDateObj.getDate()).padStart(2, '0')}-${String(prevDateObj.getMonth() + 1).padStart(2, '0')}-${prevDateObj.getFullYear()}`;

        let fileContent;
        try {
            fileContent = await fs.readFile(stockFilePath, 'utf-8');
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ message: `Stock file for godown ${gdnCode} not found.` });
            }
            throw error;
        }
        
        let rows = fileContent.split('\n').filter(row => row.trim() !== '');
        if (rows.length === 0) {
            return res.status(404).json({ message: `Stock file for godown ${gdnCode} is empty.` });
        }

        // Overwrite logic: Remove existing summary and next day's opening rows if they exist
        let initialRowCount = rows.length;
        rows = rows.filter(row => {
            const isPrevDateSummary = row.startsWith(prevDateStr) && 
                                      (row.includes('total purchase') || 
                                       row.includes('total sales') || 
                                       row.includes('transfer to retail'));
            const isNextDateOpening = row.startsWith(nextdate) && row.includes('OPENING:');
            return !isPrevDateSummary && !isNextDateOpening;
        });

        if(rows.length < initialRowCount) {
            console.log(`Overwrite: Removed existing calculated rows for ${prevDateStr}/${nextdate} in daily_stock_${gdnCode}.csv.`);
        }
        
        let prevDayOpeningRowIndex = -1;
        for(let i = rows.length - 1; i >= 0; i--) {
            if(rows[i].startsWith(prevDateStr) && rows[i].includes('OPENING:')) {
                prevDayOpeningRowIndex = i;
                break;
            }
        }
        
        if (prevDayOpeningRowIndex === -1) {
            return res.status(404).json({ message: `Opening row for ${prevDateStr} not found in stock file for godown ${gdnCode}.` });
        }

        const headerRow = rows[0].split(',').slice(2).map(h => h.trim()); // These are item codes
        const itemCodeToIndex = new Map(headerRow.map((code, index) => [code, index]));
        
        const numItemColumns = headerRow.length;

        const prevDayOpeningRow = rows[prevDayOpeningRowIndex];
        const openingStocks = prevDayOpeningRow.split(',').slice(2).map(s => parseInt(s.trim() || '0', 10));

        // TODO: Replace with actual data when available
        const purchaseValues = Array(numItemColumns).fill(0);
        const salesValues = Array(numItemColumns).fill(0);
        
        const transferValues = Array(numItemColumns).fill(0);
        if (transferItems && transferItems.length > 0) {
            transferItems.forEach(item => {
                const index = itemCodeToIndex.get(item.code);
                if (index !== undefined) {
                    transferValues[index] = item.qty;
                } else {
                    console.warn(`Item code ${item.code} from transfer not found in stock file header for ${gdnCode}.`);
                }
            });
        }

        const summaryRows = [
            `${prevDateStr},total purchase,${purchaseValues.join(',')}`,
            `${prevDateStr},total sales,${salesValues.join(',')}`,
            `${prevDateStr},transfer to retail,${transferValues.join(',')}`
        ];

        const nextDayOpeningStocks = openingStocks.map((stock, i) => {
            return stock + purchaseValues[i] - salesValues[i] - transferValues[i];
        });

        const nextDayOpeningRow = `${nextdate},OPENING:,${nextDayOpeningStocks.join(',')}`;
        
        // Insert summary rows after previous day's opening
        rows.splice(prevDayOpeningRowIndex + 1, 0, ...summaryRows);
        
        // Append next day's opening at the end (or after the summary rows)
        // Ensure we are adding to the very end of the file correctly
        const finalRows = [...rows, nextDayOpeningRow];

        await fs.writeFile(stockFilePath, finalRows.join('\n') + '\n');
        
        res.json({ message: `Successfully calculated and appended stock for ${nextdate} for godown ${gdnCode}.` });
    } catch (error) {
        console.error('Error calculating next day stock:', error);
        res.status(500).json({ message: 'Failed to calculate next day stock.' });
    }
});

// Route to get godown stock for printing
router.get('/godown-stock/:godownCode', async (req, res) => {
    const { godownCode } = req.params;
    const { date } = req.query; // date will be in DD-MM-YYYY format

    if (!date) {
        return res.status(400).json({ message: 'Date query parameter is required.' });
    }

    const stockFilePath = path.join(dbPath, `daily_stock_${godownCode}.csv`);
    const pmplFilePath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'pmpl.json');

    try {
        // Read stock and pmpl files
        const stockFileContent = await fs.readFile(stockFilePath, 'utf-8');
        const pmplData = JSON.parse(await fs.readFile(pmplFilePath, 'utf-8'));

        // Create a map for easy lookup of product details
        const pmplMap = new Map();
        pmplData.forEach(p => pmplMap.set(p.CODE, p));

        const rows = stockFileContent.split('\n').filter(row => row.trim() !== '');
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stock file is empty or not found.' });
        }

        const headerRow = rows[0].split(',').slice(2).map(h => h.trim()); // Item codes from header

        // Find the relevant rows for the given date
        const openingRowData = rows.find(r => r.startsWith(date) && r.includes('OPENING:'));
        const purchaseRowData = rows.find(r => r.startsWith(date) && r.includes('total purchase'));
        const salesRowData = rows.find(r => r.startsWith(date) && r.includes('total sales'));
        const transferRowData = rows.find(r => r.startsWith(date) && r.includes('transfer to retail'));
        
        if (!openingRowData) {
            return res.status(404).json({ message: `No opening stock found for date ${date}.` });
        }

        // Extract values, providing defaults if summary rows don't exist
        const openingStocks = openingRowData.split(',').slice(2);
        const purchaseStocks = purchaseRowData ? purchaseRowData.split(',').slice(2) : headerRow.map(() => '0');
        const salesStocks = salesRowData ? salesRowData.split(',').slice(2) : headerRow.map(() => '0');
        const transferStocks = transferRowData ? transferRowData.split(',').slice(2) : headerRow.map(() => '0');
        
        let reportData = headerRow.map((itemCode, index) => {
            const opening = parseInt(openingStocks[index]?.trim() || '0', 10);
            const purchase = parseInt(purchaseStocks[index]?.trim() || '0', 10);
            const sales = parseInt(salesStocks[index]?.trim() || '0', 10);
            const transfer = parseInt(transferStocks[index]?.trim() || '0', 10);
            const closing = opening + purchase - sales - transfer;

            const pmplItem = pmplMap.get(itemCode);
            const itemNameWithMrp = pmplItem ? `[${itemCode}] ${pmplItem.PRODUCT} {${pmplItem.MRP1 || 'N/A'}}` : itemCode;

            return {
                itemCode,
                item: itemNameWithMrp,
                opening: String(opening),
                purchase: String(purchase),
                sales: String(sales),
                transfer: String(transfer),
                closing: String(closing),
            };
        });
        
        // Filter out items with zero closing stock
        reportData = reportData.filter(item => parseInt(item.closing, 10) !== 0);

        // Sort alphabetically by item code
        reportData.sort((a, b) => a.itemCode.localeCompare(b.itemCode));

        res.json({ date, data: reportData });

    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ message: `Stock file for godown ${godownCode} not found.` });
        }
        console.error(`Error processing stock file for godown ${godownCode}:`, error);
        res.status(500).json({ message: 'Failed to process godown stock data.' });
    }
});

// Route to get specific bill details
router.get('/bill-details/:series/:billNo', async (req, res) => {
    const { series, billNo } = req.params;

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }
        const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
        const data = await fs.readFile(billDtlPath, 'utf8');
        const allDetails = JSON.parse(data);

        const filteredDetails = allDetails.filter(
          (item) => item.SERIES === series && item.BILL === Number(billNo)
        );

        res.json(filteredDetails);
    } catch (error) {
        console.error('Error fetching BILLDTL.json:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: `BILLDTL.json not found at ${error.path}` });
        } else {
            res.status(500).json({ message: 'Failed to fetch bill details data' });
        }
    }
});

// Route to get full bill details for dialog
router.post('/bill-details-full', async (req, res) => {
    const { billNumbers } = req.body;

    if (!billNumbers || !Array.isArray(billNumbers)) {
        return res.status(400).json({ message: 'Bill numbers array is required' });
    }

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }
        const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'bill.json');
        const data = await fs.readFile(billPath, 'utf8');
        const allBills = JSON.parse(data);

        // Parse bill numbers and filter bills
        const billFilters = billNumbers.map(bill => {
            const [series, billNo] = bill.split('-');
            return { series: series?.trim(), billNo: billNo?.trim() };
        }).filter(filter => filter.series && filter.billNo);

        const filteredBills = allBills.filter(bill => {
            return billFilters.some(filter => {
                return bill.SERIES === filter.series && bill.BILL === Number(filter.billNo);
            });
        });

        res.json(filteredBills);
     } catch (error) {
         console.error('Error fetching bill.json:', error);
         if (error.code === 'ENOENT') {
             res.status(404).json({ message: `bill.json not found at ${error.path}` });
         } else {
             res.status(500).json({ message: 'Failed to fetch bill data' });
         }
     }
 });

// Route for van loading report
// Route to store van loading history
router.post('/van-loading-history', async (req, res) => {
    const { billNumbers } = req.body;
    
    if (!billNumbers) {
        return res.status(400).json({ message: 'Bill numbers are required' });
    }

    try {
        let history = [];
        try {
            const data = await fs.readFile(vanLoadingHistoryPath, 'utf8');
            const content = JSON.parse(data);
            if (Array.isArray(content)) {
                history = content;
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        const currentDate = formatDateToDDMMYYYY(new Date());
        const billList = billNumbers.split(',').map(bill => bill.trim()).filter(Boolean);
        
        // Add each bill to history if not already present for today
        billList.forEach(billNumber => {
            const existingEntry = history.find(entry => 
                entry.billNumber === billNumber && entry.date === currentDate
            );
            
            if (!existingEntry) {
                history.push({
                    billNumber: billNumber,
                    date: currentDate,
                    timestamp: new Date().toISOString()
                });
            }
        });

        await fs.writeFile(vanLoadingHistoryPath, JSON.stringify(history, null, 2));
        res.json({ message: 'Van loading history saved successfully' });
    } catch (error) {
        console.error('Error saving van loading history:', error);
        res.status(500).json({ message: 'Failed to save van loading history' });
    }
});

// Route to check van loading history for a specific bill
router.get('/van-loading-history/:billNumber', async (req, res) => {
    const { billNumber } = req.params;
    
    try {
        let history = [];
        try {
            const data = await fs.readFile(vanLoadingHistoryPath, 'utf8');
            const content = JSON.parse(data);
            if (Array.isArray(content)) {
                history = content;
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        const billHistory = history.filter(entry => entry.billNumber === billNumber)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json(billHistory);
    } catch (error) {
        console.error('Error fetching van loading history:', error);
        res.status(500).json({ message: 'Failed to fetch van loading history' });
    }
});

router.get('/van-loading', async (req, res) => {
    const { billNumbers, unit, companyCodes } = req.query;

    if (!billNumbers) {
        return res.status(400).json({ message: 'Bill numbers are required' });
    }

    // Parse company codes if provided
    let companyCodesArr;
    if (companyCodes) {
        try {
            companyCodesArr = String(companyCodes)
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            if (companyCodesArr.length === 0) companyCodesArr = undefined;
        } catch (e) {
            console.error('Error parsing companyCodes:', e);
            companyCodesArr = undefined;
        }
    }

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }

        const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        const pmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'pmpl.json');

        const billDtlData = JSON.parse(await fs.readFile(billDtlPath, 'utf8'));
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf8'));
        const pmplData = JSON.parse(await fs.readFile(pmplPath, 'utf8'));

        // Create party details map
        const partyDetailsMap = cmplData.reduce((acc, party) => {
            acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
            return acc;
        }, {});

        // Create PMPL map for MRP lookup
        const pmplMap = new Map();
        pmplData.forEach(p => pmplMap.set(p.CODE, p));

        // Parse bill numbers (format: "A-23,B-45")
        const billFilters = billNumbers.split(',').map(bill => {
            const [series, billNo] = bill.trim().split('-');
            return { series: series.trim(), billNo: billNo.trim() };
        });

        // Filter bill details based on provided bill numbers
        let filteredData = billDtlData.filter(item => {
            return billFilters.some(filter => {
                // Use BILL2 field instead of BILL field
                const bill2Value = item.BILL2 ? item.BILL2.trim() : '';
                // BILL2 format is "SERIES-    NUMBER" where NUMBER is right-aligned with spaces
                // Total length after dash should be 5 characters
                const paddedBillNo = filter.billNo.padStart(5, ' ');
                const expectedBill2 = `${filter.series}-${paddedBillNo}`;
                return bill2Value === expectedBill2;
            });
        });

        // Apply company filter if specified
        if (companyCodesArr && companyCodesArr.length > 0) {
            filteredData = filteredData.filter(item => {
                if (item.CODE && item.CODE.length >= 2) {
                    const itemCompanyCode = String(item.CODE).substring(0, 2).toUpperCase();
                    return companyCodesArr.includes(itemCompanyCode);
                }
                return false;
            });
        }

        // Apply unit filter if specified
        if (unit && unit.toUpperCase() !== 'ALL') {
            filteredData = filteredData.filter(item => 
                item.UNIT && item.UNIT.toLowerCase() === unit.toLowerCase()
            );
        }

        // Group data by SKU (CODE) for heatmap visualization
        const skuData = {};
        filteredData.forEach(item => {
            const sku = item.CODE;
            if (!skuData[sku]) {
                skuData[sku] = {
                    code: sku,
                    product: item.PRODUCT || 'N/A',
                    totalQty: 0,
                    totalBoxes: 0,
                    totalPcs: 0,
                    unit: item.UNIT,
                    multF: item.MULT_F || 1,
                    details: []
                };
            }

            const qty = parseFloat(item.QTY) || 0;
            const free = parseFloat(item.FREE) || 0;
            const totalItemQty = qty + free;

            // Accumulate unit-wise without converting between units
            const unitNorm = (item.UNIT || '').toString().trim().toLowerCase();
            if (unitNorm === 'box' || unitNorm === 'b') {
                skuData[sku].totalBoxes += totalItemQty;
            } else {
                // Treat any non-box unit as pieces (e.g., PCS, PC, PIECE)
                skuData[sku].totalPcs += totalItemQty;
            }

            // Add detail for tooltip
            const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
            const formattedDate = item.DATE ? formatDateToDDMMYYYY(new Date(item.DATE)).replace(/-/g, '/') : 'N/A';
            skuData[sku].details.push({
                date: formattedDate,
                partyName: partyInfo.name,
                qty: totalItemQty,
                unit: item.UNIT,
                series: item.SERIES,
                billNo: item.BILL
            });
        });

        // Convert to array and sort by total quantity (for heatmap intensity)
        const reportData = Object.values(skuData).map(sku => {
            const pmplItem = pmplMap.get(sku.code);
            const mrp = pmplItem ? pmplItem.MRP1 : null;
            
            return {
                sku: sku.code,
                itemName: sku.product,
                mrp: mrp,
                totalQtyBoxes: Math.round(sku.totalBoxes * 100) / 100,
                totalQtyPcs: Math.round(sku.totalPcs),
                // Total quantity used for heatmap intensity: boxes converted to pieces using multF + direct pieces
                totalQty: (sku.totalBoxes * (sku.multF || 1)) + sku.totalPcs,
                details: sku.details
            };
        }).sort((a, b) => b.totalQty - a.totalQty);

        res.json(reportData);
    } catch (error) {
        console.error('Error processing van loading report:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: 'Required data files not found' });
        } else {
            res.status(500).json({ message: 'Failed to generate van loading report' });
        }
    }
});

// Route to search bills with filters for old bill editing
router.get('/search', async (req, res) => {
    const { fromDate, toDate, partyName, amount, type } = req.query;

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }

        const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'bill.json');
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');

        const billData = JSON.parse(await fs.readFile(billPath, 'utf8'));
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf8'));

        // Create party details map for name lookup
        const partyDetailsMap = cmplData.reduce((acc, party) => {
            acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
            return acc;
        }, {});

        // Filter bills based on search criteria
        let filteredBills = billData.filter(bill => {
            // Date filter
            if (fromDate || toDate) {
                const billDate = new Date(bill.DATE);
                if (fromDate) {
                    const from = new Date(fromDate);
                    if (billDate < from) return false;
                }
                if (toDate) {
                    const to = new Date(toDate);
                    to.setHours(23, 59, 59, 999); // Include the entire end date
                    if (billDate > to) return false;
                }
            }

            // Party name filter
            if (partyName) {
                const partyInfo = partyDetailsMap[bill.C_CODE];
                const partyNameToSearch = partyInfo ? partyInfo.name : bill.C_CODE;
                if (!partyNameToSearch.toLowerCase().includes(partyName.toLowerCase())) {
                    return false;
                }
            }

            // Amount filter
            if (amount) {
                const searchAmount = parseFloat(amount);
                const billAmount = parseFloat(bill.N_B_AMT) || 0;
                if (Math.abs(billAmount - searchAmount) > 0.01) { // Allow small floating point differences
                    return false;
                }
            }

            // Type filter (Cash/Credit)
            if (type && type !== 'All') {
                const billType = bill.CASH === 'Y' ? 'Cash' : 'Credit';
                if (billType !== type) {
                    return false;
                }
            }

            return true;
        });

        // Transform data for frontend
        const searchResults = filteredBills.map(bill => {
            const partyInfo = partyDetailsMap[bill.C_CODE] || { name: bill.C_CODE, place: '' };
            const billType = bill.CASH === 'Y' ? 'Cash' : 'Credit';
            
            return {
                id: `${bill.SERIES}-${bill.BILL}`, // Unique identifier for navigation
                billNo: `${bill.SERIES}-${bill.BILL}`,
                date: bill.DATE,
                partyName: partyInfo.name,
                amount: parseFloat(bill.N_B_AMT) || 0,
                type: billType,
                series: bill.SERIES,
                billNumber: bill.BILL,
                partyCode: bill.C_CODE
            };
        });

        // Sort by date (newest first) and then by bill number
        searchResults.sort((a, b) => {
            const dateCompare = new Date(b.date) - new Date(a.date);
            if (dateCompare !== 0) return dateCompare;
            return b.billNumber - a.billNumber;
        });

        res.json({
            success: true,
            bills: searchResults,
            total: searchResults.length
        });

    } catch (error) {
        console.error('Error searching bills:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ 
                success: false,
                message: 'Required data files not found',
                bills: []
            });
        } else {
            res.status(500).json({ 
                success: false,
                message: 'Failed to search bills',
                bills: []
            });
        }
    }
});

// Route to get bill details for editing old bills
router.get('/details/:series/:billNumber', async (req, res) => {
    const { series, billNumber } = req.params;

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }

        // Helper to read JSON with case-insensitive filename fallback
        const readJsonSafe = async (...paths) => {
            for (const p of paths) {
                try {
                    const content = await fs.readFile(p, 'utf8');
                    return JSON.parse(content);
                } catch (e) {
                    if (e.code !== 'ENOENT') throw e; // Only ignore missing file; propagate others
                }
            }
            const err = new Error('Required file not found');
            err.code = 'ENOENT';
            throw err;
        };

        // Build candidate paths for upper/lowercase variants
        const billPathUpper = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILL.json');
        const billPathLower = path.join(DBF_FOLDER_PATH, 'data', 'json', 'bill.json');
        const billdtlPathUpper = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
        const billdtlPathLower = path.join(DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json');
        const cmplPathUpper = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        const cmplPathLower = path.join(DBF_FOLDER_PATH, 'data', 'json', 'cmpl.json');
        const pmplPathUpper = path.join(DBF_FOLDER_PATH, 'data', 'json', 'PMPL.json');
        const pmplPathLower = path.join(DBF_FOLDER_PATH, 'data', 'json', 'pmpl.json');

        const billData = await readJsonSafe(billPathUpper, billPathLower);
        const billdtlData = await readJsonSafe(billdtlPathUpper, billdtlPathLower);
        const cmplData = await readJsonSafe(cmplPathUpper, cmplPathLower);
        const pmplData = await readJsonSafe(pmplPathUpper, pmplPathLower);
        
        // Read users data for salesman mapping
        const usersPath = path.join(__dirname, '..', 'db', 'users.json');
        const usersData = JSON.parse(await fs.readFile(usersPath, 'utf8'));

        // Find the main bill record
        const mainBill = billData.find(bill => 
            bill.SERIES === series && bill.BILL.toString() === billNumber.toString()
        );

        if (!mainBill) {
            return res.status(404).json({ 
                success: false,
                message: 'Bill not found' 
            });
        }

        // Find all bill detail records for this bill
        const billDetails = billdtlData.filter(detail => 
            detail.SERIES === series && detail.BILL.toString() === billNumber.toString()
        );

        // Create lookup maps
        const partyDetailsMap = cmplData.reduce((acc, party) => {
            acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
            return acc;
        }, {});

        // Use PMPL.json for item name and unit mapping
        const itemDetailsMap = pmplData.reduce((acc, item) => {
            const code = item.CODE || item.I_CODE; // fallback if structure differs
            if (code) {
                acc[code] = { name: item.PRODUCT || item.PRODUCT_L || code, unit: item.UNIT_1 || 'PCS' };
            }
            return acc;
        }, {});

        // Get party information
        const partyInfo = partyDetailsMap[mainBill.C_CODE] || { 
            name: mainBill.C_CODE, 
            place: '' 
        };

        // Create lookup map for S/M names using BR_CODE
        const smDetailsMap = usersData.reduce((acc, user) => {
            if (user.smCode) {
                acc[user.smCode] = {
                    name: user.name,
                    smCode: user.smCode
                };
            }
            return acc;
        }, {});

        // Get S/M information from BR_CODE
        const smInfo = smDetailsMap[mainBill.BR_CODE] || { 
            name: '', 
            smCode: mainBill.BR_CODE || ''
        };

        // Transform bill details to the shape expected by frontend
        const transformedItems = billDetails.map(detail => {
            const itemCode = detail.CODE || detail.I_CODE; // Use CODE field from BILLDTL.json
            const itemInfo = itemDetailsMap[itemCode] || { name: detail.PRODUCT || itemCode, unit: detail.UNIT || 'PCS' };
            
            // Calculate amount and net amount from BILLDTL.json structure
            const qty = detail.QTY || 0;
            const rate = detail.RATE || 0;
            const amount = detail.AMT10 || (qty * rate) || 0;
            const netAmount = detail.NET10 || amount || 0;
            
            return {
                item: itemCode,
                itemName: detail.PRODUCT || itemInfo.name,
                itemCode: itemCode, // Separate field for ITEM CODE
                originalItemName: itemInfo.name, // Original item name from PMPL
                unit: itemInfo.unit, // Use original unit from PMPL instead of BILLDTL unit
                billdtlUnit: detail.UNIT || '', // Keep BILLDTL unit for reference
                qty: qty.toString(),
                rate: rate.toString(),
                amount: amount.toString(),
                netAmount: netAmount.toString(),
                godown: detail.GDN_CODE || '',
                stock: '',
                pack: detail.PACK || '',
                gst: (detail.GST ?? '').toString(),
                pcBx: '',
                mrp: (detail.MRP ?? '').toString(),
                cess: (detail.CESS_RS ?? 0).toString(),
                schRs: (detail.SCHEME ?? 0).toString(),
                sch: (detail.DISCOUNT ?? 0).toString(),
                cd: (detail.CASH_DIS ?? 0).toString(),
                selectedItem: null,
                stockLimit: 0
            };
        });

        // Return data in the format expected by the frontend EditInvoicing component
        const data = {
            summary: {
                series: mainBill.SERIES,
                billNo: mainBill.BILL,
                date: mainBill.DATE,
                partyName: partyInfo.name,
                totalAmount: mainBill.AMOUNT || 0,
                itemCount: billDetails.length
            },
            bill: {
                DATE: mainBill.DATE,
                CASH: mainBill.CASH,
                SM: smInfo.smCode,
                smName: smInfo.name,
                REF: mainBill.REF || '',
                DUE_DAYS: mainBill.DUE_DAYS || 7,
                C_CODE: mainBill.C_CODE
            },
            party: {
                name: partyInfo.name,
                place: partyInfo.place || '',
                address: partyInfo.address || '',
                gstNo: partyInfo.gstNo || ''
            },
            sm: smInfo,
            details: transformedItems.map(item => ({
                I_CODE: item.item,
                CODE: item.item, // Include both for compatibility
                ITEM_CODE: item.itemCode, // Separate ITEM CODE field
                ITEM_NAME: item.originalItemName, // Original ITEM NAME from PMPL
                QTY: parseFloat(item.qty) || 0,
                RATE: parseFloat(item.rate) || 0,
                AMOUNT: parseFloat(item.amount) || 0,
                NET_AMOUNT: parseFloat(item.netAmount) || 0,
                AMT10: parseFloat(item.amount) || 0,
                NET10: parseFloat(item.netAmount) || 0,
                UNIT: item.unit, // Original unit from PMPL
                BILLDTL_UNIT: item.billdtlUnit, // Unit from BILLDTL for reference
                GODOWN: item.godown,
                GDN_CODE: item.godown,
                GST: parseFloat(item.gst) || 0,
                CESS: parseFloat(item.cess) || 0,
                CESS_RS: parseFloat(item.cess) || 0,
                SCH_RS: parseFloat(item.schRs) || 0,
                SCHEME: parseFloat(item.schRs) || 0,
                SCH: parseFloat(item.sch) || 0,
                DISCOUNT: parseFloat(item.sch) || 0,
                CD: parseFloat(item.cd) || 0,
                CASH_DIS: parseFloat(item.cd) || 0,
                MRP: parseFloat(item.mrp) || 0,
                PACK: item.pack || '',
                PRODUCT: item.itemName,
                productInfo: {
                    name: item.itemName,
                    unit: item.unit,
                    brand: ''
                }
            }))
        };

        return res.json({ success: true, data });

    } catch (error) {
        console.error('Error fetching bill details:', error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({
                success: false,
                message: 'Required data files not found'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch bill details'
        });
    }
});

// Route to update old bills with direct DBF merging
router.post('/update-old-bill', async (req, res) => {
    const { 
        series, 
        billNumber, 
        date, 
        cash, 
        party, 
        partyName, 
        sm, 
        smName, 
        ref, 
        dueDays, 
        items, 
        total, 
        originalBill, 
        originalDetails 
    } = req.body;

    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH environment variable not set.' });
        }

        const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'bill.json');
        const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json');

        // Read current data
        const billData = JSON.parse(await fs.readFile(billPath, 'utf8'));
        const billdtlData = JSON.parse(await fs.readFile(billdtlPath, 'utf8'));

        // Find and update the main bill record
        const billIndex = billData.findIndex(bill => 
            bill.SERIES === series && bill.BILL.toString() === billNumber.toString()
        );

        if (billIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // Update the main bill record
        const updatedBill = {
            ...billData[billIndex],
            DATE: date,
            CASH: cash,
            C_CODE: party,
            AMOUNT: parseFloat(total) || 0,
            // Add any other fields that need updating
        };

        billData[billIndex] = updatedBill;

        // Remove existing bill detail records for this bill
        const filteredBilldtlData = billdtlData.filter(detail => 
            !(detail.SERIES === series && detail.BILL.toString() === billNumber.toString())
        );

        // Add updated bill detail records
        const newBillDetails = items
            .filter(item => item.item && item.qty) // Only include items with data
            .map((item, index) => ({
                SERIES: series,
                BILL: parseInt(billNumber),
                SR: index + 1,
                I_CODE: item.item,
                QTY: parseFloat(item.qty) || 0,
                RATE: parseFloat(item.rate) || 0,
                AMOUNT: parseFloat(item.amount) || 0,
                // Add other required fields based on your DBF structure
                GODOWN: item.godown || '',
                UNIT: item.unit || '',
                GST: parseFloat(item.gst) || 0,
                CESS: parseFloat(item.cess) || 0,
                SCH_RS: parseFloat(item.schRs) || 0,
                SCH: parseFloat(item.sch) || 0,
                CD: parseFloat(item.cd) || 0,
                NET_AMOUNT: parseFloat(item.netAmount) || 0
            }));

        const updatedBilldtlData = [...filteredBilldtlData, ...newBillDetails];

        // Write updated data back to JSON files
        await fs.writeFile(billPath, JSON.stringify(billData, null, 2));
        await fs.writeFile(billdtlPath, JSON.stringify(updatedBilldtlData, null, 2));

        // Sync JSON changes back to DBF files
        try {
            const dbfSync = new DbfSync(DBF_FOLDER_PATH);
            const syncResult = await dbfSync.syncBillAndBillDtl();
            console.log(`DBF sync result:`, syncResult);
        } catch (syncError) {
            console.error('Error syncing to DBF files:', syncError);
            // Continue execution - JSON files are updated even if DBF sync fails
        }

        console.log(`Successfully updated old bill ${series}-${billNumber}`);

        res.json({
            success: true,
            message: 'Old bill updated successfully and merged to DBF files',
            billId: `${series}-${billNumber}`
        });

    } catch (error) {
        console.error('Error updating old bill:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update old bill',
            error: error.message
        });
    }
});

// Save edited bill data to edit.json
router.post('/save-edit', async (req, res) => {
    try {
        const { series, billNo, editData } = req.body;
        
        if (!series || !billNo || !editData) {
            return res.status(400).json({ 
                success: false, 
                message: 'Series, billNo, and editData are required' 
            });
        }

        const editJsonPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'edit.json');
        
        // Read existing edit.json or create empty array
        let editJsonData = [];
        try {
            const editJsonContent = await fs.readFile(editJsonPath, 'utf8');
            editJsonData = JSON.parse(editJsonContent);
        } catch (error) {
            // File doesn't exist, start with empty array
            editJsonData = [];
        }

        // Remove any existing edit for this bill
        editJsonData = editJsonData.filter(item => 
            !(item.series === series && item.billNo.toString() === billNo.toString())
        );

        // Add the new edit data
        const editEntry = {
            series,
            billNo: billNo.toString(),
            editData,
            timestamp: new Date().toISOString()
        };
        
        editJsonData.push(editEntry);

        // Save to edit.json
        await fs.writeFile(editJsonPath, JSON.stringify(editJsonData, null, 2));

        res.json({
            success: true,
            message: 'Edit data saved successfully',
            editEntry
        });

    } catch (error) {
        console.error('Error saving edit data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save edit data',
            error: error.message 
        });
    }
});

// Apply edits from edit.json to DBF files
router.post('/apply-edits/:series/:billNo', async (req, res) => {
    try {
        const { series, billNo } = req.params;
        
        const editJsonPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'edit.json');
        const billPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'bill.json');
        const billdtlPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'BILLDTL.json');

        // Read edit.json
        let editJsonData = [];
        try {
            const editJsonContent = await fs.readFile(editJsonPath, 'utf8');
            editJsonData = JSON.parse(editJsonContent);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                message: 'No edit data found' 
            });
        }

        // Find the edit for this bill
        const editEntry = editJsonData.find(item => 
            item.series === series && item.billNo.toString() === billNo.toString()
        );

        if (!editEntry) {
            return res.status(404).json({ 
                success: false, 
                message: 'No edit found for this bill' 
            });
        }

        const editData = editEntry.editData;

        // Read current bill and billdtl data
        const billData = JSON.parse(await fs.readFile(billPath, 'utf8'));
        const billdtlData = JSON.parse(await fs.readFile(billdtlPath, 'utf8'));

        // Find and update the bill header
        const billIndex = billData.findIndex(bill => 
            bill.SERIES === series && bill.BILL.toString() === billNo.toString()
        );

        if (billIndex !== -1) {
            // Update bill header fields
            billData[billIndex] = {
                ...billData[billIndex],
                DATE: editData.date || billData[billIndex].DATE,
                C_CODE: editData.party || billData[billIndex].C_CODE,
                SM_CODE: editData.sm || billData[billIndex].SM_CODE,
                REF: editData.ref || billData[billIndex].REF,
                DUE_DAYS: editData.dueDays || billData[billIndex].DUE_DAYS,
                CASH: editData.cash || billData[billIndex].CASH,
                N_B_AMT: parseFloat(editData.total) || billData[billIndex].N_B_AMT
            };
        }

        // Remove existing bill detail records for this bill
        const filteredBilldtlData = billdtlData.filter(detail => 
            !(detail.SERIES === series && detail.BILL.toString() === billNo.toString())
        );

        // Add updated bill detail records from edit data
        const newBillDetails = editData.items
            .filter(item => item.item && item.qty) // Only include items with data
            .map((item, index) => ({
                SERIES: series,
                BILL: parseInt(billNo),
                SR: index + 1,
                DATE: editData.date,
                CODE: item.item,
                I_CODE: item.item,
                QTY: parseFloat(item.qty) || 0,
                RATE: parseFloat(item.rate) || 0,
                AMOUNT: parseFloat(item.amount) || 0,
                AMT10: parseFloat(item.amount) || 0,
                NET_AMOUNT: parseFloat(item.netAmount) || 0,
                NET10: parseFloat(item.netAmount) || 0,
                GODOWN: item.godown || '',
                GDN_CODE: item.godown || '',
                UNIT: item.unit || '',
                GST: parseFloat(item.gst) || 0,
                CESS: parseFloat(item.cess) || 0,
                CESS_RS: parseFloat(item.cess) || 0,
                SCH_RS: parseFloat(item.schRs) || 0,
                SCHEME: parseFloat(item.schRs) || 0,
                SCH: parseFloat(item.sch) || 0,
                DISCOUNT: parseFloat(item.sch) || 0,
                CD: parseFloat(item.cd) || 0,
                CASH_DIS: parseFloat(item.cd) || 0,
                MRP: parseFloat(item.mrp) || 0,
                PACK: item.pack || '',
                PRODUCT: item.itemName || ''
            }));

        const updatedBilldtlData = [...filteredBilldtlData, ...newBillDetails];

        // Write updated data back to JSON files
        await fs.writeFile(billPath, JSON.stringify(billData, null, 2));
        await fs.writeFile(billdtlPath, JSON.stringify(updatedBilldtlData, null, 2));

        // Sync JSON changes back to DBF files
        try {
            const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH || path.join(__dirname, '..', '..', 'd01-2324');
            const dbfSync = new DbfSync(DBF_FOLDER_PATH);
            const syncResult = await dbfSync.syncBillAndBillDtl();
            console.log(`DBF sync result:`, syncResult);
        } catch (syncError) {
            console.error('Error syncing to DBF files:', syncError);
            // Continue execution - JSON files are updated even if DBF sync fails
        }

        // Remove the applied edit from edit.json
        const remainingEdits = editJsonData.filter(item => 
            !(item.series === series && item.billNo.toString() === billNo.toString())
        );
        await fs.writeFile(editJsonPath, JSON.stringify(remainingEdits, null, 2));

        console.log(`Successfully applied edits for bill ${series}-${billNo}`);

        res.json({
            success: true,
            message: 'Edits applied successfully to DBF files',
            updatedBill: billData[billIndex],
            updatedDetails: newBillDetails
        });

    } catch (error) {
        console.error('Error applying edits:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to apply edits',
            error: error.message 
        });
    }
});

// Get edit data for a specific bill
router.get('/get-edit/:series/:billNo', async (req, res) => {
    try {
        const { series, billNo } = req.params;
        
        const editJsonPath = path.join(__dirname, '..', '..', 'd01-2324', 'data', 'json', 'edit.json');
        
        let editJsonData = [];
        try {
            const editJsonContent = await fs.readFile(editJsonPath, 'utf8');
            editJsonData = JSON.parse(editJsonContent);
        } catch (error) {
            return res.json({ 
                success: true, 
                editData: null,
                message: 'No edit data found' 
            });
        }

        // Find the edit for this bill
        const editEntry = editJsonData.find(item => 
            item.series === series && item.billNo.toString() === billNo.toString()
        );

        res.json({
            success: true,
            editData: editEntry ? editEntry.editData : null,
            timestamp: editEntry ? editEntry.timestamp : null
        });

    } catch (error) {
        console.error('Error getting edit data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get edit data',
            error: error.message 
        });
    }
});

// Manual DBF synchronization endpoint
router.post('/sync-dbf', async (req, res) => {
    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ 
                success: false,
                message: 'DBF_FOLDER_PATH environment variable not set.' 
            });
        }

        const dbfSync = new DbfSync(DBF_FOLDER_PATH);
        const syncResult = await dbfSync.syncBillAndBillDtl();

        console.log('Manual DBF sync completed:', syncResult);

        res.json({
            success: true,
            message: 'DBF files synchronized successfully',
            ...syncResult
        });

    } catch (error) {
        console.error('Error during manual DBF sync:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to synchronize DBF files',
            error: error.message
        });
    }
});

module.exports = router;