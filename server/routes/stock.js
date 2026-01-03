const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
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

async function calculateStockAsOf(targetDateStr) {
  const salesData = await getSTOCKFILE('billdtl.json');
  const purchaseData = await getSTOCKFILE('purdtl.json');
  const transferData = await getSTOCKFILE('transfer.json');
  const stock = {};
  const target = moment(targetDateStr, ['DD-MM-YYYY', 'YYYY-MM-DD'], true);
  if (!target.isValid()) {
    throw new Error('Invalid date format. Use DD-MM-YYYY');
  }
  for (const purchase of purchaseData) {
    if (!purchase.DATE) continue;
    const pDate = moment(purchase.DATE, ['DD-MM-YYYY','YYYY-MM-DD']);
    if (!pDate.isValid() || pDate.isAfter(target)) continue;
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn, UNIT_NO: unitNo } = purchase;
    stock[code] = stock[code] || {};
    stock[code][gdn] = stock[code][gdn] || 0;
    let qtyInPieces = qty;
    const isBox = unit === 'BOX' || unit === 'Box' || unitNo === 2;
    if (isBox) qtyInPieces *= (multF || 1);
    stock[code][gdn] += qtyInPieces;
    if (free) stock[code][gdn] += free;
  }
  for (const sale of salesData) {
    if (!sale.DATE) continue;
    const sDate = moment(sale.DATE, ['DD-MM-YYYY','YYYY-MM-DD']);
    if (!sDate.isValid() || sDate.isAfter(target)) continue;
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn, UNIT_NO: unitNo, SERIES } = sale;
    stock[code] = stock[code] || {};
    stock[code][gdn] = stock[code][gdn] || 0;
    let qtyInPieces = qty;
    const isBox = unit === 'BOX' || unit === 'Box' || unitNo === 2;
    if (isBox) qtyInPieces *= (multF || 1);
    const freeQty = free || 0;
    const seriesCode = String(SERIES || '').toUpperCase();
    if (seriesCode === 'S') {
      stock[code][gdn] += qtyInPieces + freeQty; // sales return
    } else if (seriesCode === 'P') {
      stock[code][gdn] -= qtyInPieces + freeQty; // purchase return
    } else {
      stock[code][gdn] -= qtyInPieces + freeQty; // normal sale
    }
  }
  for (const transfer of transferData) {
    const tDate = moment(transfer.DATE, ['DD-MM-YYYY','YYYY-MM-DD'], true);
    if (tDate.isValid() && tDate.isAfter(target)) continue;
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, TRF_TO: toGdn, GDN_CODE: fromGdn, UNIT_NO: unitNo } = transfer;
    const qtyInPieces = (unit === 'BOX' || unit === 'Box' || unitNo === 2) ? qty * (multF || 1) : qty;
    stock[code] = stock[code] || {};
    stock[code][fromGdn] = stock[code][fromGdn] || 0;
    stock[code][toGdn] = stock[code][toGdn] || 0;
    if (qtyInPieces > 0) {
      stock[code][fromGdn] -= qtyInPieces;
      stock[code][toGdn] += qtyInPieces;
    } else if (qtyInPieces < 0) {
      const inQty = Math.abs(qtyInPieces);
      stock[code][fromGdn] += inQty;
      stock[code][toGdn] -= inQty;
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

router.get('/api/stock-as-of', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date query parameter is required (DD-MM-YYYY).' });
    }
    const stock = await calculateStockAsOf(String(date));
    return res.json(stock);
  } catch (err) {
    console.error('Error calculating stock-as-of:', err);
    res.status(500).json({ error: 'Failed to calculate stock as of date' });
  }
});

function formatDateLocal(dateInput) {
  const d = moment(String(dateInput), ['DD-MM-YYYY','YYYY-MM-DD'], true);
  return d.format('YYYY-MM-DD');
}

