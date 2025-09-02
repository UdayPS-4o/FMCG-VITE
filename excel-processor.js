import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
const EXCEL_FILE_PATH = 'c:\\Users\\User\\Music\\webapp\\0490008700003292_072025.xlsm';

/**
 * Examine Excel file structure
 */
function examineExcelStructure() {
    try {
        console.log('Checking if Excel file exists...');
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            console.log('Excel file not found at:', EXCEL_FILE_PATH);
            return null;
        }
        
        console.log('Excel file found. Reading structure...');
        const workbook = XLSX.readFile(EXCEL_FILE_PATH);
        
        console.log('\n=== EXCEL STRUCTURE ===');
        console.log('Sheet names:', workbook.SheetNames);
        
        // Examine each sheet
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
            
            console.log(`\n--- Sheet: ${sheetName} ---`);
            console.log(`Range: ${worksheet['!ref'] || 'Empty'}`);
            
            // Show first 5 rows
            console.log('First 5 rows:');
            for (let row = 0; row < Math.min(5, range.e.r + 1); row++) {
                const rowData = [];
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    const cell = worksheet[cellAddress];
                    rowData.push(cell ? cell.v : undefined);
                }
                console.log(`Row ${row + 1}:`, rowData);
            }
        });
        
        return workbook;
        
    } catch (error) {
        console.error('Error examining Excel structure:', error.message);
        return null;
    }
}

/**
 * Read stock data using existing logic
 */
async function getStockData() {
    try {
        const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json');
        const purdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'purdtl.json');
        const transferPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'transfer.json');
        
        console.log('\n=== READING STOCK DATA ===');
        console.log('Reading from:', billdtlPath);
        
        // Read JSON files
        const billDtlData = JSON.parse(fs.readFileSync(billdtlPath, 'utf8'));
        const purDtlData = JSON.parse(fs.readFileSync(purdtlPath, 'utf8'));
        
        let transferData = [];
        if (fs.existsSync(transferPath)) {
            transferData = JSON.parse(fs.readFileSync(transferPath, 'utf8'));
        }
        
        console.log(`Loaded ${billDtlData.length} bill details`);
        console.log(`Loaded ${purDtlData.length} purchase details`);
        console.log(`Loaded ${transferData.length} transfer details`);
        
        // Calculate stock by item code
        const stockMap = new Map();
        
        // Process purchases (add to stock)
        purDtlData.forEach(item => {
            if (!item.CODE || item._deleted) return;
            
            const key = item.CODE;
            if (!stockMap.has(key)) {
                stockMap.set(key, {
                    code: item.CODE,
                    product: item.PRODUCT || item.PRODUCT_L || '',
                    unit: item.UNIT || '',
                    multF: item.MULT_F || 1,
                    mrp: item.MRP || 0,
                    hsnCode: item.HSN_CODE || '',
                    purchases: 0,
                    sales: 0,
                    transfers: 0,
                    currentStock: 0
                });
            }
            
            const stock = stockMap.get(key);
            const qty = (item.QTY || 0) * (item.MULT_F || 1);
            stock.purchases += qty;
        });
        
        // Process sales (subtract from stock)
        billDtlData.forEach(item => {
            if (!item.CODE || item._deleted) return;
            
            const key = item.CODE;
            if (!stockMap.has(key)) {
                stockMap.set(key, {
                    code: item.CODE,
                    product: item.PRODUCT || item.PRODUCT_L || '',
                    unit: item.UNIT || '',
                    multF: item.MULT_F || 1,
                    mrp: item.MRP || 0,
                    hsnCode: item.HSN_CODE || '',
                    purchases: 0,
                    sales: 0,
                    transfers: 0,
                    currentStock: 0
                });
            }
            
            const stock = stockMap.get(key);
            const qty = (item.QTY || 0) * (item.MULT_F || 1);
            stock.sales += qty;
        });
        
        // Process transfers
        transferData.forEach(item => {
            if (!item.CODE || item._deleted) return;
            
            const key = item.CODE;
            if (stockMap.has(key)) {
                const stock = stockMap.get(key);
                const qty = (item.QTY || 0) * (item.MULT_F || 1);
                stock.transfers += qty;
            }
        });
        
        // Calculate current stock
        stockMap.forEach(stock => {
            stock.currentStock = stock.purchases - stock.sales - stock.transfers;
        });
        
        return Array.from(stockMap.values()).filter(item => item.currentStock > 0);
        
    } catch (error) {
        console.error('Error reading stock data:', error.message);
        return [];
    }
}

