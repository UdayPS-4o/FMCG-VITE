const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const Papa = require('papaparse');
const moment = require('moment');
const { DBFFile } = require('../../dbf-orm/dbffile');
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
require('dotenv').config();

// Define paths relative to this file
// server/routes/reports/pnbStatement.js -> ../../../../downloads
const DOWNLOADS_DIR = path.resolve(__dirname, '../../../../downloads'); 
const EDITED_DIR = path.resolve(__dirname, '../../../../edited');
const CONFIG_PATH = path.resolve(__dirname, '../../../config.json');

// --- Helper Functions from app.js ---

async function cleancsv(filepath, filename) {
    try {
        console.log('Cleaning CSV:', filepath);
        let fileContent = await fs.readFile(filepath, 'utf8');

        // convert file to start from Txn No. onwards
        let top = fileContent.split('Txn No.')[0];
        
        if (fileContent.split('Txn No.').length < 2) {
            console.error('Invalid CSV format: Txn No. not found');
            return;
        }

        let file1 = 'Blank,Txn No.' + fileContent.split('Txn No.')[1];
        // end at ,Unless constituent notifies the bank
        file1 = file1.split(',Unless constituent notifies the bank')[0];
        
        let bottom = '';
        if (fileContent.split(',Unless constituent notifies the bank').length > 1) {
             bottom = ',Unless constituent notifies the bank' + fileContent.split(',Unless constituent notifies the bank')[1];
        }

        // Parse the CSV file
        const results = Papa.parse(file1, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
        });

        // Clean data
        const results1 = results.data.map((row) => {
            const newRow = {};
            Object.keys(row).forEach((key) => {
                if (key === 'Dr Amount' || key === 'Cr Amount' || key === 'Balance') {
                    if (typeof row[key] == 'string') {
                        // take out numbers from string
                        newRow[key] = (row[key].replace(/[^0-9.-]+/g,""));
                        newRow[key] = (row[key].replace(/,/g, '').replace(' Dr.', '').replace(' Cr.', ''));
                    } else if (typeof row[key] == 'number') {
                        newRow[key] = row[key];
                    } else {
                        newRow[key] = "";
                    }
                } else {
                    newRow[key] = row[key];
                }
            }); 
            return newRow;
        });

        // write to edited .csv file
        let csv = Papa.unparse(results1);
        
        // remove first 6 chars from csv (Because "Blank," was added?)
        // In app.js: csv = csv.substring(6);
        // Papa.unparse will include "Blank," in header if we added it?
        // Let's assume the logic from app.js is correct for the specific format.
        csv = csv.substring(6);

        let currentDate = moment().format('DD-MM-YYYY');
        let currentTime = moment().format('HH-mm');
        let newFilename = `statement-${currentDate}--${currentTime}.csv`;
        
        // Ensure edited dir exists
        if (!fsSync.existsSync(EDITED_DIR)) {
            await fs.mkdir(EDITED_DIR, { recursive: true });
        }

        await fs.writeFile(path.join(EDITED_DIR, newFilename), top + csv + bottom, 'utf8');
        console.log('Cleaned CSV saved to:', path.join(EDITED_DIR, newFilename));
        
        // Also save as pnbcr.csv in edited folder for consistency? 
        // app.js saved to Desktop. We'll save to our edited folder as pnbcr.csv too for easy access.
        await fs.writeFile(path.join(DOWNLOADS_DIR, 'pnbcr.csv'), top + csv + bottom, 'utf8');

    } catch (error) {
        console.error('Error cleaning CSV:', error);
    }
}