async function stockAsOfItem(dateStr, itemCode, godownCode) {
  const billDtl = await getSTOCKFILE('billdtl.json');
  const purDtl = await getSTOCKFILE('purdtl.json');
  const transfer = await getSTOCKFILE('transfer.json');
  const startDate = moment(dateStr, ['DD-MM-YYYY','YYYY-MM-DD'], true);
  if (!startDate.isValid()) throw new Error('Invalid date');
  const asOfStr = formatDateLocal(dateStr);
  const code = String(itemCode || '').trim().toUpperCase();
  const gdn = Number(godownCode);
  let purchases=0, sales=0, salesReturn=0, purReturn=0, trIn=0, trOut=0;
  for (const p of purDtl) {
    const pStr = formatDateLocal(p.DATE);
    if (String(p.CODE).toUpperCase()===code && Number(p.GDN_CODE)===gdn && pStr < asOfStr) {
      let qty = parseFloat(p.QTY)||0;
      const multF = parseFloat(p.MULT_F)||1;
      const unit = String(p.UNIT||'').toUpperCase();
      const free = parseFloat(p.FREE)||0;
      const pcs = unit==='BOX' ? qty*multF : qty;
      purchases += pcs + (free>0?free:0);
    }
  }
  for (const b of billDtl) {
    const bStr = formatDateLocal(b.DATE);
    if (String(b.CODE).toUpperCase()===code && Number(b.GDN_CODE)===gdn && bStr < asOfStr) {
      let qty = parseFloat(b.QTY)||0;
      const multF = parseFloat(b.MULT_F)||1;
      const unit = String(b.UNIT||'').toUpperCase();
      const free = parseFloat(b.FREE)||0;
      const pcs = unit==='BOX' ? qty*multF : qty;
      const series = String(b.SERIES||'').toUpperCase();
      if (series==='S') salesReturn += pcs + (free>0?free:0);
      else if (series==='P') purReturn += pcs + (free>0?free:0);
      else sales += pcs + (free>0?free:0);
    }
  }
  for (const t of transfer) {
    const tStr = formatDateLocal(t.DATE);
    if (String(t.CODE).toUpperCase()===code && Number(t.GDN_CODE)===gdn && tStr < asOfStr) {
      const multF = parseFloat(t.MULT_F)||1;
      const unit = String(t.UNIT||'').toUpperCase();
      const qty = parseFloat(t.QTY)||0;
      const pcs = unit==='BOX' ? qty*multF : qty;
      if (pcs>0) trOut += pcs;
      else if (pcs<0) trIn += Math.abs(pcs);
    }
  }
  const opening = Math.round(purchases - purReturn + salesReturn + trIn - sales - trOut);
  let dPurch=0, dSales=0, dSR=0, dPR=0, dIn=0, dOut=0;
  for (const p of purDtl) {
    const pStr = formatDateLocal(p.DATE);
    if (String(p.CODE).toUpperCase()===code && Number(p.GDN_CODE)===gdn && pStr === asOfStr) {
      const multF = parseFloat(p.MULT_F)||1;
      const unit = String(p.UNIT||'').toUpperCase();
      const qty = parseFloat(p.QTY)||0;
      const free = parseFloat(p.FREE)||0;
      const pcs = unit==='BOX' ? qty*multF : qty;
      dPurch += pcs + (free>0?free:0);
    }
  }
  for (const b of billDtl) {
    const bStr = formatDateLocal(b.DATE);
    if (String(b.CODE).toUpperCase()===code && Number(b.GDN_CODE)===gdn && bStr === asOfStr) {
      const multF = parseFloat(b.MULT_F)||1;
      const unit = String(b.UNIT||'').toUpperCase();
      const qty = parseFloat(b.QTY)||0;
      const free = parseFloat(b.FREE)||0;
      const pcs = unit==='BOX' ? qty*multF : qty;
      const series = String(b.SERIES||'').toUpperCase();
      if (series==='S') dSR += pcs + (free>0?free:0);
      else if (series==='P') dPR += pcs + (free>0?free:0);
      else dSales += pcs + (free>0?free:0);
    }
  }
  for (const t of transfer) {
    const tStr = formatDateLocal(t.DATE);
    if (String(t.CODE).toUpperCase()===code && Number(t.GDN_CODE)===gdn && tStr === asOfStr) {
      const multF = parseFloat(t.MULT_F)||1;
      const unit = String(t.UNIT||'').toUpperCase();
      const qty = parseFloat(t.QTY)||0;
      const pcs = unit==='BOX' ? qty*multF : qty;
      if (pcs>0) dOut += pcs;
      else if (pcs<0) dIn += Math.abs(pcs);
    }
  }
  const balance = Math.round(opening + dPurch + dSR + dIn - dSales - dPR - dOut);
  return { opening, balance };
}