/**
 * Read debtor balances
 */
function getDebtorBalances() {
    try {
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        console.log('\n=== READING DEBTOR BALANCES ===');
        console.log('Reading from:', cmplPath);
        
        const cmplData = JSON.parse(fs.readFileSync(cmplPath, 'utf8'));
        
        // Filter for debit balances (debtors) - parties with DR > 0 or negative CB_VAL
        const debtors = cmplData.filter(party => {
            const drAmount = parseFloat(party.DR) || 0;
            const cbVal = parseFloat(party.CB_VAL) || 0;
            const curBal = parseFloat(party.CUR_BAL) || 0;
            
            // Consider as debtor if DR amount > 0 or current balance is positive
            return drAmount > 0 || curBal > 0 || cbVal > 0;
        });
        
        console.log(`Found ${debtors.length} debtors`);
        
        if (debtors.length > 0) {
            console.log('Sample debtors:');
            debtors.slice(0, 3).forEach(debtor => {
                const balance = debtor.DR || debtor.CUR_BAL || debtor.CB_VAL || 0;
                console.log(`  ${debtor.C_CODE}: ${debtor.C_NAME} - Balance: ₹${balance}`);
            });
        }
        
        return debtors.map(party => ({
            partyCode: party.C_CODE,
            partyName: party.C_NAME,
            balance: parseFloat(party.DR) || parseFloat(party.CUR_BAL) || parseFloat(party.CB_VAL) || 0,
            type: 'DR'
        }));
        
    } catch (error) {
        console.error('Error reading debtor balances:', error.message);
        return [];
    }
}

/**
 * Get sales and purchase summary
 */
function getSalesPurchaseSummary() {
    try {
        const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'billdtl.json');
        const purdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'purdtl.json');
        
        console.log('\n=== READING SALES & PURCHASE SUMMARY ===');
        
        const billDtlData = JSON.parse(fs.readFileSync(billdtlPath, 'utf8'));
        const purDtlData = JSON.parse(fs.readFileSync(purdtlPath, 'utf8'));
        
        // Calculate sales summary
        let totalSales = 0;
        let salesCount = 0;
        billDtlData.forEach(item => {
            if (!item._deleted && item.NET10) {
                totalSales += parseFloat(item.NET10) || 0;
                salesCount++;
            }
        });
        
        // Calculate purchase summary
        let totalPurchases = 0;
        let purchaseCount = 0;
        purDtlData.forEach(item => {
            if (!item._deleted && item.NET10) {
                totalPurchases += parseFloat(item.NET10) || 0;
                purchaseCount++;
            }
        });
        
        console.log(`Sales: ${salesCount} transactions, Total: ₹${totalSales.toFixed(2)}`);
        console.log(`Purchases: ${purchaseCount} transactions, Total: ₹${totalPurchases.toFixed(2)}`);
        
        return {
            sales: {
                count: salesCount,
                total: totalSales
            },
            purchases: {
                count: purchaseCount,
                total: totalPurchases
            }
        };
        
    } catch (error) {
        console.error('Error reading sales/purchase summary:', error.message);
        return { sales: { count: 0, total: 0 }, purchases: { count: 0, total: 0 } };
    }
}

/**
 * Write data to Excel sheets
 */
