const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getSTOCKFILE } = require('./utilities');
require('dotenv').config();

function formatDateToDDMMYYYY(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

async function getActiveGodowns() {
    const godowns = await getSTOCKFILE('godown.json');
    return godowns.filter(g => g.ACTIVE === 'Y').map(g => g.GDN_CODE);
}

let cachedStock = null;
let cachedStockHash = null;
let lastFileModTimes = {}; // Store last modification times of files

async function getFileModificationTimes() {
  const files = [
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json'),
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'purdtl.json'),
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'transfer.json'),
    path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'pmpl.json'),
    path.join(__dirname, '..', 'db', 'godown.json')
  ];
  
  const modTimes = {};
  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      modTimes[file] = stats.mtime.getTime();
    } catch (error) {
      console.error(`Error getting modification time for ${file}:`, error);
      modTimes[file] = Date.now();
    }
  }
  
  return modTimes;
}

async function haveFilesChanged(newModTimes) {
  if (Object.keys(lastFileModTimes).length === 0) return true;
  for (const file in newModTimes) {
    if (!lastFileModTimes[file] || lastFileModTimes[file] !== newModTimes[file]) {
      return true;
    }
  }
  return false;
}

async function calculateCurrentStock() {
  const salesData = await getSTOCKFILE('billdtl.json');
  const purchaseData = await getSTOCKFILE('purdtl.json');
  const transferData = await getSTOCKFILE('transfer.json');
  const pmplData = await getSTOCKFILE('pmpl.json');
  const godownData = await getSTOCKFILE('godown.json');

  const stock = {};

  for (const purchase of purchaseData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = purchase;
    stock[code] = stock[code] || {};
    stock[code][gdn] = stock[code][gdn] || 0;
    
    let qtyInPieces = qty;
    if (unit === 'BOX' || unit === 'Box') {
      qtyInPieces *= multF;
    }
    stock[code][gdn] += qtyInPieces;
    if (free) stock[code][gdn] += free;
  }

  for (const sale of salesData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = sale;
    if (!stock[code]) stock[code] = {};
    if (!stock[code][gdn]) stock[code][gdn] = 0;
    
    let qtyInPieces = qty;
    if (unit === 'BOX' || unit === 'Box') {
      qtyInPieces *= multF;
    }
    stock[code][gdn] -= qtyInPieces;
    if (free) stock[code][gdn] -= free;
  }

  for (const transfer of transferData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, TRF_TO: toGdn, GDN_CODE: fromGdn } = transfer;
    const qtyInPieces = (unit === 'BOX' || unit === 'Box') ? qty * multF : qty;
    
    stock[code] = stock[code] || {};
    stock[code][fromGdn] = stock[code][fromGdn] || 0;
    stock[code][toGdn] = stock[code][toGdn] || 0;
    
    stock[code][fromGdn] -= qtyInPieces;
    stock[code][toGdn] += qtyInPieces;
  }

  const localTransferResponse = (await fs.readFile(path.join(__dirname, '..', 'db', 'godown.json'), 'utf8')) || '[]';
  const localTransferData = JSON.parse(localTransferResponse);

  for (const transfer of localTransferData) {
    const { fromGodown, toGodown, items } = transfer;
    if (!items) continue;
    for (const item of items) {
      const { code, qty, unit } = item;
      const multF = pmplData.find((pmpl) => pmpl.CODE === code)?.MULT_F || 1;
      const qtyInPieces = (unit === 'BOX' || unit === 'Box') ? qty * multF : qty;
      
      stock[code] = stock[code] || {};
      stock[code][fromGodown] = stock[code][fromGodown] || 0;
      stock[code][toGodown] = stock[code][toGodown] || 0;
      
      stock[code][fromGodown] -= qtyInPieces;
      stock[code][toGodown] += qtyInPieces;
    }
  }

  for (const code in stock) {
    for (const gdn in stock[code]) {
      stock[code][gdn] = Math.round(stock[code][gdn]);
    }
  }

  return stock;
}

