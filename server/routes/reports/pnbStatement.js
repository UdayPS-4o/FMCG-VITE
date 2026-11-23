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

async function runDownload(onStep = () => {}, opts = {}) {
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

        onStep('Opening browser');
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
        onStep('Logging in to PNB');
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
        onStep('Solving captcha');
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

        // NEW PNB UI: account dropdown defaults to "Select" and must be chosen first
        const selectedAccount = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select'));
            for (const sel of selects) {
                const opts = Array.from(sel.options);
                // account dropdown option looks like "NAME(INR) - 0490..."
                const acc = opts.find(o => /\(\s*[A-Z]{3}\s*\)\s*-\s*\d{6,}/.test(o.text));
                if (acc) {
                    sel.value = acc.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    return { id: sel.id, text: acc.text.trim() };
                }
            }
            return null;
        });

        if (selectedAccount) {
            console.log('Account selected:', selectedAccount.text);
            // selection may trigger a postback/re-render; give it time to settle
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => { }),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
            await page.waitForSelector("#SEARCH");
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log('No account dropdown found, continuing (manual/old layout).');
        }

        const fromDateValue = await page.$eval('#TransactionHistoryFG\\.TO_TXN_DATE', input => input.value);
        const fromDate = moment(fromDateValue, 'DD-MM-YYYY');
        const toDate = fromDate.clone().subtract(1, 'day');
        // default: yesterday..today; caller may ask for a longer range (e.g. to trace a balance difference)
        const toDateValue = opts.fromDate || toDate.format('DD-MM-YYYY');
        console.log(`Statement range: ${toDateValue} to ${fromDateValue}`);

        await page.evaluate((value) => {
            document.querySelector('#TransactionHistoryFG\\.FROM_TXN_DATE').value = value;
        }, toDateValue);

        onStep('Fetching statement');
        console.log('Searching statement...');
        await page.click("#SEARCH");

        // Download
        await page.waitForSelector("#TransactionHistoryFG\\.OUTFORMAT");
        console.log('Initiating download...');
        await page.select("#TransactionHistoryFG\\.OUTFORMAT", "3"); // 3 = CSV?
        
        // PNB names the file OpTransactionHistory<today>.csv, so a second download on the same
        // day OVERWRITES the existing file. Detect by modification time, not by a new filename.
        const clickedAt = Date.now() - 2000; // small allowance for clock/mtime granularity
        await page.click("#okButton");

        // Wait for download to finish (longer ranges take longer)
        onStep('Downloading file');
        console.log('Waiting for file...');
        let newFile = null;
        let lastSize = -1;
        for (let waited = 0; waited < 90; waited++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const currentFiles = await fs.readdir(rawDownloadPath);
            if (currentFiles.some(x => x.endsWith('.crdownload'))) continue; // still writing
            let candidate = null;
            for (const x of currentFiles.filter(f => f.toLowerCase().endsWith('.csv'))) {
                const st = await fs.stat(path.join(rawDownloadPath, x));
                if (st.mtimeMs >= clickedAt && (!candidate || st.mtimeMs > candidate.mtimeMs)) {
                    candidate = { name: x, mtimeMs: st.mtimeMs, size: st.size };
                }
            }
            if (!candidate) continue;
            // accept once the size is stable across two checks
            if (candidate.size > 0 && candidate.size === lastSize) {
                newFile = candidate.name;
                break;
            }
            lastSize = candidate.size;
        }

        if (newFile) {
            console.log('File downloaded:', newFile);
            onStep('Processing file');
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


// --- Cheque / Bank Receipt confirmation (same WA 'bankrec' template + SMS as Cash Receipts) ---

const WHATSAPP_DELAY_MS = 4000; // gap between WhatsApp messages to avoid spam detection
const SMS_DELAY_MS = 1000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// txnNo -> { whatsapp, sms, mobile, updatedAt }  (pending | sent | failed | no-mobile | skipped)
const notifyStatus = new Map();
function setNotify(txnNo, patch) {
    notifyStatus.set(txnNo, { ...(notifyStatus.get(txnNo) || {}), ...patch, updatedAt: Date.now() });
    if (notifyStatus.size > 2000) notifyStatus.delete(notifyStatus.keys().next().value);
}

async function sendBankReceiptConfirmations(receipts) {
    if (!receipts.length) return;
    receipts.forEach(r => setNotify(r.txnNo, { whatsapp: 'pending', sms: 'pending' }));

    let cmplData = [];
    try {
        const cmplPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
        cmplData = JSON.parse(await fs.readFile(cmplPath, 'utf8'));
    } catch (e) {
        console.error('[Bank Receipt Notify] Could not read CMPL.json, skipping confirmations:', e.message);
        receipts.forEach(r => setNotify(r.txnNo, { whatsapp: 'failed', sms: 'failed', error: 'Party list unavailable' }));
        return;
    }

    let sent = 0;
    for (const r of receipts) {
        const party = cmplData.find(p => p.C_CODE === r.partyCode);
        const mobileNumber = String(party?.C_PHONE || party?.C_MOBILE || '').trim();
        if (!mobileNumber) {
            console.log(`[Bank Receipt Notify] No mobile for party ${r.partyCode} (txn ${r.txnNo}). Skipping.`);
            setNotify(r.txnNo, { whatsapp: 'no-mobile', sms: 'no-mobile' });
            continue;
        }

        const rawMobile = mobileNumber.replace(/\D/g, '');
        const tenDigit = (rawMobile.startsWith('91') && rawMobile.length === 12) ? rawMobile.slice(2) : rawMobile;
        const recipientNumber = `+91${tenDigit}`;
        setNotify(r.txnNo, { mobile: tenDigit });
        const m = moment(r.date, ['DD-MM-YYYY', 'DD/MM/YYYY', 'DD-MMM-YYYY', 'YYYY-MM-DD']);
        const formattedDate = m.isValid() ? m.format('DD-MM-YYYY') : String(r.date || '');
        const isCheque = /CHQ|CHEQUE|CLG|CLEARING/i.test(r.narration || '');
        const ref = `BY ${isCheque ? 'CHQ' : 'BANK'} ${r.txnNo}`;

        if (sent > 0) await sleep(WHATSAPP_DELAY_MS);
        sent++;

        // WhatsApp — template 'bankrec':
        // "We Thankfully acknowledge of receipt Rs: {{1}} ,{{2}} on Date {{3}}. Regards, EKTA ENTERPRISES"
        try {
            const WA_SEND_URL = `http://127.0.0.1:${process.env.WHATSAPP_PORT || 4292}/send`;
            const waRes = await axios.post(WA_SEND_URL, {
                to: recipientNumber,
                type: 'template',
                templateName: 'bankrec',
                language: { code: 'en' },
                components: { body: { params: [r.amount.toFixed(2), ref, formattedDate] } },
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
            console.log(`[Bank Receipt Notify] WhatsApp sent for txn ${r.txnNo} to ${recipientNumber} (status ${waRes.status})`);
            setNotify(r.txnNo, { whatsapp: 'sent' });
        } catch (err) {
            console.error(`[Bank Receipt Notify] WhatsApp failed for txn ${r.txnNo}: ${err.message}`);
            setNotify(r.txnNo, { whatsapp: 'failed' });
        }

        // SMS — same DLT template text as Cash Receipts
        try {
            await sleep(SMS_DELAY_MS);
            const smsMessage = `We Thankfully Acknowledge Receipt of Rs Amount : ${r.amount.toFixed(2)} on Date ${formattedDate} Regards Ekta Enterprises`;
            const smsRes = await axios.get('https://control.arihantglobal.in/fe/api/v1/send', {
                params: {
                    username: 'ektaenterprises.trans',
                    password: 'sbe3d',
                    dltPrincipalEntityId: '1501397800000015092',
                    from: 'EKTAEN',
                    to: '91' + tenDigit,
                    text: smsMessage,
                    unicode: false,
                }
            });
            if (smsRes.data && smsRes.data.statusCode == 200) {
                console.log(`[Bank Receipt Notify] SMS sent for txn ${r.txnNo}`);
                setNotify(r.txnNo, { sms: 'sent' });
            } else {
                console.warn(`[Bank Receipt Notify] SMS failed for txn ${r.txnNo}: ${JSON.stringify(smsRes.data)}`);
                setNotify(r.txnNo, { sms: 'failed' });
            }
        } catch (err) {
            console.error(`[Bank Receipt Notify] SMS error for txn ${r.txnNo}: ${err.message}`);
            setNotify(r.txnNo, { sms: 'failed' });
        }
    }
}




// --- Routes ---

const {
    PNB_BANK_CODE, scanCashDbf, invalidateCashCache, loadStore, saveStore, parseStatementCsv,
    parseNarration, txnKeys, buildPartyIndex, buildBillIndex, matchParty, voucherTypeFor,
    computeBalanceRecon, dailyBalanceHistory,
} = require('./pnbHelpers');

// Day-end bank balances from every statement ever downloaded (cached on the folder's state)
let statementHistoryCache = null;
async function loadStatementDayEnds() {
    if (!fsSync.existsSync(EDITED_DIR)) return new Map();
    const files = (await fs.readdir(EDITED_DIR)).filter(f => f.startsWith('statement-') && f.endsWith('.csv'));
    const stats = await Promise.all(files.map(async f => ({ f, mtimeMs: (await fs.stat(path.join(EDITED_DIR, f))).mtimeMs })));
    const key = stats.map(x => `${x.f}:${x.mtimeMs}`).join('|');
    if (statementHistoryCache && statementHistoryCache.key === key) return statementHistoryCache.dayEnds;

    // oldest file first so later (more complete) downloads overwrite a day's closing balance
    stats.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const dayEnds = new Map(); // YYYYMMDD -> owed at end of that day
    for (const { f } of stats) {
        try {
            const { rows } = parseStatementCsv(await fs.readFile(path.join(EDITED_DIR, f), 'utf8'));
            const seen = new Set();
            for (const r of rows) { // newest first: first row of each date = that day's closing
                const d = moment(r.date, 'DD-MM-YYYY').format('YYYYMMDD');
                if (seen.has(d)) continue;
                seen.add(d);
                dayEnds.set(d, r.balanceSide === 'Cr' ? -r.balance : r.balance);
            }
        } catch { /* skip unreadable file */ }
    }
    statementHistoryCache = { key, dayEnds };
    return dayEnds;
}

const jsonDir = () => path.join(process.env.DBF_FOLDER_PATH, 'data', 'json');

async function readJsonSafe(file, fallback = []) {
    try {
        return JSON.parse(await fs.readFile(path.join(jsonDir(), file), 'utf8'));
    } catch (e) {
        console.warn(`[PNB] Could not read ${file}: ${e.message}`);
        return fallback;
    }
}

async function findLatestStatementFile() {
    let latest = null;
    const consider = async (filePath) => {
        const st = await fs.stat(filePath);
        if (!latest || st.mtimeMs > latest.mtimeMs) latest = { path: filePath, mtimeMs: st.mtimeMs };
    };
    if (fsSync.existsSync(EDITED_DIR)) {
        for (const file of await fs.readdir(EDITED_DIR)) {
            if (file.startsWith('statement-') && file.endsWith('.csv')) await consider(path.join(EDITED_DIR, file));
        }
    }
    const pnbCr = path.join(DOWNLOADS_DIR, 'pnbcr.csv');
    if (fsSync.existsSync(pnbCr)) await consider(pnbCr);
    return latest;
}

// ---- Download job (runs in background, polled by the page) ----

const downloadJob = { status: 'idle', step: '', message: '', attempt: 0, startedAt: null, finishedAt: null };
const MAX_DOWNLOAD_ATTEMPTS = 3; // captcha OCR is not always right first time

async function runDownloadJob(opts = {}) {
    Object.assign(downloadJob, { status: 'running', step: 'Starting', message: '', attempt: 0, fromDate: opts.fromDate || '', startedAt: Date.now(), finishedAt: null });
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
        downloadJob.attempt = attempt;
        try {
            await runDownload(step => { downloadJob.step = step; }, opts);
            Object.assign(downloadJob, { status: 'done', step: 'Done', message: 'Statement downloaded', finishedAt: Date.now() });
            return;
        } catch (err) {
            const retryable = /Login failed|captcha/i.test(err.message || '');
            console.error(`[PNB] Download attempt ${attempt} failed:`, err.message);
            if (!retryable || attempt === MAX_DOWNLOAD_ATTEMPTS) {
                Object.assign(downloadJob, { status: 'failed', message: err.message || 'Download failed', finishedAt: Date.now() });
                return;
            }
            downloadJob.step = `Retrying (captcha) ${attempt + 1}/${MAX_DOWNLOAD_ATTEMPTS}`;
        }
    }
}

router.post('/pnb-statement/download', (req, res) => {
    if (downloadJob.status === 'running') {
        return res.status(409).json({ message: 'A download is already running.', job: downloadJob });
    }
    let fromDate = '';
    if (req.body && req.body.fromDate) {
        const m = moment(String(req.body.fromDate), ['DD-MM-YYYY', 'YYYY-MM-DD'], true);
        if (!m.isValid() || m.isAfter(moment())) return res.status(400).json({ message: 'Invalid from date' });
        fromDate = m.format('DD-MM-YYYY');
    }
    runDownloadJob({ fromDate }).catch(err => console.error('[PNB] Download job crashed:', err));
    res.json({ message: 'Download started.', job: downloadJob });
});

router.get('/pnb-statement/download/status', (req, res) => {
    res.json(downloadJob);
});

// ---- Pending transactions ----

router.get('/pnb-statement/pending', async (req, res) => {
    try {
        if (!process.env.DBF_FOLDER_PATH) return res.status(500).json({ message: 'DBF_FOLDER_PATH not set' });

        const file = await findLatestStatementFile();
        if (!file) return res.status(404).json({ message: 'No statement file found. Please download one first.' });

        const { meta, rows } = parseStatementCsv(await fs.readFile(file.path, 'utf8'));

        // Everything already in CASH.DBF (by bank txn no.) is not pending.
        // If the scan fails we must NOT show everything as pending; report the error instead.
        let cash;
        try {
            cash = await scanCashDbf();
        } catch (err) {
            console.error('[PNB] CASH.DBF scan failed:', err);
            return res.status(500).json({ message: `Could not read CASH.DBF: ${err.message}` });
        }

        const [cmplData, bankDtlData, billData, store] = await Promise.all([
            readJsonSafe('CMPL.json'), readJsonSafe('BANKDTL.json'), readJsonSafe('BILL.json'), loadStore(),
        ]);
        const ctx = {
            partyIndex: buildPartyIndex(cmplData, bankDtlData),
            billIndex: buildBillIndex(billData),
            history: cash.history,
            store,
        };

        let balance = null;
        try {
            balance = computeBalanceRecon(cash.bankLedger, meta, rows);
            if (balance) balance.history = dailyBalanceHistory(cash.bankLedger, await loadStatementDayEnds());
        } catch (err) {
            console.error('[PNB] Balance reconciliation failed:', err);
        }

        let alreadyEntered = 0;
        const pendingTransactions = [];
        rows.forEach((row, index) => {
            if (cash.bankSet.has(row.txnNo.toUpperCase())) { alreadyEntered++; return; }
            const parsed = parseNarration(row.narration);
            pendingTransactions.push({
                id: index,
                ...row,
                channel: parsed.channel,
                senderName: parsed.name,
                senderMobile: parsed.mobiles[0] || '',
                vpa: parsed.vpa,
                voucherType: voucherTypeFor(row),
                ignored: Boolean(store.ignored[row.txnNo]),
                ...matchParty(row, parsed, ctx),
            });
        });

        res.json({
            pendingTransactions,
            parties: cmplData.filter(p => p.C_CODE && !p._deleted)
                .map(p => ({ value: p.C_CODE, label: `${p.C_NAME} (${p.C_CODE})` })),
            balance,
            summary: {
                ...meta,
                fileName: path.basename(file.path),
                downloadedAt: file.mtimeMs,
                statementRows: rows.length,
                alreadyEntered,
                cashScannedAt: cash.scannedAt,
            },
        });
    } catch (error) {
        console.error('Error getting pending transactions:', error);
        res.status(500).json({ message: error.message || 'Failed to get pending transactions' });
    }
});

// ---- Ignore / un-ignore (e.g. entries posted manually or not meant for the books) ----

router.post('/pnb-statement/ignore', async (req, res) => {
    try {
        const { txnNos, ignore = true } = req.body || {};
        if (!Array.isArray(txnNos) || !txnNos.length) return res.status(400).json({ message: 'txnNos required' });
        const store = await loadStore();
        for (const t of txnNos) {
            if (ignore) store.ignored[t] = { at: new Date().toISOString() };
            else delete store.ignored[t];
        }
        await saveStore(store);
        res.json({ message: ignore ? `Ignored ${txnNos.length} transaction(s)` : `Restored ${txnNos.length} transaction(s)` });
    } catch (error) {
        console.error('[PNB] ignore failed:', error);
        res.status(500).json({ message: 'Failed to update ignore list' });
    }
});

// ---- Save selected transactions ----

let saving = false;

router.post('/pnb-statement/save', async (req, res) => {
    if (saving) return res.status(409).json({ message: 'A save is already in progress. Please wait.' });
    saving = true;
    let dbf;
    try {
        const { transactions } = req.body || {};
        if (!Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ message: 'No transactions to save' });
        }

        const cmplData = await readJsonSafe('CMPL.json');
        const validCodes = new Set(cmplData.map(p => p.C_CODE));

        // Fresh scan right before writing: catches entries made meanwhile and gives correct VR numbers
        const cash = await scanCashDbf({ force: true });
        const next = { BP: cash.maxVr.BP + 1, BR: cash.maxVr.BR + 1, CP: cash.maxVr.CP + 1 };

        const newRecords = [];
        const created = [];
        const skipped = [];
        const bankReceipts = [];
        const seen = new Set();

        for (const txn of transactions) {
            const txnNo = String(txn.txnNo || '').trim();
            const narration = String(txn.narration || '');
            const drAmount = Number(txn.drAmount) || 0;
            const crAmount = Number(txn.crAmount) || 0;
            const partyCode = String(txn.partyCode || '').trim();
            const date = moment(txn.date, ['DD-MM-YYYY', 'DD/MM/YYYY', 'DD-MMM-YYYY'], true);

            if (!txnNo) { skipped.push({ txnNo, reason: 'Missing txn no.' }); continue; }
            if (cash.bankSet.has(txnNo.toUpperCase()) || seen.has(txnNo)) { skipped.push({ txnNo, reason: 'Already in CASH.DBF' }); continue; }
            if (!partyCode || !validCodes.has(partyCode)) { skipped.push({ txnNo, reason: 'No valid party selected' }); continue; }
            if (!date.isValid()) { skipped.push({ txnNo, reason: `Bad date "${txn.date}"` }); continue; }

            const type = voucherTypeFor({ crAmount, drAmount, narration });
            if (!type) { skipped.push({ txnNo, reason: 'Zero amount' }); continue; }
            const amount = type === 'BP' ? drAmount : crAmount;
            seen.add(txnNo);

            const vrString = `${type}-${String(next[type]++).padStart(6, '0')}`;
            const remark = `${narration} / ${txnNo}`;

            // Party side
            newRecords.push({
                VR: vrString,
                DATE: date.toDate(),
                C_CODE: partyCode,
                REMARK: remark,
                BANK: txnNo,
                DR: (type === 'BP' || type === 'CP') ? amount : 0,
                CR: (type === 'BR') ? amount : 0,
                M_GROUP1: '',
            });

            // Bank side (contra) for BR / BP
            if (type === 'BR' || type === 'BP') {
                newRecords.push({
                    VR: vrString,
                    DATE: date.toDate(),
                    C_CODE: PNB_BANK_CODE,
                    REMARK: remark,
                    BANK: txnNo,
                    DR: (type === 'BR') ? amount : 0,
                    CR: (type === 'BP') ? amount : 0,
                    M_GROUP1: '',
                });
            }

            const party = cmplData.find(p => p.C_CODE === partyCode);
            created.push({ txnNo, vr: vrString, type, amount, partyCode, partyName: party ? party.C_NAME : '', narration });
            if (type === 'BR') bankReceipts.push({ txnNo, date: txn.date, narration, partyCode, amount });
        }

        if (newRecords.length) {
            dbf = await DBFFile.open(cash.path);
            await dbf.appendRecords(newRecords);
            await dbf.close();
            dbf = null;
            invalidateCashCache();
            console.log(`[PNB] Appended ${newRecords.length} records (${created.length} vouchers) to CASH.DBF`);
        }

        // Learn narration -> party from what the user confirmed, and un-ignore saved txns
        if (created.length) {
            try {
                const store = await loadStore();
                for (const c of created) {
                    for (const k of txnKeys(parseNarration(c.narration))) {
                        store.partyMap[k] = { code: c.partyCode, at: new Date().toISOString() };
                    }
                    delete store.ignored[c.txnNo];
                }
                await saveStore(store);
            } catch (e) {
                console.error('[PNB] Could not update learned mappings:', e.message);
            }
        }

        res.json({
            message: created.length
                ? `Saved ${created.length} voucher(s)${skipped.length ? `, skipped ${skipped.length}` : ''}`
                : 'Nothing saved',
            count: newRecords.length,
            created: created.map(({ narration, ...c }) => c),
            skipped,
        });

        // Fire-and-forget: rate-limited sends can take a while, don't block the response
        sendBankReceiptConfirmations(bankReceipts)
            .catch(err => console.error('[Bank Receipt Notify] Unexpected error:', err));
    } catch (error) {
        console.error('Error saving transactions:', error);
        if (dbf) await dbf.close().catch(() => { });
        res.status(500).json({ message: `Failed to save transactions: ${error.message}` });
    } finally {
        saving = false;
    }
});

// ---- WhatsApp / SMS confirmation status for saved receipts ----

router.get('/pnb-statement/notify-status', (req, res) => {
    const txnNos = String(req.query.txnNos || '').split(',').map(s => s.trim()).filter(Boolean);
    const result = {};
    for (const t of txnNos) result[t] = notifyStatus.get(t) || null;
    res.json(result);
});

module.exports = router;