async function runDownload() {
    let browser;
    try {
        console.log('Reading config from:', CONFIG_PATH);
        const configContent = await fs.readFile(CONFIG_PATH, 'utf8');
        const config = JSON.parse(configContent);
        
        // Ensure download directory exists
        const rawDownloadPath = path.join(DOWNLOADS_DIR, 'raw');
        if (!fsSync.existsSync(rawDownloadPath)) {
            await fs.mkdir(rawDownloadPath, { recursive: true });
        }

        const headless = ([true, "true"].includes(config.background) ? "new" : false);
        
        // Determine browser executable path
        let executablePath = config.chromePath;
        
        // List of fallback paths for Chrome on Windows
        const fallbackPaths = [
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Re-add default as fallback
        ];

        // Check if configured path exists
        if (!fsSync.existsSync(executablePath)) {
            console.warn(`Configured Chrome path not found: ${executablePath}`);
            // Try to find a valid path
            const foundPath = fallbackPaths.find(p => fsSync.existsSync(p));
            if (foundPath) {
                console.log(`Using fallback Chrome path: ${foundPath}`);
                executablePath = foundPath;
            } else {
                console.warn('No Chrome executable found in common locations. Letting Puppeteer decide.');
                executablePath = undefined; // Let Puppeteer use bundled Chromium if available
            }
        } else {
            console.log(`Using configured Chrome path: ${executablePath}`);
        }

        console.log('Launching browser...');
        const launchOptions = {
            headless: false, 
            args: []
        };
        
        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: rawDownloadPath,
        });

        // Page logic from app.js
        console.log('Navigating to login page...');
        await page.goto(config.website);

        await page.waitForSelector('#AuthenticationFG\\.CORP_ID');
        await page.type('#AuthenticationFG\\.CORP_ID', config['corp-id']);
        await page.type('#AuthenticationFG\\.USR_ID', config['user-id']);
        await page.click('[name="Action.STU_VALIDATE_CREDENTIALS"]');

        await page.waitForSelector('#AuthenticationFG\\.ACCESS_CODE');
        console.log('Password page...');

        await page.evaluate((password) => {
            document.querySelector('#AuthenticationFG\\.ACCESS_CODE').value = password;
        }, config['password']);

        await new Promise(resolve => setTimeout(resolve, 2000));

        // CAPTCHA
        const captchaImageSrc = await page.$eval('#dynamicImage', img => img.src);
        const base64Data = captchaImageSrc.split(',')[1];
        console.log("Solving Captcha...");
        
        const { data: { text } } = await Tesseract.recognize(`data:image/png;base64,${base64Data}`, 'eng');
        const captchaText = text.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
        console.log('Captcha text:', captchaText);

        await page.type('#AuthenticationFG\\.ENTERED_CAPTCHA_CODE', captchaText);

        await page.evaluate(() => {
            const btn = document.getElementById('VALIDATE_STU_CREDENTIALS1');
            if (btn) btn.removeAttribute('onclick');
        });
        await page.click('#VALIDATE_STU_CREDENTIALS1');

        // Check Login Success
        try {
            await page.waitForSelector("#My-ShortCuts_Account-Statement", {timeout: 20000});
            console.log('Logged in successfully.');
            await page.click("#My-ShortCuts_Account-Statement");
        } catch (error) {
            console.error('Login failed or timed out waiting for dashboard.');
            throw new Error('Login failed. Check credentials or captcha.');
        }

        // Account Statement Page
        await page.waitForSelector("#SEARCH");
        
        const fromDateValue = await page.$eval('#TransactionHistoryFG\\.TO_TXN_DATE', input => input.value);
        const fromDate = moment(fromDateValue, 'DD-MM-YYYY');
        const toDate = fromDate.clone().subtract(1, 'day');
        const toDateValue = toDate.format('DD-MM-YYYY');

        await page.evaluate((value) => {
            document.querySelector('#TransactionHistoryFG\\.FROM_TXN_DATE').value = value;
        }, toDateValue);

        console.log('Searching statement...');
        await page.click("#SEARCH");

        // Download
        await page.waitForSelector("#TransactionHistoryFG\\.OUTFORMAT");
        console.log('Initiating download...');
        await page.select("#TransactionHistoryFG\\.OUTFORMAT", "3"); // 3 = CSV?
        
        // Clear old files in raw folder to identify new one
        const oldFiles = await fs.readdir(rawDownloadPath);
        
        await page.click("#okButton");

        // Wait for download to finish
        console.log('Waiting for file...');
        let newFile = null;
        let retries = 0;
        while (retries < 20) { // Wait up to 20 seconds
            await new Promise(resolve => setTimeout(resolve, 1000));
            const currentFiles = await fs.readdir(rawDownloadPath);
            const diff = currentFiles.filter(x => !oldFiles.includes(x) && x.endsWith('.csv'));
            if (diff.length > 0) {
                newFile = diff[0];
                break;
            }
            retries++;
        }

        if (newFile) {
            console.log('File downloaded:', newFile);
            await cleancsv(path.join(rawDownloadPath, newFile), newFile);
            return true;
        } else {
            throw new Error('Download timed out');
        }

    } catch (error) {
        console.error('Puppeteer error:', error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}


// --- Routes ---

// Trigger Download
router.post('/pnb-statement/download', async (req, res) => {
    // Instead of calling external service, we run it here.
    // We send immediate response because it takes time, OR we wait?
    // User interface says "Download started...". 
    // If we run in background, user might not know if it failed.
    // But keeping connection open for 30s+ might timeout.
    // Let's run async and log.
    
    console.log('Received download request');
    
    // Fire and forget (or rather, fire and log)
    runDownload()
        .then(() => console.log('Download process completed successfully'))
        .catch(err => console.error('Download process failed:', err));

    res.json({ message: 'Download process initiated.', status: 'started' });
});

// Get Pending Transactions
router.get('/pnb-statement/pending', async (req, res) => {
    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ message: 'DBF_FOLDER_PATH not set' });
        }

        console.log('Searching for files in:', EDITED_DIR, 'and', DOWNLOADS_DIR);

        let latestTime = 0;
        let latestFile = null;

        if (fsSync.existsSync(EDITED_DIR)) {
            const files = await fs.readdir(EDITED_DIR);
            console.log('Files in EDITED_DIR:', files);
            for (const file of files) {
                if (file.endsWith('.csv') && file.startsWith('statement-')) {
                    const filePath = path.join(EDITED_DIR, file);
                    const stats = await fs.stat(filePath);
                    if (stats.mtimeMs > latestTime) {
                        latestTime = stats.mtimeMs;
                        latestFile = filePath;
                    }
                }
            }
        }
        
        // Also check pnbcr.csv in downloads
        if (fsSync.existsSync(path.join(DOWNLOADS_DIR, 'pnbcr.csv'))) {
             const pnbPath = path.join(DOWNLOADS_DIR, 'pnbcr.csv');
             console.log('Found pnbcr.csv at:', pnbPath);
             const stats = await fs.stat(pnbPath);
             if (stats.mtimeMs > latestTime) {
                 latestFile = pnbPath;
             }
        }

        if (!latestFile) {
            console.error('No statement file found in search paths.');
            return res.status(404).json({ message: 'No statement file found. Please download one first.' });
        }

        console.log('Reading statement file:', latestFile);
        let csvContent = await fs.readFile(latestFile, 'utf8');
        
        // Clean content before parsing (remove top metadata)
        // Check if 'Txn No.' exists
        if (csvContent.includes('Txn No.')) {
             // Split and take the part starting from 'Txn No.'
             // But wait, 'Txn No.' is a header.
             // We want the line containing 'Txn No.' to be the first line.
             const parts = csvContent.split('Txn No.');
             if (parts.length > 1) {
                 // Reconstruct: "Txn No." + rest
                 // Note: split consumes the separator.
                 // We need to find the line index.
                 const lines = csvContent.split(/\r?\n/);
                 const headerIndex = lines.findIndex(line => line.includes('Txn No.'));
                 if (headerIndex !== -1) {
                     console.log(`Found 'Txn No.' at line index: ${headerIndex}`);
                     csvContent = lines.slice(headerIndex).join('\n');
                 }
             }
        } else {
            console.warn("'Txn No.' header not found in file content. Parsing might fail.");
        }

        // Remove bottom metadata if present
        if (csvContent.includes('Unless constituent notifies the bank')) {
             const parts = csvContent.split('Unless constituent notifies the bank');
             csvContent = parts[0];
        }
        
        console.log('CSV Content Start (first 200 chars):', csvContent.substring(0, 200));

        // Parse CSV
        const parsedCsv = Papa.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true 
        });

        const csvData = parsedCsv.data;
        console.log(`Parsed ${csvData.length} rows from CSV.`);
        if (csvData.length > 0) {
            console.log('First row sample:', JSON.stringify(csvData[0]));
            console.log('Row keys:', Object.keys(csvData[0]));
        }

        // 2. Read CASH.DBF and Filter (Chunked to avoid OOM)
        const existingTxns = new Set();
        let realDbfPath = path.join(DBF_FOLDER_PATH, 'CASH.DBF');
        // Try common paths
        if (!fsSync.existsSync(realDbfPath)) realDbfPath = path.join(DBF_FOLDER_PATH, 'data', 'CASH.DBF');
        if (!fsSync.existsSync(realDbfPath)) realDbfPath = path.join(DBF_FOLDER_PATH, 'DATA', 'CASH.DBF');

        if (fsSync.existsSync(realDbfPath)) {
            console.log('Reading CASH.DBF from:', realDbfPath);
            try {
                const dbf = await DBFFile.open(realDbfPath);
                const CHUNK_SIZE = 2000; // Chunk size as requested (>= 1000)
                let offset = 0;
                let records = [];
                
                do {
                    records = await dbf.readRecords(false, CHUNK_SIZE, offset);
                    for (const row of records) {
                        // Check BANK field regardless of VR type
                        if (row.BANK && String(row.BANK).trim().length > 0) {
                            existingTxns.add(String(row.BANK).trim().toUpperCase());
                        }
                    }
                    offset += records.length;
                    if (offset % 50000 === 0) {
                        console.log(`Processed ${offset} records...`);
                        // Force minor GC if possible? No, just rely on scope.
                    }
                } while (records.length > 0);
                
                // dbf.close() is not explicitly available in my previous read of dbffile.js unless I added it?
                // Wait, dbffile.js has close() method?
                // Let's check dbffile.js content again.
                // Yes: async close() { if (this.fileHandle) ... }
                await dbf.close();
                console.log(`Found ${existingTxns.size} existing transactions in DBF.`);
            } catch (err) {
                console.error('Error reading CASH.DBF:', err);
            }
        } else {
            console.warn('CASH.DBF not found, checking CASH.json as fallback...');
            const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');
            try {
                const cashData = JSON.parse(await fs.readFile(cashPath, 'utf8'));
                console.log(`Read ${cashData.length} records from CASH.json`);
                cashData.forEach(row => {
                    if (['BP', 'BR', 'CP'].includes(row.VR) && row.BANK) {
                        existingTxns.add(String(row.BANK).trim());
                    }
                });
            } catch (e) {
                console.warn('Could not read CASH.json, assuming empty', e);
            }
        }
        console.log(`Total existing transactions loaded: ${existingTxns.size}`);

        // 3. Read Helper Files
        const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        const bankDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BANKDTL.json');
        
        const cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf8'));
        let bankDtlData = [];
        try {
            bankDtlData = JSON.parse(await fs.readFile(bankDtlPath, 'utf8'));
            console.log(`Loaded ${bankDtlData.length} entries from BANKDTL.json`);
        } catch(e) { console.warn('No BANKDTL.json found at:', bankDtlPath); }

        const phoneToCode = new Map();
        cmplData.forEach(party => {
            if (party.C_MOBILE) phoneToCode.set(String(party.C_MOBILE).trim(), party.C_CODE);
            if (party.C_PHONE) phoneToCode.set(String(party.C_PHONE).trim(), party.C_CODE);
        });

        const pendingTransactions = [];

        // 4. Process CSV Rows
        csvData.forEach((row, index) => {
            // Cleaned CSV keys: 'Txn No.', 'Txn Date', 'Description', 'Dr Amount', 'Cr Amount'
            // Papa parse might produce keys with quotes if not careful, but dynamicTyping handles values.
            
            const txnNo = String(row['Txn No.'] || row['Txn No'] || '').trim();
            if (!txnNo) return;

            if (existingTxns.has(txnNo.toUpperCase())) {
                return; 
            }

            const narration = (row['Description'] || row['Narration'] || '').toString();
            const drAmount = parseFloat(row['Dr Amount'] || 0);
            const crAmount = parseFloat(row['Cr Amount'] || 0);
            const date = row['Txn Date'] || row['Date']; 

            let suggestedPartyCode = '';
            let suggestedPartyName = '';
            let matchReason = '';

            // Match Logic 1: Phone
            const numbersInNarration = narration.match(/\d{10}/g);
            if (numbersInNarration) {
                for (const num of numbersInNarration) {
                    if (phoneToCode.has(num)) {
                        suggestedPartyCode = phoneToCode.get(num);
                        matchReason = 'Mobile Match';
                        break;
                    }
                }
            }

            // Match Logic 2: BANKDTL
            if (!suggestedPartyCode && bankDtlData.length > 0) {
                // We check if BANKDTL.NARETAION is contained in current narration
                const match = bankDtlData.find(dtl => {
                     // Check if dtl.NARETAION is a valid string and matches
                     const searchStr = (dtl.NARETAION || '').trim();
                     return searchStr && narration.toUpperCase().includes(searchStr.toUpperCase());
                });
                if (match) {
                    suggestedPartyCode = match.C_CODE;
                    matchReason = 'Bank DTL Match';
                }
            }

            if (suggestedPartyCode) {
                const party = cmplData.find(p => p.C_CODE === suggestedPartyCode);
                if (party) suggestedPartyName = party.C_NAME;
            }

            pendingTransactions.push({
                id: index,
                txnNo,
                date,
                narration,
                drAmount,
                crAmount,
                partyCode: suggestedPartyCode,
                partyName: suggestedPartyName,
                matchReason
            });
        });

        res.json({
            pendingTransactions,
            parties: cmplData.map(p => ({ value: p.C_CODE, label: p.C_NAME }))
        });

    } catch (error) {
        console.error('Error getting pending transactions:', error);
        res.status(500).json({ message: 'Failed to get pending transactions', error: error.message });
    }
});