router.get('/api/stock', async (req, res) => {
  try {
    const clientHash = req.headers['if-none-match'] || req.query.hash;
    
    const currentFileModTimes = await getFileModificationTimes();
    const filesHaveChanged = await haveFilesChanged(currentFileModTimes);
    
    if (cachedStock && cachedStockHash && !filesHaveChanged) {
      if (clientHash && (clientHash === cachedStockHash || clientHash === `"${cachedStockHash}"`)) {
        return res.status(304).set({'ETag': `"${cachedStockHash}"`}).send('Not Modified');
      }
      return res.set({'ETag': `"${cachedStockHash}"`}).json(cachedStock);
    }
    
    const stock = await calculateCurrentStock();
    const currentHash = require('crypto').createHash('md5').update(JSON.stringify(stock)).digest('hex');
    
    cachedStock = stock;
    cachedStockHash = currentHash;
    lastFileModTimes = currentFileModTimes;
    
    res.set({'ETag': `"${currentHash}"`});
    
    if (clientHash && (clientHash === currentHash || clientHash === `"${currentHash}"`)) {
      return res.status(304).send('Not Modified');
    }
    
    return res.json(stock);
  } catch (err) {
    console.error('Error calculating stock:', err);
    res.status(500).json({ error: 'Failed to calculate stock' });
  }
});

router.get('/api/generate-initial-stock-csvs', async (req, res) => {
  try {
    console.log('Generating initial godown-wise stock CSVs...');
    const stock = await calculateCurrentStock();
    const pmplData = await getSTOCKFILE('pmpl.json');
    const activeGodowns = await getActiveGodowns();
    const createdFiles = [];

    for (const gdnCode of activeGodowns) {
      const dailyStockCsvPath = path.join(__dirname, '..', 'db', `daily_stock_${gdnCode}.csv`);
      
      try {
        await fs.access(dailyStockCsvPath);
        console.log(`CSV for godown ${gdnCode} already exists. Skipping.`);
        continue;
      } catch (error) {
        // File does not exist, proceed to create it
      }
      
      const boxStockItems = [];
      for (const code in stock) {
        if (stock[code][gdnCode]) {
          const totalStockPcs = stock[code][gdnCode];
          const pmplItem = pmplData.find(p => p.CODE === code);
          if (pmplItem && pmplItem.MULT_F > 1 && totalStockPcs > pmplItem.MULT_F) {
            boxStockItems.push({
              name: pmplItem.PRODUCT.replace(/,/g, ''),
              stock: Math.floor(totalStockPcs / pmplItem.MULT_F)
            });
          }
        }
      }

      boxStockItems.sort((a, b) => a.name.localeCompare(b.name));
      const itemNames = boxStockItems.map(item => item.name).join(',');
      const stockValues = boxStockItems.map(item => item.stock).join(',');
      
      const csvContent = `Date,ITEMS:,${itemNames}\n${formatDateToDDMMYYYY(new Date())},OPENING:,${stockValues}`;
      
      await fs.writeFile(dailyStockCsvPath, csvContent + '\n');
      createdFiles.push(dailyStockCsvPath);
      console.log(`Created ${dailyStockCsvPath}`);
    }

    if (createdFiles.length === 0) {
      return res.send('All godown-wise CSV files already exist.');
    }

    res.type('text/plain').send(`Created the following files:\n${createdFiles.join('\n')}`);
  } catch (err) {
    console.error('Error generating initial stock CSVs:', err);
    res.status(500).json({ error: 'Failed to generate initial stock CSVs' });
  }
});

async function calculateItemWiseSales(billKeys, gdnCode) {
    const billdtlData = await getSTOCKFILE('billdtl.json');
    const salesByCode = {}; 

    const relevantSales = billdtlData.filter(d => d.GDN_CODE === gdnCode && billKeys.includes(d.BILL_BB));
    for (const sale of relevantSales) {
        const { CODE: code, QTY: qty, UNIT_NO: unitNo, MULT_F: multF } = sale;
        let qtyInPieces = qty;
        if (unitNo == 2 && multF) {
            qtyInPieces = qty * multF;
        }
        salesByCode[code] = (salesByCode[code] || 0) + qtyInPieces;
    }
    return salesByCode;
}

