const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const csv = require('fast-csv');
require('dotenv').config();

const billsDeliveryStatePath = path.join(__dirname, '..', 'db', 'BillsDeliveryRegister.json');
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

// Route for van loading report
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

        const billDtlData = JSON.parse(await fs.readFile(billDtlPath, 'utf8'));
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf8'));

        // Create party details map
        const partyDetailsMap = cmplData.reduce((acc, party) => {
            acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
            return acc;
        }, {});

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
        const reportData = Object.values(skuData).map(sku => ({
            sku: sku.code,
            itemName: sku.product,
            totalQtyBoxes: Math.round(sku.totalBoxes * 100) / 100,
            totalQtyPcs: Math.round(sku.totalPcs),
            // Total quantity used for heatmap intensity: boxes converted to pieces using multF + direct pieces
            totalQty: (sku.totalBoxes * (sku.multF || 1)) + sku.totalPcs,
            details: sku.details
        })).sort((a, b) => b.totalQty - a.totalQty);

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

module.exports = router;