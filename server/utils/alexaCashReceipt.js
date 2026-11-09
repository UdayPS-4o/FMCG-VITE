/**
 * Save and print cash receipts for the Alexa skill — no browser page needed.
 *
 * Saving writes the same records the Cash Receipt page POSTs to /cash-receipts (db/cash-receipts.json),
 * with the same numbering (/slink/cashReceiptId) and the same over-20,000 split, so they show up on
 * DB → Cash Receipts and go through the normal approval / DBF sync.
 *
 * Printing renders the receipt print page (/print, as the printer icon on DB → Cash Receipts) in headless Chrome and sends the PDF to this
 * machine's default Windows printer.
 */
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer');
const { print: printPdf, getDefaultPrinter } = require('pdf-to-printer');
const { sendNotificationToAdmins } = require('../routes/push');

const DEFAULT_SERIES = (process.env.ALEXA_RECEIPT_SERIES || 'O').toUpperCase();
const DEFAULT_SM = process.env.ALEXA_RECEIPT_SM || 'SM003';
const PRINT_PAGE_BASE = process.env.ALEXA_PRINT_BASE_URL || 'https://test.ekta-enterprises.com';

const DB_DIR = path.join(__dirname, '..', 'db');
const RECEIPTS_FILE = path.join(DB_DIR, 'cash-receipts.json');
const APPROVED_FILE = path.join(DB_DIR, 'approved', 'cash-receipts.json');
const PDF_DIR = path.join(DB_DIR, 'pdfs', 'alexa');

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
};

/** Highest receipt no. used for the series (DBF CASH.json, pending, approved) + 1 — same as /slink/cashReceiptId */
const nextReceiptNo = async (series) => {
  const s = series.toUpperCase();
  let max = 0;
  const cash = await readJson(path.join(process.env.DBF_FOLDER_PATH, 'data/json', 'CASH.json'), []);
  for (const e of cash) {
    if (e && !e._deleted && String(e.VR || '').startsWith('CR') && String(e.SERIES || '').toUpperCase() === s) {
      const n = Number(e.R_NO);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  for (const list of [await readJson(RECEIPTS_FILE, []), await readJson(APPROVED_FILE, [])]) {
    for (const e of list) {
      if (String(e.series || '').toUpperCase() === s) {
        const n = Number(e.receiptNo);
        if (!isNaN(n) && n > max) max = n;
      }
    }
  }
  return max + 1;
};

/** Same split as the Cash Receipt page: pieces of at most 20,000, each next one 500 lower */
const splitAmounts = (total) => {
  const MAX = 20000, UNIT = 500, EPS = 0.01;
  if (total <= MAX) return [total.toFixed(2)];
  const out = [];
  let remaining = total;
  let ideal = MAX;
  while (remaining > EPS) {
    const take = ideal >= remaining - EPS ? remaining : ideal;
    out.push(take.toFixed(2));
    remaining = parseFloat((remaining - take).toFixed(2));
    if (remaining > EPS) ideal = Math.max(UNIT, Math.floor((ideal - 1) / UNIT) * UNIT);
  }
  return out;
};

const todayIST = () => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 10); // yyyy-mm-dd, what the page sends
};

let saving = Promise.resolve(); // serialise saves so two calls can't take the same number

/**
 * Save a receipt. Returns { series, receiptNos: string[], amounts: string[] }.
 * @param {{ party: {code: string, name: string}, amount: number, series?: string, sm?: {code: string, name: string} }} input
 */
const saveReceipt = (input) => {
  const run = saving.then(async () => {
    const series = (input.series || DEFAULT_SERIES).toUpperCase();
    const smCode = input.sm?.code || DEFAULT_SM;
    const cmpl = await readJson(path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'CMPL.json'), []);
    const smRow = cmpl.find(r => r.C_CODE === smCode);
    const smName = input.sm?.name || (smRow ? smRow.C_NAME.trim() : '');

    const amounts = splitAmounts(Number(input.amount));
    const first = await nextReceiptNo(series);
    const list = await readJson(RECEIPTS_FILE, []);
    const now = new Date().toISOString();
    const receiptNos = [];

    amounts.forEach((amt, i) => {
      const receiptNo = String(first + i);
      receiptNos.push(receiptNo);
      const rec = {
        date: todayIST(),
        series,
        amount: amounts.length === 1 ? String(input.amount) : amt,
        discount: i === 0 ? '' : '0',
        receiptNo,
        narration: `BY CASH ON R/NO.${series}-${receiptNo}`,
        party: input.party.code,
        sm: smCode,
        smName,
        source: 'alexa',
        createdAt: now,
      };
      if (amounts.length > 1) Object.assign(rec, { originalAmount: String(input.amount), splitIndex: i, totalSplits: amounts.length });
      list.push(rec);
    });

    await fs.writeFile(RECEIPTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    console.log(`[Alexa] Saved cash receipt(s) ${series}-${receiptNos.join(',')} for ${input.party.code} = ${input.amount}`);

    // Same admin notification as a receipt saved from the page
    try {
      sendNotificationToAdmins({
        title: 'New Entry in Cash Receipts',
        message: `Alexa has created a Cash Receipts ${series}-${receiptNos[0]} of ₹${input.amount} for ${input.party.name}`,
        data: {
          url: `https://ekta-enterprises.com/proxy/api/approve-from-notification?endpoint=cash-receipts&id=${receiptNos[0]}`,
          endpoint: 'cash-receipts',
          id: receiptNos[0],
        },
      }, 'cash-receipts', { owner: list[list.length - 1] });
    } catch (err) {
      console.error('[Alexa] Notification failed:', err.message);
    }

    return { series, receiptNos, amounts };
  });
  saving = run.catch(() => {});
  return run;
};

/** A short-lived login token for an admin user, only used inside the headless print browser */
const serviceToken = async () => {
  const users = await readJson(path.join(DB_DIR, 'users.json'), []);
  const admin = users.find(u => (u.routeAccess || []).includes('Admin'));
  if (!admin) throw new Error('No admin user to render the print page');
  return jwt.sign({ userId: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: '5m' });
};

/** Render the normal receipt print page to PDF and send it to the default printer. Returns the PDF path. */
const printReceipts = async (receiptNos) => {
  await fs.mkdir(PDF_DIR, { recursive: true });
  const pdfPath = path.join(PDF_DIR, `cash-receipt-${receiptNos.join('_')}-${Date.now()}.pdf`);
  const token = await serviceToken();

  const opts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const browser = await puppeteer.launch(opts);
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((t) => { localStorage.setItem('token', t); }, token);
    const url = `${PRINT_PAGE_BASE}/print?ReceiptNo=${receiptNos.join(',')}`; // same layout as the printer icon on DB → Cash Receipts
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait until the receipt data has rendered (the party code appears on the page)
    await page.waitForFunction(() => !document.querySelector('.animate-spin') && document.body.innerText.length > 200, { timeout: 30000 });
    await page.emulateMediaType('print');
    await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }

  const printer = await getDefaultPrinter().catch(() => null);
  await printPdf(pdfPath); // default printer
  console.log(`[Alexa] Printed ${path.basename(pdfPath)} on ${printer?.name || 'default printer'}`);
  return pdfPath;
};

module.exports = { saveReceipt, printReceipts, nextReceiptNo, splitAmounts, DEFAULT_SERIES, DEFAULT_SM };