async function calculateItemWisePurchases(dateStr, gdnCode) {
    const purdtlData = await getSTOCKFILE('purdtl.json');
    const purchasesByCode = {};

    const relevantPurchases = purdtlData.filter(p => p.GDN_CODE === gdnCode && p.DATE && formatDateToDDMMYYYY(new Date(p.DATE)) === dateStr);
    for (const purchase of relevantPurchases) {
        const { CODE: code, QTY: qty, UNIT_NO: unitNo, MULT_F: multF } = purchase;
        let qtyInPieces = qty;
        if (unitNo === 2 && multF > 0) {
            qtyInPieces = qty * multF;
        }
        purchasesByCode[code] = (purchasesByCode[code] || 0) + qtyInPieces;
    }
    return purchasesByCode;
}

async function updateStockItemsCsv(gdnCode) {
    const dailyStockCsvPath = path.join(__dirname, '..', 'db', `daily_stock_${gdnCode}.csv`);
    const stock = await calculateCurrentStock();
    const pmplData = await getSTOCKFILE('pmpl.json');

    const currentBoxStockMap = {};
    for (const code in stock) {
        if (stock[code][gdnCode]) {
            const totalStockPcs = stock[code][gdnCode];
            const pmplItem = pmplData.find(p => p.CODE === code);
            if (pmplItem && pmplItem.MULT_F > 1 && totalStockPcs > pmplItem.MULT_F) {
                const name = pmplItem.PRODUCT.replace(/,/g, '');
                currentBoxStockMap[name] = Math.floor(totalStockPcs / pmplItem.MULT_F);
            }
        }
    }
    const allItemNamesFromStock = Object.keys(currentBoxStockMap).sort();

    let csvData;
    try {
        csvData = await fs.readFile(dailyStockCsvPath, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`CSV for godown ${gdnCode} not found. Run /api/generate-initial-stock-csvs first.`);
            return; 
        }
        throw error;
    }

    const lines = csvData.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return;
    
    const headerParts = lines[0].split(',');
    const existingItems = headerParts.slice(2);
    const newItems = allItemNamesFromStock.filter(item => !existingItems.includes(item));

    if (newItems.length === 0) return;
    
    console.log(`New items for godown ${gdnCode}: ${newItems.join(', ')}. Updating CSV.`);
    
    const allItems = [...existingItems, ...newItems].sort();
    const newHeaderLine = `Date,ITEMS:,${allItems.join(',')}`;
    
    const newLines = [newHeaderLine];
    const lastLine = lines[lines.length - 1].split(',');
    const lastLineData = {};
    existingItems.forEach((item, index) => {
        lastLineData[item] = lastLine[index + 2];
    });

    for (let i = 1; i < lines.length; i++) {
        const oldLineParts = lines[i].split(',');
        const newLine = [oldLineParts[0], oldLineParts[1]];
        const oldData = {};
        existingItems.forEach((item, index) => {
            oldData[item] = oldLineParts[index + 2];
        });
        
        allItems.forEach(item => {
            let value = oldData[item] || '';
            if (i === lines.length - 1 && newItems.includes(item)) {
                value = currentBoxStockMap[item] || '';
            }
            newLine.push(value);
        });
        newLines.push(newLine.join(','));
    }

    await fs.writeFile(dailyStockCsvPath, newLines.join('\n') + '\n');
    console.log(`Updated ${dailyStockCsvPath} with new items.`);
}