// Save Transactions
router.post('/pnb-statement/save', async (req, res) => {
    try {
        const { transactions } = req.body;
        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ message: 'No transactions to save' });
        }

        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        
        let realDbfPath = path.join(DBF_FOLDER_PATH, 'CASH.DBF');
        if (!fsSync.existsSync(realDbfPath)) {
            realDbfPath = path.join(DBF_FOLDER_PATH, 'DATA', 'CASH.DBF');
        }
        if (!fsSync.existsSync(realDbfPath)) {
             realDbfPath = path.join(DBF_FOLDER_PATH, 'CASH.DBF');
        }

        console.log('Opening DBF:', realDbfPath);
        const dbf = await DBFFile.open(realDbfPath);
        
        // Find max VR number by scanning chunks to avoid OOM
        let maxBP = 0;
        let maxBR = 0;
        let maxCP = 0;
        
        const CHUNK_SIZE = 5000;
        let offset = 0;
        let chunkRecords = [];
        
        console.log('Scanning DBF for max VR numbers...');
        do {
            chunkRecords = await dbf.readRecords(false, CHUNK_SIZE, offset);
            for (const r of chunkRecords) {
                 if (!r.VR) continue;
                 const vrStr = r.VR.trim();
                 
                 // Check format "XX-YYYYYY"
                 if (vrStr.includes('-')) {
                     const parts = vrStr.split('-');
                     const type = parts[0];
                     const numPart = parts[1];
                     const num = parseInt(numPart, 10);
                     
                     if (!isNaN(num)) {
                         if (type === 'BP' && num > maxBP) maxBP = num;
                         if (type === 'BR' && num > maxBR) maxBR = num;
                         if (type === 'CP' && num > maxCP) maxCP = num;
                     }
                 }
            }
            offset += chunkRecords.length;
        } while (chunkRecords.length > 0);
        
        console.log(`Max VRs found: BP=${maxBP}, BR=${maxBR}, CP=${maxCP}`);

        let nextBP = maxBP + 1;
        let nextBR = maxBR + 1;
        let nextCP = maxCP + 1;

        const newRecords = [];

        for (const txn of transactions) {
            const { txnNo, date, narration, drAmount, crAmount, partyCode } = txn;
            
            let type = '';
            let amount = 0;
            
            if (crAmount > 0) {
                if (narration.toUpperCase().includes('BY CASH')) {
                    type = 'CP'; 
                } else {
                    type = 'BR';
                }
                amount = crAmount;
            } else if (drAmount > 0) {
                type = 'BP';
                amount = drAmount;
            } else {
                continue; 
            }

            let vrNum = 0;
            if (type === 'BP') vrNum = nextBP++;
            if (type === 'BR') vrNum = nextBR++;
            if (type === 'CP') vrNum = nextCP++;

            // Format VR as XX-000000 (9 chars total)
            const vrString = `${type}-${String(vrNum).padStart(6, '0')}`;

            // Entry 1: Party Side
            const partyRecord = {
                VR: vrString,      
                // VRNO field does not exist in DBF
                DATE: moment(date, 'DD-MM-YYYY').toDate(), 
                C_CODE: partyCode,
                REMARK: `${narration} / ${txnNo}`, 
                BANK: txnNo,   
                DR: (type === 'BP' || type === 'CP') ? amount : 0,
                CR: (type === 'BR') ? amount : 0,
                M_GROUP1: '', 
            };
            newRecords.push(partyRecord);

            // Entry 2: Bank Side (Contra) - Only for BR and BP
            if (type === 'BR' || type === 'BP') {
                const bankRecord = {
                    VR: vrString,
                    DATE: moment(date, 'DD-MM-YYYY').toDate(),
                    C_CODE: 'BB009', // PNB Bank Code
                    REMARK: `${narration} / ${txnNo}`,
                    BANK: txnNo,
                    // Swap DR/CR for Bank side
                    // BR: Party Credited -> Bank Debited
                    // BP: Party Debited -> Bank Credited
                    DR: (type === 'BR') ? amount : 0,
                    CR: (type === 'BP') ? amount : 0,
                    M_GROUP1: '',
                };
                newRecords.push(bankRecord);
            }
        }

        await dbf.appendRecords(newRecords);
        console.log(`Appended ${newRecords.length} records to CASH.DBF`);

        // Close DBF
        await dbf.close();

        // Delete pnbcr.csv to avoid processing same file again and unlock it
        const pnbCrPath = path.join(DOWNLOADS_DIR, 'pnbcr.csv');
        if (fsSync.existsSync(pnbCrPath)) {
            try {
                await fs.unlink(pnbCrPath);
                console.log('Deleted pnbcr.csv after saving.');
            } catch (err) {
                console.error('Failed to delete pnbcr.csv:', err);
            }
        }

        res.json({ message: 'Transactions saved successfully', count: newRecords.length });

    } catch (error) {
        console.error('Error saving transactions:', error);
        res.status(500).json({ message: 'Failed to save transactions', error: error.message });
    }
});

module.exports = router;
