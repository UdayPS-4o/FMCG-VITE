const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { getPartyByCode } = require('../utilities');

const router = express.Router();

// Helper to pad bill number
function padBillNumber(series, billNo) {
  // Format as "X-    Y" where X is series and Y is billNo with left padding to total 5 chars
  const combinedString = `${series}-${" ".repeat(5-`${billNo}`.length)}${billNo}`;
  return combinedString;
}

// Utility function to parse date string to Date at local midnight
function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }
    const s = String(dateInput).trim();

    // Try ISO (YYYY-MM-DD or YYYY-MM-DDTHH:mm...)
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        return new Date(y, mo - 1, d);
    }

    // Try DD/MM/YYYY or DD-MM-YYYY (default Indian style)
    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        return new Date(y, mo - 1, d);
    }

    // Fallback to Date parser, then normalize to local midnight
    const d2 = new Date(s);
    if (isNaN(d2)) return null;
    return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
}

// Utility function to format date as YYYY-MM-DD using local date parts
function formatDate(dateInput) {
    const d = parseDate(dateInput);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Function to get all dates between two dates
function getDateRange(startDate, endDate) {
    const dates = [];
    const currentDate = parseDate(startDate);
    const end = parseDate(endDate);

    while (currentDate <= end) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

// Function to calculate opening stock as of a specific date
// This replicates stock.js calculateCurrentStock() logic but with date filtering
async function calculateOpeningStock(itemCode, godownCode, asOfDate, billDtlData, purDtlData, transferData) {
    // Opening stock = purchases - purchaseReturns + salesReturns + transferIN - sales - transferOUT (strictly before asOfDate)
    const asOfStr = formatDate(asOfDate);

    const normItem = String(itemCode || '').trim().toUpperCase();
    const normGdn = Number(godownCode);

    let purchases = 0;
    let sales = 0;
    let salesReturn = 0;
    let purchaseReturn = 0;
    let transferIn = 0;
    let transferOut = 0;

    // Sum purchases before asOfDate (from PURDTL)
    for (const p of purDtlData) {
        const pStr = formatDate(new Date(p.DATE));
        const pCode = String(p.CODE || '').trim().toUpperCase();
        const pGdn = Number(p.GDN_CODE);
        if (
            pCode === normItem &&
            pGdn === normGdn &&
            pStr < asOfStr // date-only compare to avoid timezone issues
        ) {
            const qty = parseFloat(p.QTY) || 0;
            const multF = parseFloat(p.MULT_F) || 1;
            const unit = (p.UNIT || '').toUpperCase();
            const free = parseFloat(p.FREE) || 0;
            const qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            purchases += qtyInPieces + (free > 0 ? free : 0);
        }
    }

    // Sum sales, sales returns, and purchase returns before asOfDate (from BILLDTL)
    for (const b of billDtlData) {
        const bStr = formatDate(new Date(b.DATE));
        const bCode = String(b.CODE || '').trim().toUpperCase();
        const bGdn = Number(b.GDN_CODE);
        if (
            bCode === normItem &&
            bGdn === normGdn &&
            bStr < asOfStr // date-only compare to avoid timezone issues
        ) {
            const qty = parseFloat(b.QTY) || 0;
            const multF = parseFloat(b.MULT_F) || 1;
            const unit = (b.UNIT || '').toUpperCase();
            const free = parseFloat(b.FREE) || 0;
            const qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            const series = (b.SERIES || '').toUpperCase();

            if (series === 'S') {
                // Sales Return increases stock
                salesReturn += qtyInPieces + (free > 0 ? free : 0);
            } else if (series === 'P') {
                // Purchase Return decreases stock
                purchaseReturn += qtyInPieces + (free > 0 ? free : 0);
            } else {
                // Regular sales decrease stock
                sales += qtyInPieces + (free > 0 ? free : 0);
            }
        }
    }

    // Sum transfers before asOfDate (from TRANSFER)
    // Consider ONLY source rows where selected godown matches GDN_CODE
    // Use sign of QTY to decide direction (avoid double counting mirrored rows)
    for (const t of transferData) {
        const tStr = formatDate(new Date(t.DATE));
        const tCode = String(t.CODE || '').trim().toUpperCase();
        const tGdn = Number(t.GDN_CODE);
        if (
            tCode === normItem &&
            tGdn === normGdn &&
            tStr < asOfStr // date-only compare to avoid timezone issues
        ) {
            const qty = parseFloat(t.QTY) || 0;
            const multF = parseFloat(t.MULT_F) || 1;
            const unit = (t.UNIT || '').toUpperCase();
            const qtyInPieces = unit === 'BOX' ? qty * multF : qty;

            if (qtyInPieces > 0) {
                transferOut += qtyInPieces; // OUT from this godown
            } else if (qtyInPieces < 0) {
                transferIn += Math.abs(qtyInPieces); // IN to this godown
            }
        }
    }

    const openingRaw = purchases - purchaseReturn + salesReturn + transferIn - sales - transferOut;
    const normalizedOpening = Math.round(openingRaw);

    console.log(
        `Opening as of ${asOfDate.toISOString()} for ${normItem}@${normGdn}: P=${purchases}, PR=${purchaseReturn}, SR=${salesReturn}, TI=${transferIn}, S=${sales}, TO=${transferOut} => ${normalizedOpening}`
    );

    return normalizedOpening;
}

// Function to calculate daily transactions
// This follows the same logic as stock calculation in CollapsibleItemSection and stock.js
function calculateDailyTransactions(itemCode, godownCode, date, billDtlData, purDtlData, transferData) {
    const transactions = {
        purchase: 0,
        salesReturn: 0,
        transferIn: 0,
        sales: 0,
        purReturn: 0,
        transferOut: 0
    };

    const dateStr = formatDate(date);
    const normItem = String(itemCode || '').trim().toUpperCase();
    const normGdn = Number(godownCode);

    // Process purchases for the specific date
    for (const purchase of purDtlData) {
        const purchaseDate = formatDate(new Date(purchase.DATE));
        const pCode = String(purchase.CODE || '').trim().toUpperCase();
        const pGdn = Number(purchase.GDN_CODE);
        if (pCode === normItem && pGdn === normGdn && purchaseDate === dateStr) {
            let qty = parseFloat(purchase.QTY) || 0;
            const multF = parseFloat(purchase.MULT_F) || 1;
            const unit = (purchase.UNIT || '').toUpperCase();
            const free = parseFloat(purchase.FREE) || 0;
            // Convert to pieces - consistent with stock.js logic
            let qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            // Add purchase quantity and free quantity
            transactions.purchase += qtyInPieces + (free > 0 ? free : 0);
        }
    }

    // Process sales for the specific date
    // Following stock.js logic - treat ALL sales as stock reduction
    for (const sale of billDtlData) {
        const saleDate = formatDate(new Date(sale.DATE));
        const sCode = String(sale.CODE || '').trim().toUpperCase();
        const sGdn = Number(sale.GDN_CODE);
        if (sCode === normItem && sGdn === normGdn && saleDate === dateStr) {
            let qty = parseFloat(sale.QTY) || 0;
            const multF = parseFloat(sale.MULT_F) || 1;
            const unit = (sale.UNIT || '').toUpperCase();
            const free = parseFloat(sale.FREE) || 0;
            // Convert to pieces - consistent with stock.js logic
            let qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            // Following stock.js logic - all sales reduce stock (no series handling for now)
            transactions.sales += qtyInPieces + (free > 0 ? free : 0);
        }
    }

    // Process transfers for the specific date
    // IMPORTANT: Only consider rows where this godown is the source row in TRANSFER.json (GDN_CODE === godownCode)
    // and determine direction purely by the sign of QTY to avoid double counting mirrored rows.
    for (const transfer of transferData) {
        const transferDate = formatDate(new Date(transfer.DATE));
        const tCode = String(transfer.CODE || '').trim().toUpperCase();
        const tGdn = Number(transfer.GDN_CODE);
        if (tCode === normItem && transferDate === dateStr && tGdn === normGdn) {
            let qty = parseFloat(transfer.QTY) || 0;
            const multF = parseFloat(transfer.MULT_F) || 1;
            const unit = (transfer.UNIT || '').toUpperCase();
            // Convert to pieces - consistent with stock.js logic
            const qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            if (qtyInPieces > 0) {
                // Positive quantity on the source row means transfer OUT from this godown
                transactions.transferOut += qtyInPieces;
            } else if (qtyInPieces < 0) {
                // Negative quantity on the source row means transfer IN to this godown
                transactions.transferIn += Math.abs(qtyInPieces);
            }
        }
    }

    return transactions;
}

// Function to get detailed transactions with party information
async function getDetailedTransactions(itemCode, godownCode, date, billDtlData, purDtlData, transferData) {
    const dateStr = formatDate(date);
    const details = [];
    const normItem = String(itemCode || '').trim().toUpperCase();
    const normGdn = Number(godownCode);
    
    // Get purchase entries
    for (const purchase of purDtlData) {
        const purchaseDate = formatDate(new Date(purchase.DATE));
        const pCode = String(purchase.CODE || '').trim().toUpperCase();
        const pGdn = Number(purchase.GDN_CODE);
        if (pCode === normItem && pGdn === normGdn && purchaseDate === dateStr) {
            let qty = parseFloat(purchase.QTY) || 0;
            const multF = parseFloat(purchase.MULT_F) || 1;
            const unit = (purchase.UNIT || '').toUpperCase();
            const free = parseFloat(purchase.FREE) || 0;
            let qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            const totalQty = qtyInPieces + (free > 0 ? free : 0);
            
            if (totalQty > 0) {
                let party = null;
                if (purchase.C_CODE) {
                    try {
                        party = await getPartyByCode(purchase.C_CODE);
                    } catch (error) {
                        console.error('Error fetching party:', error);
                    }
                }
                
                const billNo = purchase.SERIES && purchase.BILL ? 
                    padBillNumber(purchase.SERIES, purchase.BILL) : 
                    (purchase.BILL || 'N/A');
                
                const partyName = party ? 
                    `${party.C_NAME} (${party.C_CODE})` : 
                    (purchase.C_CODE ? `Unknown Party (${purchase.C_CODE})` : 'N/A');
                
                details.push({
                    type: 'Purchase',
                    billNo,
                    partyName,
                    quantity: totalQty
                });
            }
        }
    }
    
    // Get sales entries
    for (const sale of billDtlData) {
        const saleDate = formatDate(new Date(sale.DATE));
        const sCode = String(sale.CODE || '').trim().toUpperCase();
        const sGdn = Number(sale.GDN_CODE);
        if (sCode === normItem && sGdn === normGdn && saleDate === dateStr) {
            let qty = parseFloat(sale.QTY) || 0;
            const multF = parseFloat(sale.MULT_F) || 1;
            const unit = (sale.UNIT || '').toUpperCase();
            const free = parseFloat(sale.FREE) || 0;
            let qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            const totalQty = qtyInPieces + (free > 0 ? free : 0);
            
            if (totalQty > 0) {
                let party = null;
                if (sale.C_CODE) {
                    try {
                        party = await getPartyByCode(sale.C_CODE);
                    } catch (error) {
                        console.error('Error fetching party:', error);
                    }
                }
                
                const billNo = sale.SERIES && sale.BILL ? 
                    padBillNumber(sale.SERIES, sale.BILL) : 
                    (sale.BILL || 'N/A');
                
                const partyName = party ? 
                    `${party.C_NAME} (${party.C_CODE})` : 
                    (sale.C_CODE ? `Unknown Party (${sale.C_CODE})` : 'N/A');
                
                details.push({
                    type: 'Sales',
                    billNo,
                    partyName,
                    quantity: -totalQty
                });
            }
        }
    }
    
    // Get transfer entries
    for (const transfer of transferData) {
        const transferDate = formatDate(new Date(transfer.DATE));
        const tCode = String(transfer.CODE || '').trim().toUpperCase();
        const tGdn = Number(transfer.GDN_CODE);
        if (tCode === normItem && transferDate === dateStr && tGdn === normGdn) {
            let qty = parseFloat(transfer.QTY) || 0;
            const multF = parseFloat(transfer.MULT_F) || 1;
            const unit = (transfer.UNIT || '').toUpperCase();
            const qtyInPieces = unit === 'BOX' ? qty * multF : qty;
            
            if (qtyInPieces !== 0) {
                const billNo = transfer.SERIES && transfer.BILL ? 
                    padBillNumber(transfer.SERIES, transfer.BILL) : 
                    (transfer.BILL || 'N/A');
                
                if (qtyInPieces > 0) {
                    details.push({
                        type: 'Transfer Out',
                        billNo,
                        partyName: `To Godown ${transfer.TO_GDN || 'Unknown'}`,
                        quantity: -qtyInPieces
                    });
                } else {
                    details.push({
                        type: 'Transfer In',
                        billNo,
                        partyName: `From Godown ${transfer.FROM_GDN || 'Unknown'}`,
                        quantity: Math.abs(qtyInPieces)
                    });
                }
            }
        }
    }
    
    return details;
}

// Main route handler
router.post('/item-wise-stock-register', async (req, res) => {
    try {
        const { fromDate, toDate, itemCode, godownCode, displayInBoxPcs, showPartyDetails } = req.body;
        
        // Validate required parameters
        if (!fromDate || !toDate || !itemCode || !godownCode) {
            return res.status(400).json({ 
                message: 'Missing required parameters: fromDate, toDate, itemCode, godownCode' 
            });
        }
        
        const startDate = parseDate(fromDate);
        const endDate = parseDate(toDate);
        
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Invalid date format' });
        }
        
        if (startDate > endDate) {
            return res.status(400).json({ message: 'From date cannot be after To date' });
        }
        
        // Read data files
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
        const purDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'PURDTL.json');
        const transferPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'TRANSFER.json');
        
        const [billDtlData, purDtlData, transferData] = await Promise.all([
            fs.readFile(billDtlPath, 'utf-8').then(data => JSON.parse(data)),
            fs.readFile(purDtlPath, 'utf-8').then(data => JSON.parse(data)),
            fs.readFile(transferPath, 'utf-8').then(data => JSON.parse(data))
        ]);
        
        // Calculate opening stock only once at the start date
        const openingStock = await calculateOpeningStock(
            itemCode, 
            godownCode, 
            startDate, 
            billDtlData, 
            purDtlData, 
            transferData
        );
        
        // Get all dates in the range
        const dates = getDateRange(startDate, endDate);
        const reportData = [];
        
        // Initialize running balance with opening stock
        let runningBalance = openingStock;
        
        for (const date of dates) {
            // For the first date, use the calculated opening stock
            // For subsequent dates, use the previous day's closing balance as opening
            const dailyOpeningStock = reportData.length === 0 ? openingStock : runningBalance;
            
            // Calculate daily transactions
            const transactions = calculateDailyTransactions(
                itemCode, 
                godownCode, 
                date, 
                billDtlData, 
                purDtlData, 
                transferData
            );
            
            // Get detailed transactions if showPartyDetails is true
            let details = [];
            if (showPartyDetails) {
                details = await getDetailedTransactions(
                    itemCode,
                    godownCode,
                    date,
                    billDtlData,
                    purDtlData,
                    transferData
                );
            }
            
            // Debug logging for transfer quantities
            if (transactions.transferIn > 0 || transactions.transferOut > 0) {
                console.log(`Date: ${formatDate(date)}, Item: ${itemCode}, Godown: ${godownCode}`);
                console.log(`  Transfer IN: ${transactions.transferIn}, Transfer OUT: ${transactions.transferOut}`);
            }
            
            // Calculate balance stock based on opening + inward - outward
            const balanceStock = dailyOpeningStock + 
                transactions.purchase + 
                transactions.salesReturn + 
                transactions.transferIn - 
                transactions.sales - 
                transactions.purReturn - 
                transactions.transferOut;
            
            // Update running balance for next iteration
            runningBalance = balanceStock; // Allow negative balances to carry forward
            
            const dayData = {
                date: formatDate(date),
                openingStock: dailyOpeningStock,
                purchase: transactions.purchase,
                salesReturn: transactions.salesReturn,
                transferIn: transactions.transferIn,
                sales: transactions.sales,
                purReturn: transactions.purReturn,
                transferOut: transactions.transferOut,
                balanceStock: runningBalance
            };
            
            // Add details if showPartyDetails is true
            if (showPartyDetails) {
                dayData.details = details;
            }
            
            reportData.push(dayData);
        }
        
        res.json({
            success: true,
            reportData: reportData,
            summary: {
                itemCode,
                godownCode,
                fromDate,
                toDate,
                displayInBoxPcs,
                totalRecords: reportData.length
            }
        });
        
    } catch (error) {
        console.error('Error generating item wise stock register:', error);
        res.status(500).json({ 
            message: 'Internal server error while generating report',
            error: error.message 
        });
    }
});

module.exports = router;