router.get('/api/calculate-next-day-stock', async (req, res) => {
    try {
        const { nextdate } = req.query;
        if (!nextdate) {
            return res.status(400).json({ error: 'nextdate query parameter is required.' });
        }

        const [day, month, year] = nextdate.split('-').map(Number);
        const prevDate = new Date(year, month - 1, day);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = formatDateToDDMMYYYY(prevDate);
        
        const billsDeliveryStatePath = path.join(__dirname, '..', 'db', 'BillsDeliveryRegister.json');
        const registerData = await fs.readFile(billsDeliveryStatePath, 'utf8');
        const register = JSON.parse(registerData);

        const pmplData = await getSTOCKFILE('pmpl.json');
        const nameToCodeAndMultF = {};
        pmplData.forEach(p => {
            const name = p.PRODUCT.replace(/,/g, '');
            nameToCodeAndMultF[name] = { code: p.CODE, multF: p.MULT_F || 1 };
        });

        const activeGodowns = await getActiveGodowns();
        for (const gdnCode of activeGodowns) {
            await updateStockItemsCsv(gdnCode);
            
            const deliveredBillKeys = register
                .filter(entry => entry.picked_date && formatDateToDDMMYYYY(new Date(entry.picked_date)) === prevDateStr && (entry.status === 'PICKED' || entry.status === 'DELIVERED'))
                .map(entry => entry.key);
            
            const itemWiseSalesByCode = await calculateItemWiseSales(deliveredBillKeys, gdnCode);
            const itemWisePurchasesByCode = await calculateItemWisePurchases(prevDateStr, gdnCode);
            
            const dailyStockCsvPath = path.join(__dirname, '..', 'db', `daily_stock_${gdnCode}.csv`);
            const csvData = await fs.readFile(dailyStockCsvPath, 'utf8');
            let lines = csvData.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 1) continue;

            const header = lines[0].split(',');
            const itemsInCsv = header.slice(2);

            const prevDateRowIndex = lines.findIndex(line => line.startsWith(prevDateStr + ','));
            if (prevDateRowIndex === -1) {
                console.log(`No stock data for previous day (${prevDateStr}) in godown ${gdnCode}, skipping.`);
                continue;
            }
            const lastStockLine = lines[prevDateRowIndex].split(',');

            const lastOpeningStockInBoxes = {};
            itemsInCsv.forEach((item, index) => {
                lastOpeningStockInBoxes[item] = parseInt(lastStockLine[index + 2] || '0', 10);
            });

            const newOpeningStockValues = {};
            itemsInCsv.forEach(item => {
                const itemDetails = nameToCodeAndMultF[item];
                if (itemDetails && itemDetails.multF > 0) {
                    const { code, multF } = itemDetails;
                    const soldQtyInPieces = itemWiseSalesByCode[code] || 0;
                    const purchasedQtyInPieces = itemWisePurchasesByCode[code] || 0;
                    const lastStockInBoxes = lastOpeningStockInBoxes[item] || 0;
                    
                    const lastStockInPieces = lastStockInBoxes * multF;
                    const newStockInPieces = lastStockInPieces + purchasedQtyInPieces - soldQtyInPieces;
                    newOpeningStockValues[item] = Math.floor(newStockInPieces / multF);
                } else {
                    newOpeningStockValues[item] = lastOpeningStockInBoxes[item] || 0;
                }
            });

            const nextDateObj = new Date(year, month - 1, day);
            const formattedDate = formatDateToDDMMYYYY(nextDateObj);

            const newStockRowArr = [formattedDate, 'OPENING:'];
            itemsInCsv.forEach(item => {
                newStockRowArr.push(newOpeningStockValues[item] || 0);
            });
            const newStockRow = newStockRowArr.join(',');

            const dateRowIndex = lines.findIndex(line => line.startsWith(formattedDate + ','));

            if (dateRowIndex > 0) {
                lines[dateRowIndex] = newStockRow;
            } else {
                lines.push(newStockRow);
            }

            await fs.writeFile(dailyStockCsvPath, lines.join('\n') + '\n');
        }
        
        res.json({ message: `Successfully calculated and appended stock for ${nextdate} for all active godowns.` });

    } catch (error) {
        console.error('Error calculating next day stock:', error);
        res.status(500).json({ error: 'Failed to calculate next day stock' });
    }
});

module.exports = router; 