function writeDataToExcel(workbook, stockData, debtorBalances, salesPurchaseSummary) {
    try {
        console.log('Writing data to Excel sheets...');
        
        // Create or update stock sheet
        const stockSheet = XLSX.utils.json_to_sheet(stockData.map(item => ({
            'Item Code': item.code,
            'Product Name': item.product,
            'Unit': item.unit,
            'Current Stock': item.currentStock,
            'MRP': item.mrp,
            'HSN Code': item.hsnCode
        })));
        
        // Create or update debtors sheet
        const debtorsSheet = XLSX.utils.json_to_sheet(debtorBalances.map(debtor => ({
            'Party Code': debtor.partyCode,
            'Party Name': debtor.partyName,
            'Balance': debtor.balance,
            'Type': debtor.type
        })));
        
        // Create summary sheet
        const summarySheet = XLSX.utils.json_to_sheet([
            { 'Description': 'Total Sales', 'Count': salesPurchaseSummary.sales.count, 'Amount': salesPurchaseSummary.sales.total },
            { 'Description': 'Total Purchases', 'Count': salesPurchaseSummary.purchases.count, 'Amount': salesPurchaseSummary.purchases.total },
            { 'Description': 'Stock Items', 'Count': stockData.length, 'Amount': '' },
            { 'Description': 'Debtors', 'Count': debtorBalances.length, 'Amount': debtorBalances.reduce((sum, d) => sum + d.balance, 0) }
        ]);
        
        // Add sheets to workbook
        workbook.Sheets['Stock_Data'] = stockSheet;
        workbook.Sheets['Debtor_Balances'] = debtorsSheet;
        workbook.Sheets['Summary'] = summarySheet;
        
        // Update sheet names if not already present
        if (!workbook.SheetNames.includes('Stock_Data')) {
            workbook.SheetNames.push('Stock_Data');
        }
        if (!workbook.SheetNames.includes('Debtor_Balances')) {
            workbook.SheetNames.push('Debtor_Balances');
        }
        if (!workbook.SheetNames.includes('Summary')) {
            workbook.SheetNames.push('Summary');
        }
        
        // Write the file
        XLSX.writeFile(workbook, EXCEL_FILE_PATH);
        console.log('Excel file updated successfully!');
        
    } catch (error) {
        console.error('Error writing to Excel:', error.message);
        throw error;
    }
}

/**
 * Main function to examine and process data
 */
async function main() {
    try {
        console.log('=== PNB EXCEL PROCESSOR ===');
        console.log('DBF Folder Path:', DBF_FOLDER_PATH);
        console.log('Excel File Path:', EXCEL_FILE_PATH);
        
        // Check if files exist
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            console.error('Excel file not found:', EXCEL_FILE_PATH);
            return;
        }
        
        if (!fs.existsSync(DBF_FOLDER_PATH)) {
            console.error('DBF folder not found:', DBF_FOLDER_PATH);
            return;
        }
        
        console.log('Files exist, proceeding...');
        
        // 1. Examine Excel structure
        console.log('\n1. Examining Excel structure...');
        const workbook = examineExcelStructure();
        if (!workbook) {
            console.error('Failed to read Excel file');
            return;
        }
        
        // 2. Get stock data
        console.log('\n2. Getting stock data...');
        const stockData = await getStockData();
        console.log(`Found ${stockData.length} items with current stock`);
        if (stockData.length > 0) {
            console.log('Sample stock items:');
            stockData.slice(0, 3).forEach(item => {
                console.log(`  ${item.code}: ${item.product} - Stock: ${item.currentStock}`);
            });
        }
        
        // 3. Get debtor balances
        console.log('\n3. Getting debtor balances...');
        const debtorBalances = getDebtorBalances();
        console.log(`Found ${debtorBalances.length} debtors`);
        if (debtorBalances.length > 0) {
            console.log('Sample debtors:');
            debtorBalances.slice(0, 3).forEach(debtor => {
                console.log(`  ${debtor.partyCode}: ₹${debtor.balance.toFixed(2)} ${debtor.type}`);
            });
        }
        
        // 4. Get sales/purchase summary
        console.log('\n4. Getting sales/purchase summary...');
        const summary = getSalesPurchaseSummary();
        
        // 5. Write data to Excel
        console.log('\n5. Writing data to Excel...');
        await writeDataToExcel(workbook, stockData, debtorBalances, summary);
        
        console.log('\n=== PROCESSING COMPLETE ===');
        console.log('Excel file has been updated with the data!');
        
    } catch (error) {
        console.error('Error in main function:', error.message);
        console.error(error.stack);
    }
}

// Run the script
console.log('Script starting...');
console.log('Calling main function...');
main().catch(console.error);

export {
    examineExcelStructure,
    getStockData,
    getDebtorBalances,
    getSalesPurchaseSummary,
    writeDataToExcel
};