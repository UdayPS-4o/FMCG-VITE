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

        // filter only last 30days
        const bills = JSON.parse(data);
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 7);
        const filteredBills = bills.filter(bill => {
            const billDate = new Date(bill.DATE);
            return billDate >= thirtyDaysAgo;
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
router.get('/calculate-next-day-stock', async (req, res) => {
    const { nextdate } = req.query;
    if (!nextdate) {
        return res.status(400).json({ message: 'nextdate query parameter is required.' });
    }

    try {
        const files = await fs.readdir(dbPath);
        const stockFiles = files.filter(file => file.startsWith('daily_stock_') && file.endsWith('.csv'));

        for (const file of stockFiles) {
            const filePath = path.join(dbPath, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const rows = fileContent.split('\n').filter(row => row.trim() !== '');
            
            if (rows.length < 2) continue; // Not enough data to process

            const lastRow = rows[rows.length - 1];
            const lastRowData = lastRow.split(',');
            const newRowData = [nextdate, ...lastRowData.slice(1)];
            const newRow = newRowData.join(',');

            await fs.appendFile(filePath, `\n${newRow}`);
        }

        res.json({ message: `Successfully calculated and appended stock for ${nextdate} for all active godowns.` });
    } catch (error) {
        console.error('Error calculating next day stock:', error);
        res.status(500).json({ message: 'Failed to calculate next day stock.' });
    }
});

// Route to get godown stock for printing
router.get('/godown-stock/:godownCode', async (req, res) => {
    const { godownCode } = req.params;
    const filePath = path.join(dbPath, `daily_stock_${godownCode}.csv`);

    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const rows = fileContent.split('\n').filter(row => row.trim() !== '');
        
        if (rows.length < 3) {
            return res.status(400).json({ message: 'Not enough data in the stock file.' });
        }

        const headerRow = rows[0].split(',').slice(2); // Item names
        const lastTwoRows = rows.slice(-2);
        
        const openingRow = lastTwoRows[0].split(',');
        const closingRow = lastTwoRows[1].split(',');

        const date = openingRow[0];
        const openingStocks = openingRow.slice(2);
        const closingStocks = closingRow.slice(2);

        const transposedData = headerRow.map((item, index) => ({
            date,
            item: item.trim(),
            opening: openingStocks[index] ? openingStocks[index].trim() : '0',
            closing: closingStocks[index] ? closingStocks[index].trim() : '0',
        }));

        res.json(transposedData);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ message: `Stock file for godown ${godownCode} not found.` });
        }
        console.error(`Error processing stock file for godown ${godownCode}:`, error);
        res.status(500).json({ message: 'Failed to process godown stock data.' });
    }
});

module.exports = router; 