router.get('/api/stock-as-of-item', async (req, res) => {
  try {
    const { date, itemCode, godownCode } = req.query;
    if (!date || !itemCode || !godownCode) {
      return res.status(400).json({ error: 'date, itemCode, godownCode are required' });
    }
    const result = await stockAsOfItem(String(date), String(itemCode), String(godownCode));
    res.json(result);
  } catch (err) {
    console.error('Error calculating stock-as-of-item:', err);
    res.status(500).json({ error: 'Failed to calculate item stock as of date' });
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
            if (totalStockPcs <= 0) continue;

            const pmplItem = pmplData.find(p => p.CODE === code);
            if (pmplItem) {
                const multF = pmplItem.MULT_F || 1;
                const stockInBoxes = Math.floor(totalStockPcs / multF);

                if (stockInBoxes > 0) {
                    boxStockItems.push({
                        code: pmplItem.CODE,
                        name: `[${pmplItem.CODE}] ${pmplItem.PRODUCT.replace(/,/g, '')} {${pmplItem.MRP1 || 'N/A'}}`,
                        stock: stockInBoxes
                    });
                }
            }
        }
      }

      boxStockItems.sort((a, b) => a.code.localeCompare(b.code));
      const itemNames = boxStockItems.map(item => item.name).join(',');
      const stockValues = boxStockItems.map(item => item.stock).join(',');
      
      const d = new Date();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;
      const csvContent = `Date,ITEMS:,${itemNames}\n${formattedDate},OPENING:,${stockValues}`;
      
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
            if (totalStockPcs <= 0) continue;

            const pmplItem = pmplData.find(p => p.CODE === code);
            if (pmplItem) {
                const multF = pmplItem.MULT_F || 1;
                const stockInBoxes = Math.floor(totalStockPcs / multF);
                if (stockInBoxes > 0) {
                    const name = `[${pmplItem.CODE}] ${pmplItem.PRODUCT.replace(/,/g, '')} {${pmplItem.MRP1 || 'N/A'}}`;
                    currentBoxStockMap[name] = stockInBoxes;
                }
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

router.post('/api/calculate-next-day-stock', async (req, res) => {
    try {
        const { nextdate, gdnCode: transferGdn, transferItems } = req.body;
        if (!nextdate) {
            return res.status(400).json({ error: 'nextdate query parameter is required.' });
        }

        const activeGodowns = await getActiveGodowns();
        const results = {
            success: [],
            errors: []
        };

        const [day, month, year] = nextdate.split('-').map(Number);
        const prevDate = new Date(year, month - 1, day);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = formatDateToDDMMYYYY(prevDate);
        
        const billsDeliveryStatePath = path.join(__dirname, '..', 'db', 'BillsDeliveryRegister.json');
        const registerData = await fs.readFile(billsDeliveryStatePath, 'utf8');
        const register = JSON.parse(registerData);

        const pmplData = await getSTOCKFILE('pmpl.json');
        const pmplMap = new Map(pmplData.map(p => [p.CODE, p]));


        for (const gdnCode of activeGodowns) {
            await updateStockItemsCsv(gdnCode);
            
            const dailyStockCsvPath = path.join(__dirname, '..', 'db', `daily_stock_${gdnCode}.csv`);
            let csvData;
            try {
                csvData = await fs.readFile(dailyStockCsvPath, 'utf8');
            } catch (error) {
                if (error.code === 'ENOENT') {
                    const errorMsg = `Godown ${gdnCode}: Stock file does not exist. Run initial generation.`;
                    results.errors.push({ gdnCode, message: errorMsg });
                    console.log(`Skipping godown ${gdnCode}: daily_stock_ file does not exist.`);
                    continue;
                }
                throw error;
            }

            let lines = csvData.trim().split('\n').filter(line => line.trim() !== '');
            if (lines.length > 1) {
                const lastLine = lines[lines.length - 1];
                const lastLineData = lastLine.split(',');
                const lastDateInFileStr = lastLineData[0];
                const lastDateType = lastLineData[1];

                if (lastDateType === 'OPENING:') {
                    const lastOpeningDate = moment(lastDateInFileStr, 'DD-MM-YYYY');
                    const dateFromUI = moment(nextdate, 'DD-MM-YYYY');

                    const canOverwrite = dateFromUI.isSame(lastOpeningDate, 'day');
                    const isNextDay = dateFromUI.isSame(lastOpeningDate.clone().add(1, 'days'), 'day');
                    
                    if (!canOverwrite && !isNextDay) {
                        const errorMessage = `Date mismatch for Godown ${gdnCode}. Last opening stock is for ${lastOpeningDate.format('DD-MM-YYYY')}. You must select either ${lastOpeningDate.subtract(1, 'days').format('DD-MM-YYYY')} to overwrite or ${lastOpeningDate.clone().add(1, 'days').format('DD-MM-YYYY')} for the next closing.\n\n`;
                        results.errors.push({ gdnCode, message: errorMessage });
                        continue;
                    }
                }
            }

            const deliveredBillKeys = register
                .filter(entry => entry.picked_date === prevDateStr && (entry.status === 'PICKED' || entry.status === 'DELIVERED'))
                .map(entry => entry.key);
            
            const itemWiseSalesByCode = await calculateItemWiseSales(deliveredBillKeys, gdnCode);
            const itemWisePurchasesByCode = await calculateItemWisePurchases(prevDateStr, gdnCode);
            
            let itemWiseTransfersByCode = {};
            if (gdnCode === transferGdn && transferItems && transferItems.length > 0) {
                for (const item of transferItems) {
                    const pmplItem = pmplMap.get(item.code);
                    const multF = pmplItem ? (pmplItem.MULT_F || 1) : 1;
                    itemWiseTransfersByCode[item.code] = (itemWiseTransfersByCode[item.code] || 0) + (item.qty * multF);
                }
            }
            
            lines = lines.filter(line => {
                const isPrevDateSummary = line.startsWith(prevDateStr) && 
                                          (line.includes('total purchase') || 
                                           line.includes('total sales') || 
                                           line.includes('transfer to retail'));
                const isNextDateOpening = line.startsWith(nextdate) && line.includes('OPENING:');
                return !isPrevDateSummary && !isNextDateOpening;
            });

            const header = lines[0].split(',');
            const itemsInCsv = header.slice(2);

            let prevDayOpeningRowIndex = -1;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i].startsWith(prevDateStr + ',') && lines[i].includes('OPENING:')) {
                    prevDayOpeningRowIndex = i;
                    break;
                }
            }
            
            if (prevDayOpeningRowIndex === -1) {
                console.log(`No opening stock data for previous day (${prevDateStr}) in godown ${gdnCode}, skipping.`);
                results.errors.push({gdnCode, message: `Godown ${gdnCode}: No opening stock found for ${prevDateStr}.`})
                continue;
            }
            const lastStockLine = lines[prevDayOpeningRowIndex].split(',');

            const lastOpeningStockInBoxes = {};
            itemsInCsv.forEach((item, index) => {
                lastOpeningStockInBoxes[item] = parseInt(lastStockLine[index + 2] || '0', 10);
            });
            
            const purchaseValuesInBoxes = {};
            const salesValuesInBoxes = {};
            const transferValuesInBoxes = {};

            itemsInCsv.forEach(item => {
                const codeMatch = item.match(/\[(.*?)\]/);
                const code = codeMatch ? codeMatch[1] : null;
                const pmplItem = code ? pmplMap.get(code) : null;

                if (pmplItem) {
                    const multF = pmplItem.MULT_F || 1;
                    
                    const soldQtyInPieces = itemWiseSalesByCode[code] || 0;
                    salesValuesInBoxes[item] = Math.floor(soldQtyInPieces / multF);
                    
                    const purchasedQtyInPieces = itemWisePurchasesByCode[code] || 0;
                    purchaseValuesInBoxes[item] = Math.floor(purchasedQtyInPieces / multF);
                    
                    const transferredQtyInPieces = itemWiseTransfersByCode[code] || 0;
                    transferValuesInBoxes[item] = Math.floor(transferredQtyInPieces / multF);
                } else {
                    purchaseValuesInBoxes[item] = 0;
                    salesValuesInBoxes[item] = 0;
                    transferValuesInBoxes[item] = 0;
                }
            });

            const purchaseRowArr = [prevDateStr, 'total purchase'];
            const salesRowArr = [prevDateStr, 'total sales'];
            const transferRowArr = [prevDateStr, 'transfer to retail'];
            itemsInCsv.forEach(item => {
                purchaseRowArr.push(purchaseValuesInBoxes[item] || 0);
                salesRowArr.push(salesValuesInBoxes[item] || 0);
                transferRowArr.push(transferValuesInBoxes[item] || 0);
            });
            const summaryRows = [
                purchaseRowArr.join(','),
                salesRowArr.join(','),
                transferRowArr.join(',')
            ];

            const newOpeningStockValues = {};
            itemsInCsv.forEach(item => {
                newOpeningStockValues[item] = (lastOpeningStockInBoxes[item] || 0) + 
                                              (purchaseValuesInBoxes[item] || 0) -
                                              (salesValuesInBoxes[item] || 0) -
                                              (transferValuesInBoxes[item] || 0);
            });

            const newStockRowArr = [nextdate, 'OPENING:'];
            itemsInCsv.forEach(item => {
                newStockRowArr.push(newOpeningStockValues[item] || 0);
            });
            const newStockRow = newStockRowArr.join(',');

            lines.splice(prevDayOpeningRowIndex + 1, 0, ...summaryRows);
            lines.push(newStockRow);

            await fs.writeFile(dailyStockCsvPath, lines.join('\n') + '\n');
            results.success.push({ gdnCode, message: `Godown ${gdnCode}: Stock updated for ${nextdate}.` });
        }
        
        if (results.errors.length > 0) {
            const errorMessage = results.errors.map(e => e.message).join('\n');
            // Use status 400 to indicate a client-side error (invalid date), but include details of successes.
            return res.status(400).json({
                message: errorMessage,
                details: results
            });
        }

        res.json({ message: `Successfully calculated and appended stock for ${nextdate} for all active godowns.`, details: results });

    } catch (error) {
        console.error('Error calculating next day stock:', error);
        res.status(500).json({ error: 'Failed to calculate next day stock' });
    }
});

module.exports = router;
