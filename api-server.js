const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const XLSX = require('xlsx');
const cron = require('node-cron');
const archiver = require('archiver');
const moment = require('moment');
const axios = require('axios');

const WORKING_DIR = 'C:\\Users\\shubham\\Desktop\\fmcg';
const PORT = 3188;
// Public-facing base URL for file downloads (used when returning download URLs)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://server.ekta-enterprises.com';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Helpers ────────────────────────────────────────────────────────────────

function isValidNumber(number) {
    return /^[0-9]{10}$/.test(number);
}

async function waitForFile(filePath, timeout = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (fs.existsSync(filePath)) return true;
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

async function waitForFileModified(filePath, initialModTime, timeout) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (fs.existsSync(filePath)) {
            const currentModTime = fs.statSync(filePath).mtimeMs;
            if (currentModTime !== initialModTime) return true;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

async function convertDbfToJson(filename) {
    return new Promise((resolve, reject) => {
        const process = spawn('python', ['./dbfJS.py', filename], { cwd: WORKING_DIR });
        let data = '';
        process.stdout.on('data', chunk => data += chunk);
        process.stderr.on('data', chunk => console.error('[DBF] stderr:', chunk));
        process.on('close', code => {
            if (code === 0) {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Failed to parse DBF JSON: ' + e.message)); }
            } else {
                reject(new Error('dbfJS.py exited with code ' + code));
            }
        });
    });
}

// ─── Product Catalog (live from webapp server port 80) ─────────────────────
// The webapp server at port 80 already builds, filters (stock > 0), and
// enriches products with images + active schemes from the DBF + SQLite store.
// We reuse that exact endpoint so WhatsApp catalog and the retailer app always
// show the same products.

const WEBAPP_API = 'https://localhost/api/app';
// Internal loopback call — skip cert check since cert is for server.ekta-enterprises.com
const _internalAgent = new (require('https').Agent)({ rejectUnauthorized: false });

// In-memory catalog cache — refreshed every 10 minutes or on first CATALOG tap.
let _catalogCache = null;
let _catalogCacheTime = 0;
const CATALOG_CACHE_TTL = 10 * 60 * 1000; // 10 min

async function fetchCatalogProducts(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _catalogCache && (now - _catalogCacheTime) < CATALOG_CACHE_TTL) {
        return _catalogCache;
    }
    try {
        // Fetch all in-stock products in one shot (high limit, no auth needed for products)
        const res = await axios.get(WEBAPP_API + '/products?page=1&limit=2000', { timeout: 15000, httpsAgent: _internalAgent });
        const products = res.data.data || [];
        if (products.length === 0) {
            console.warn('[CATALOG] webapp returned 0 products');
            return _catalogCache || { allProducts: [], categories: [], byCategory: new Map() };
        }

        // Build brand-prefix map (first 3 chars of CODE)
        const catMap = new Map();
        for (const p of products) {
            const prefix = String(p.CODE || '').substring(0, 3).toUpperCase();
            if (!prefix) continue;
            if (!catMap.has(prefix)) catMap.set(prefix, []);
            catMap.get(prefix).push(p);
        }

        const categories = [];
        for (const [prefix, prods] of catMap) {
            categories.push({ prefix, label: prefix, count: prods.length });
        }
        categories.sort((a, b) => a.prefix.localeCompare(b.prefix));

        _catalogCache = { allProducts: products, categories, byCategory: catMap };
        _catalogCacheTime = now;
        console.log(`[CATALOG] Refreshed: ${products.length} products in ${categories.length} categories`);
        return _catalogCache;
    } catch (e) {
        console.error('[CATALOG] Failed to fetch from webapp:', e.message);
        return _catalogCache || { allProducts: [], categories: [], byCategory: new Map() };
    }
}

// Warm the cache at startup (non-blocking)
fetchCatalogProducts().catch(() => { });

// Helper: find product by CODE across all products
async function findCatalogProduct(code) {
    const { allProducts } = await fetchCatalogProducts();
    return allProducts.find(p => p.CODE === code) || null;
}

// ─── Cart State ───────────────────────────────────────────────────────────────

const orderCarts = new Map();
const CART_TIMEOUT_MS = 30 * 60 * 1000;
const pendingProductQty = new Map();
const PENDING_QTY_TIMEOUT_MS = 10 * 60 * 1000;
const pendingCheckoutPhone = new Map();
const PENDING_CHECKOUT_PHONE_MS = 10 * 60 * 1000;

function getOrCreateCart(phoneNumber) {
    const existing = orderCarts.get(phoneNumber);
    if (existing && (Date.now() - existing.updatedAt) < CART_TIMEOUT_MS) {
        return existing;
    }
    const cart = { phoneNumber, items: [], updatedAt: Date.now() };
    orderCarts.set(phoneNumber, cart);
    return cart;
}

function addToCart(phoneNumber, code, qty) {
    const cart = getOrCreateCart(phoneNumber);
    // product will be resolved async at checkout — store just code+qty for now
    // but also store name+rate if we have it cached
    const cached = _catalogCache && _catalogCache.allProducts.find(p => p.CODE === code);
    const existing = cart.items.find(i => i.code === code);
    if (existing) {
        existing.qty = qty;
        if (cached) { existing.name = cached.PRODUCT; existing.rate = parseFloat(cached.RATE1) || 0; }
    } else {
        cart.items.push({
            code,
            name: cached ? cached.PRODUCT : code,
            rate: cached ? (parseFloat(cached.RATE1) || 0) : 0,
            qty,
        });
    }
    cart.updatedAt = Date.now();
    return cart;
}

function clearCart(phoneNumber) {
    orderCarts.delete(phoneNumber);
}

function checkoutCart(phoneNumber) {
    const cart = orderCarts.get(phoneNumber);
    if (!cart || cart.items.length === 0) return null;
    const ordersDir = path.join(WORKING_DIR, 'output', 'orders');
    if (!fs.existsSync(ordersDir)) fs.mkdirSync(ordersDir, { recursive: true });
    const orderId = phoneNumber + '_' + Date.now();
    const orderData = {
        orderId,
        phoneNumber,
        createdAt: new Date().toISOString(),
        items: cart.items,
        total: cart.items.reduce((s, i) => s + i.mrp * i.qty, 0),
    };
    // Preserve order in cart temp state for ORDER_CONFIRM flow
    cart._lastOrder = orderData;
    cart._pendingCheckout = true;
    // Don't delete cart yet — wait for delivery phone confirmation
    return orderData;
}

function formatCartSummary(phoneNumber) {
    const cart = orderCarts.get(phoneNumber);
    if (!cart || cart.items.length === 0) return 'Your cart is empty.\nType "catalog" to browse products.';
    let text = '*Your Cart:*\n\n';
    let total = 0;
    cart.items.forEach((item, idx) => {
        const rate = item.rate || item.mrp || 0;
        const lineTotal = rate * item.qty;
        total += lineTotal;
        text += `${idx + 1}. ${item.name}\n`;
        text += `   Qty: ${item.qty} × ₹${rate.toFixed(2)} = ₹${lineTotal.toFixed(2)}\n\n`;
    });
    text += `*Grand Total: ₹${total.toFixed(2)}*`;
    return text;
}

const ADMIN_PHONES = ['9826623188', '9098156713'];

async function sendOrderNotificationToAdmin(customerPhone, order) {
    const orderLink = (process.env.PUBLIC_BASE_URL || 'https://server.ekta-enterprises.com') +
        '/admin/orders/' + order.orderId + '.json';
    const notification =
        '🛒 *New Order Received!*\n\n' +
        '*Order ID:* ' + order.orderId + '\n' +
        '*Customer Phone:* ' + customerPhone + '\n' +
        '*Delivery Phone:* ' + order.deliveryPhone + '\n';
    if (order.items.length <= 5) {
        order.items.forEach(item => {
            notification += '• ' + item.qty + ' × ' + item.name + ' = ₹' + (item.mrp * item.qty).toFixed(2) + '\n';
        });
    } else {
        notification += '*Items:* ' + order.items.length + ' products\n';
        order.items.slice(0, 3).forEach(item => {
            notification += '• ' + item.qty + ' × ' + item.name + ' = ₹' + (item.mrp * item.qty).toFixed(2) + '\n';
        });
        notification += '... and ' + (order.items.length - 3) + ' more\n';
    }
    notification += '\n*Total: ₹' + order.total.toFixed(2) + '*\n\n';
    notification += '_' + orderLink + '_';

    for (const adminPhone of ADMIN_PHONES) {
        try {
            await sendTextAoc(adminPhone, notification);
            await sendCtaUrlAoc(adminPhone, 'View Order Details', 'Open', orderLink).catch(() => { });
        } catch (err) {
            console.error('[WEBHOOK] Admin notify error for', adminPhone, ':', err.message);
        }
    }
}

async function sendCatalogList(phoneNumber, page) {
    const catalog = await fetchCatalogProducts();
    const cats = catalog.categories;
    if (cats.length === 0) {
        return sendTextAoc(phoneNumber, 'Catalog is empty or unavailable right now. Please try again later.');
    }
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(cats.length / pageSize));
    const safePage = Math.max(0, Math.min(page || 0, totalPages - 1));
    const start = safePage * pageSize;
    const slice = cats.slice(start, start + pageSize);

    const rows = slice.map(c => ({
        id: 'CAT_' + c.prefix,
        title: c.prefix + ' (' + c.count + ' items)',
        description: '',
    }));

    const sections = [{ title: 'Categories (' + cats.length + ' total)', rows }];

    const buttons = [];
    if (safePage > 0) buttons.push({ id: 'CAT_PAGE_' + (safePage - 1), title: '‹ Prev' });
    if (safePage < totalPages - 1) buttons.push({ id: 'CAT_PAGE_' + (safePage + 1), title: 'Next ›' });
    if (buttons.length === 0) buttons.push({ id: 'BALANCE', title: '‹ Main Menu' });

    return sendListAoc(phoneNumber, 'Select a product category:', 'View Categories', sections)
        .then(() => sendButtonsAoc(phoneNumber, 'Navigate or go back:', buttons));
}

async function sendProductList(phoneNumber, prefix, page) {
    const catalog = await fetchCatalogProducts();
    const products = catalog.byCategory.get(prefix) || [];
    if (products.length === 0) {
        return sendTextAoc(phoneNumber, 'No products found in this category.');
    }
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
    const safePage = Math.max(0, Math.min(page || 0, totalPages - 1));
    const start = safePage * pageSize;
    const slice = products.slice(start, start + pageSize);

    const rows = slice.map(p => {
        const rate = parseFloat(p.RATE1 || '0');
        const schemeNote = p.schemes && p.schemes.length > 0
            ? ' | ' + p.schemes[0].discount + '% off ' + p.schemes[0].slab1 + '+'
            : '';
        return {
            id: 'CAT_PRD_' + p.CODE,
            title: p.PRODUCT.substring(0, 24),
            description: '₹' + rate.toFixed(2) + schemeNote,
        };
    });

    const sections = [{ title: prefix + ' — ' + products.length + ' products', rows }];

    const navButtons = [];
    if (safePage > 0) navButtons.push({ id: 'CAT_EP_' + prefix + '_' + (safePage - 1), title: '‹ Prev' });
    if (safePage < totalPages - 1) navButtons.push({ id: 'CAT_EP_' + prefix + '_' + (safePage + 1), title: 'Next ›' });
    navButtons.push({ id: 'CAT_BACK_MENU', title: '‹ Categories' });

    return sendListAoc(phoneNumber, 'Tap a product to add to cart:', 'View Products', sections)
        .then(() => sendButtonsAoc(phoneNumber, '', navButtons));
}

// ─── XLSX to PDF ────────────────────────────────────────────────────────────

async function convertXLSXtoPDF(inputFile, outputFile) {
    const puppeteer = require('puppeteer');
    try {
        const workbook = XLSX.readFile(inputFile);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = data[0];
        const sortedData = data.slice(1).sort((a, b) => (a[0] || '').localeCompare(b[0] || ''));

        let html = '<html><head><style>' +
            'table { width: 100%; border-collapse: collapse; }' +
            'th, td { border: 1px solid black; padding: 8px; text-align: left; }' +
            'th { background-color: #f2f2f2; }' +
            '</style></head><body><table><thead><tr>';

        headers.forEach(header => { html += '<th>' + header + '</th>'; });
        html += '</tr></thead><tbody>';
        sortedData.forEach(row => {
            html += '<tr>';
            row.forEach(cell => { html += '<td>' + (cell || '') + '</td>'; });
            html += '</tr>';
        });
        html += '</tbody></table></body></html>';

        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({ path: outputFile, format: 'A4' });
        await browser.close();
        return true;
    } catch (error) {
        console.error('Error converting XLSX to PDF:', error);
        throw error;
    }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'FMCG Business API',
        version: '1.0.0',
        port: PORT,
        endpoints: [
            'GET /api/balance',
            'POST /api/balance',
            'GET /api/ledger',
            'GET /api/ledger/old',
            'GET /api/bill',
            'GET /api/stock',
            'GET /api/rate',
            'GET /api/send-message',
            'POST /api/aoc  ← CX Bot webhook, proxied at /api/whatsapp/aoc (Balance / Ledger)',
        ]
    });
});

// ── Balance ─────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/balance
 * @desc    Get customer balance by phone number
 * @query   { phoneNumber: string (10 digits) }
 * @returns { success: bool, phoneNumber, raw, formatted, imageAvailable }
 */
app.get('/api/balance', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        console.log('[API /balance GET] Received phoneNumber:', phoneNumber);
        if (!isValidNumber(phoneNumber)) {
            console.log('[API /balance GET] Invalid number, rejected:', phoneNumber);
            return res.status(400).json({ success: false, error: 'Invalid phone number. Must be 10 digits.' });
        }

        const outputPath = path.join(WORKING_DIR, 'output', 'balance', phoneNumber + '.txt');
        const imagePath = path.join(WORKING_DIR, 'output', 'static', 'ekta pnb QR.jpeg');

        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        // Use full absolute path + shell:true so cmd.exe finds WHDAT.EXE regardless of PM2 environment
        execSync('"' + WORKING_DIR + '\\WHDAT.EXE" ' + phoneNumber, { cwd: WORKING_DIR, windowsHide: true, shell: true });

        if (!(await waitForFile(outputPath, 15000))) {
            return res.status(404).json({ success: false, error: 'Balance data not available. Customer may not exist.' });
        }

        const rawBalance = fs.readFileSync(outputPath, 'utf8').trim();
        const balanceAmountMatch = rawBalance.match(/([0-9.,]+\s*DR)/i);
        const balanceAmount = balanceAmountMatch ? balanceAmountMatch[0].replace(/\s*DR/i, '').trim() : null;

        let formatted = 'Balance information not available';
        if (balanceAmount) {
            const textUpToIs = rawBalance.substring(0, rawBalance.indexOf('IS') + 2);
            formatted = '```' + textUpToIs + ' :``` *' + balanceAmount + '*';
        }

        res.json({
            success: true,
            phoneNumber,
            raw: rawBalance,
            formatted,
            imageAvailable: fs.existsSync(imagePath),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Ledger (current year) ───────────────────────────────────────────────────

/**
 * @route   GET /api/ledger
 * @desc    Generate current year ledger PDF for a customer
 * @query   { phoneNumber: string (10 digits) }
 * @returns { success: bool, phoneNumber, ledgerPath, fileName }
 */
app.get('/api/ledger', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        if (!isValidNumber(phoneNumber)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number. Must be 10 digits.' });
        }

        const outputPath = path.join(WORKING_DIR, 'output', 'LEDGER', phoneNumber + '.pdf');
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        execSync('.\\WHLED.EXE ' + phoneNumber, { cwd: WORKING_DIR, windowsHide: true });

        if (!(await waitForFile(outputPath, 15000))) {
            return res.status(404).json({ success: false, error: 'Ledger file not generated (timeout).' });
        }

        res.json({
            success: true,
            phoneNumber,
            ledgerPath: outputPath,
            ledgerUrl: publicFileUrl(outputPath),
            fileName: phoneNumber + '.pdf',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Ledger (old year 25-26) ─────────────────────────────────────────────────

/**
 * @route   GET /api/ledger/old
 * @desc    Generate old year (25-26) ledger PDF for a customer
 * @query   { phoneNumber: string (10 digits) }
 * @returns { success: bool, phoneNumber, ledgerPath, fileName }
 */
app.get('/api/ledger/old', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        if (!isValidNumber(phoneNumber)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number. Must be 10 digits.' });
        }

        const outputPath = path.join(WORKING_DIR, 'output', 'LEDGER', phoneNumber + '.pdf');
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        execSync('.\\WHLED2526.EXE ' + phoneNumber, { cwd: WORKING_DIR, windowsHide: true });

        if (!(await waitForFile(outputPath, 15000))) {
            return res.status(404).json({ success: false, error: 'Ledger file not generated (timeout).' });
        }

        res.json({
            success: true,
            phoneNumber,
            ledgerPath: outputPath,
            ledgerUrl: publicFileUrl(outputPath),
            fileName: phoneNumber + '.pdf',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Bill ────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/bill
 * @desc    Generate bill PDF for a customer
 * @query   { phoneNumber: string (10 digits), billNumber: string }
 * @returns { success: bool, phoneNumber, billNumber, billPath, fileName }
 */
app.get('/api/bill', async (req, res) => {
    try {
        const { phoneNumber, billNumber } = req.query;
        if (!phoneNumber || !billNumber) {
            return res.status(400).json({ success: false, error: 'phoneNumber and billNumber are required.' });
        }
        if (!isValidNumber(phoneNumber)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number. Must be 10 digits.' });
        }

        const billUpper = billNumber.toUpperCase();
        const outputPath = path.join(WORKING_DIR, 'output', 'bill', billUpper + '.pdf');
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        execSync('.\\BILLPDF.EXE ' + phoneNumber + ' ' + billUpper, { cwd: WORKING_DIR, windowsHide: true });

        if (!(await waitForFile(outputPath, 15000))) {
            return res.status(404).json({ success: false, error: 'Bill file not generated (timeout).' });
        }

        res.json({
            success: true,
            phoneNumber,
            billNumber: billUpper,
            billPath: outputPath,
            billUrl: publicFileUrl(outputPath),
            fileName: billUpper + '.pdf',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Stock ───────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/stock
 * @desc    Generate stock report for a company (XLS + PDF)
 * @query   { company: string, phoneNumber?: string }
 * @returns { success: bool, company, xlsPath, pdfPath, xlsFileName, pdfFileName }
 */
app.get('/api/stock', async (req, res) => {
    try {
        const { phoneNumber, company } = req.query;
        if (!company) {
            return res.status(400).json({ success: false, error: 'company is required.' });
        }

        const companyUpper = company.toUpperCase();
        const outputPath = path.join(WORKING_DIR, 'output', companyUpper + '_stock.xls');
        const numberPath = path.join(WORKING_DIR, 'output', 'company', companyUpper + '.txt');
        const mainNumbers = path.join(WORKING_DIR, 'output', 'company', 'Main.txt');

        // Validate phone number if provided
        if (phoneNumber) {
            let numberArray = [];
            if (fs.existsSync(numberPath)) {
                numberArray = fs.readFileSync(numberPath, 'utf8').trim().split('\n').map(n => n.trim());
            }
            if (fs.existsSync(mainNumbers)) {
                numberArray = numberArray.concat(fs.readFileSync(mainNumbers, 'utf8').trim().split('\n').map(n => n.trim()));
            }
            if (!numberArray.includes(phoneNumber)) {
                return res.status(403).json({ success: false, error: 'Phone number not authorized for this company.' });
            }
        }

        const initialModTime = fs.existsSync(outputPath) ? fs.statSync(outputPath).mtimeMs : null;
        execSync('.\\stk.exe ' + companyUpper, { cwd: WORKING_DIR, windowsHide: true });

        const startTime = Date.now();
        let fileReady = false;
        while (Date.now() - startTime < 15000) {
            if (fs.existsSync(outputPath)) {
                const currentModTime = fs.statSync(outputPath).mtimeMs;
                if (currentModTime !== initialModTime) { fileReady = true; break; }
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        if (!fileReady) {
            return res.status(404).json({ success: false, error: 'Stock file not generated (timeout).' });
        }

        const pdfOutputPath = outputPath.replace('.xls', '.pdf');
        try {
            await convertXLSXtoPDF(outputPath, pdfOutputPath);
            if (!(await waitForFile(pdfOutputPath, 15000))) {
                return res.status(500).json({ success: false, error: 'PDF conversion timed out.' });
            }
        } catch (pdfErr) {
            return res.status(500).json({ success: false, error: 'PDF conversion failed: ' + pdfErr.message });
        }

        res.json({
            success: true,
            company: companyUpper,
            xlsPath: outputPath,
            pdfPath: pdfOutputPath,
            xlsUrl: publicFileUrl(outputPath),
            pdfUrl: publicFileUrl(pdfOutputPath),
            xlsFileName: path.basename(outputPath),
            pdfFileName: path.basename(pdfOutputPath),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Rate Sheet ──────────────────────────────────────────────────────────────

/**
 * @route   GET /api/rate
 * @desc    Get rate sheet file path for a customer by phone number
 * @query   { phoneNumber: string (10 digits) }
 * @returns { success: bool, phoneNumber, customerCategory, rateFilePath, fileName }
 */
app.get('/api/rate', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        if (!isValidNumber(phoneNumber)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number. Must be 10 digits.' });
        }

        const filename = path.join(WORKING_DIR, 'D01-2627', 'DATA', 'CMPL.dbf');
        const cmpl = await convertDbfToJson(filename);
        const customer = cmpl.filter(obj => obj.C_MOBILE === phoneNumber);

        if (customer.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found for this phone number.' });
        }

        const cust_cat = customer[0].CUST_CAT;
        const outputPath = path.join(WORKING_DIR, 'output', 'static', 'rate' + cust_cat + '.xlsx');

        if (!fs.existsSync(outputPath)) {
            return res.status(404).json({ success: false, error: 'Rate sheet file not found.', customerCategory: cust_cat });
        }

        res.json({
            success: true,
            phoneNumber,
            customerCategory: cust_cat,
            rateFilePath: outputPath,
            rateFileUrl: publicFileUrl(outputPath),
            fileName: 'rate' + cust_cat + '.xlsx',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Send WhatsApp Message (via CXBot aggregate API — CxBotClient) ────────────
// Replaces the old api.aoc-portal.com/static-apikey + unapproved-template
// approach (which was silently failing with 400 "Invalid Template" / missing
// key). These are session replies (customer just messaged us), so plain
// text/image/document/interactive messages work without any approved
// template — no Meta template review needed.

const CxBotClient = require('./CxBotClient');

const cxbot = new CxBotClient({
    username: process.env.CXBOT_USERNAME || 'ektaenterprises',
    password: process.env.CXBOT_PASSWORD || 'EktaEnter@37829',
    userId: process.env.CXBOT_USER_ID || '4257563074',
    wabaId: process.env.CXBOT_WABA_ID || '1656792569347198',
    fromNumber: process.env.AOC_WA_FROM || '+15554884507',
    whatsappNumberId: process.env.CXBOT_WA_NUMBER_ID || '1773806508',
    gatewayId: process.env.CXBOT_GATEWAY_ID || '3766614054',
});

function formatPhoneForAoc(phoneNumber) {
    const cleaned = String(phoneNumber).replace(/\D/g, "");
    if (cleaned.startsWith("91") && cleaned.length === 12) return cleaned;
    return "91" + cleaned;
}

async function sendTextAoc(phoneNumber, text) {
    return cxbot.sendText(formatPhoneForAoc(phoneNumber), text);
}

async function sendDocumentAoc(phoneNumber, filePath, fileName) {
    const publicUrl = publicFileUrl(filePath);
    return cxbot.sendDocument(formatPhoneForAoc(phoneNumber), publicUrl, fileName);
}

async function sendImageAoc(phoneNumber, imageUrl) {
    return cxbot.sendImage(formatPhoneForAoc(phoneNumber), imageUrl);
}

/** buttons: array of {id, title} — max 3 per WhatsApp's own limit */
async function sendButtonsAoc(phoneNumber, bodyText, buttons) {
    return cxbot.sendButtons(formatPhoneForAoc(phoneNumber), bodyText, buttons);
}

/** sections: array of {title, rows:[{id, title, description}]} — no 3-item limit like buttons */
async function sendListAoc(phoneNumber, bodyText, buttonLabel, sections) {
    return cxbot.sendList(formatPhoneForAoc(phoneNumber), bodyText, buttonLabel, sections);
}

/** WhatsApp allows exactly one CTA-URL button per message; url must be http(s). */
async function sendCtaUrlAoc(phoneNumber, bodyText, displayText, url) {
    return cxbot.sendCtaUrl(formatPhoneForAoc(phoneNumber), bodyText, displayText, url);
}

async function sendCartSummary(phoneNumber) {
    const summary = formatCartSummary(phoneNumber);
    const cart = orderCarts.get(phoneNumber);
    const hasItems = cart && cart.items.length > 0;
    if (hasItems) {
        return sendButtonsAoc(phoneNumber, summary, [
            { id: 'CHECKOUT', title: 'Place Order' },
            { id: 'CATALOG', title: 'Continue Shopping' },
            { id: 'CLEAR_CART', title: 'Clear Cart' },
        ]);
    }
    return sendTextAoc(phoneNumber, summary);
}

// ── UPI app deep-link redirects ─────────────────────────────────────────────
// WhatsApp's cta_url button rejects non-http(s) URLs, so each payment app
// button points here; the page immediately redirects to the real app scheme.
const UPI_VPA = '9826623188m@pnb';
const UPI_PAYEE_NAME = 'EKTA ENTERPRISES';
const UPI_CURRENCY = 'INR';

function upiRedirectPage(scheme) {
    const deepLink = scheme + '://pay?pa=' + encodeURIComponent(UPI_VPA) +
        '&pn=' + encodeURIComponent(UPI_PAYEE_NAME) + '&cu=' + UPI_CURRENCY;
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<meta http-equiv="refresh" content="0;url=' + deepLink + '">' +
        '<script>window.location.href=' + JSON.stringify(deepLink) + ';</script></head>' +
        '<body>Opening payment app… <a href="' + deepLink + '">Tap here if it does not open automatically</a></body></html>';
}

app.get('/pay/phonepe', (req, res) => res.send(upiRedirectPage('phonepe')));
app.get('/pay/gpay', (req, res) => res.send(upiRedirectPage('tez')));
app.get('/pay/paytm', (req, res) => res.send(upiRedirectPage('paytmmp')));

// Tracks phone numbers who tapped "Bill" and are expected to reply with a
// bill number next. In-memory only — cleared on restart, expires after 10min.
const pendingBillRequest = new Map();
const PENDING_BILL_TIMEOUT_MS = 10 * 60 * 1000;

// Same pattern, for "stock" → company code.
const pendingStockRequest = new Map();
const PENDING_STOCK_TIMEOUT_MS = 10 * 60 * 1000;

/** True if phoneNumber is listed in output/company/Main.txt or any per-company .txt file. */
function isAuthorizedForAnyStock(phoneNumber) {
    const companyDir = path.join(WORKING_DIR, 'output', 'company');
    if (!fs.existsSync(companyDir)) return false;
    try {
        for (const file of fs.readdirSync(companyDir)) {
            if (!file.toLowerCase().endsWith('.txt')) continue;
            const numbers = fs.readFileSync(path.join(companyDir, file), 'utf8').trim().split('\n').map(n => n.trim());
            if (numbers.includes(phoneNumber)) return true;
        }
    } catch (e) {
        console.error('[STOCK] isAuthorizedForAnyStock error:', e.message);
    }
    return false;
}

app.get("/api/send-message", async (req, res) => {
    try {
        const { phoneNumber, textMessage, filePath, fileName } = req.query;
        if (!phoneNumber) return res.status(400).json({ success: false, error: "phoneNumber is required." });

        const result = { success: true, sent: [] };

        if (textMessage) {
            try {
                await sendTextAoc(phoneNumber, textMessage);
                result.sent.push({ type: "text", text: textMessage });
            } catch (e) {
                return res.status(500).json({ success: false, error: "Failed to send text: " + e.message });
            }
        }

        if (filePath) {
            if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "File not found: " + filePath });
            try {
                await sendDocumentAoc(phoneNumber, filePath, fileName || path.basename(filePath));
                result.sent.push({ type: "file", filePath, fileName: fileName || path.basename(filePath) });
            } catch (e) {
                return res.status(500).json({ success: false, error: "Failed to send file: " + e.message });
            }
        }

        result.message = "Message(s) sent successfully.";
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── CX Bot Incoming Webhook ──────────────────────────────────────────────────

/**
 * @route   POST /api/aoc
 * @desc    CX Bot webhook — fires when a customer sends a message or clicks a
 *          Quick-Reply button. Detects BALANCE / LEDGER / LEDGER_OLD intent,
 *          generates the file and replies via AOC API.
 *          Publicly reachable at https://server.ekta-enterprises.com/api/whatsapp/aoc
 *          (the /api/whatsapp proxy in webapp/server/app.js strips the
 *          "/whatsapp" segment and forwards the rest under /api/*).
 * @body    CX Bot standard webhook payload
 */
app.post('/api/aoc', async (req, res) => {
    // Always acknowledge immediately so CX Bot doesn't retry
    res.sendStatus(200);

    try {
        const body = req.body || {};
        console.log('[WEBHOOK] Received:', JSON.stringify(body));

        // Ignore delivery/read status callbacks — only "message_received" carries
        // an actual customer message worth acting on.
        if (body.event && body.event !== 'message_received') {
            console.log('[WEBHOOK] Ignoring event:', body.event);
            return;
        }

        // ── Extract sender phone number ────────────────────────────────────────
        // Real CXBot shape: { from: "<business number>", contacts: { recipient: "<customer number>" }, messages: {...} }
        // NOTE: "from" here is OUR business number, not the customer — the
        // customer's number is under contacts.recipient. Kept a couple of
        // fallbacks for other shapes CXBot/Meta might send.
        const rawFrom =
            body.contacts?.recipient ||
            (Array.isArray(body.contacts) && body.contacts[0]?.wa_id) ||
            (body.entry && body.entry[0]?.changes?.[0]?.value?.messages?.[0]?.from) ||
            body.from;

        if (!rawFrom) {
            console.log('[WEBHOOK] No sender found in payload, ignoring.');
            return;
        }

        // Strip country code → 10-digit Indian number
        const phoneNumber = String(rawFrom).replace(/^\+?91/, '').replace(/\D/g, '').slice(-10);
        if (!isValidNumber(phoneNumber)) {
            console.log('[WEBHOOK] Invalid phone number extracted:', phoneNumber, 'from', rawFrom);
            return;
        }

        // ── Extract the actual message object ───────────────────────────────────
        // CXBot sends "messages" (singular key) as a single object; keep support
        // for an array form and the top-level Meta Cloud API shape too.
        const msgObj =
            (Array.isArray(body.messages) ? body.messages[0] : body.messages) ||
            body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
            body; // last resort: legacy flat shape (type/text at top level)

        // ── Handle WhatsApp Commerce ORDER immediately ──────────────────────────
        // When a customer places an order directly from the Meta Catalogue in
        // WhatsApp, the server receives type:"order". We reply with their
        // personalised app link so they can track / add more items seamlessly.
        if (msgObj.type === 'order') {
            console.log('[WEBHOOK] WhatsApp Commerce order from', phoneNumber);
            // Try to extract product codes from the order payload
            const productItems = msgObj.order?.product_items || [];
            const firstCode = productItems[0]?.product_retailer_id || null;
            const appLink = firstCode
                ? `https://app.ekta-enterprises.com/product/${encodeURIComponent(firstCode)}?phone=${phoneNumber}`
                : `https://app.ekta-enterprises.com/?phone=${phoneNumber}`;

            // ── Sync ordered items to the webapp cart store ──────────────────
            if (productItems.length > 0) {
                const cartItems = productItems.map(item => ({
                    code: item.product_retailer_id,
                    qty: item.quantity || 1,
                    price: item.item_price || 0,
                }));
                axios.post(`${PUBLIC_BASE_URL}/api/app/wa-cart`, {
                    phone: phoneNumber,
                    items: cartItems,
                    secret: 'wa-internal-ekta-2026',
                }, { timeout: 8000 })
                    .then(() => console.log(`[WEBHOOK] Saved ${cartItems.length} items to wa-cart for ${phoneNumber}`))
                    .catch(e => console.error('[WEBHOOK] wa-cart save error:', e.message));
            }

            await sendTextAoc(
                phoneNumber,
                '\u2705 We received your order! Our team will confirm it shortly.\n\nFor instant ordering, price details & order history, open your account on our app:'
            ).catch(e => console.error('[WEBHOOK] Order ack error:', e.message));
            await sendCtaUrlAoc(
                phoneNumber,
                '\uD83D\uDCF1 Open your account \u2014 no login or OTP needed!',
                'Open My Account',
                appLink
            ).catch(e => console.error('[WEBHOOK] Order app link error:', e.message));
            return;
        }


        // ── Detect intent ────────────────────────────────────────────────────
        let intent = null;

        // 1. Interactive quick-reply button
        // Real CXBot shape nests it under interactive.text.button_reply; keep
        // the flatter interactive.button_reply as a fallback (Meta Cloud API
        // shape / possible future CXBot changes).
        if (msgObj.type === 'interactive' && msgObj.interactive) {
            const buttonReply =
                msgObj.interactive.text?.button_reply ||
                msgObj.interactive.button_reply ||
                msgObj.interactive.list_reply ||
                msgObj.interactive.text?.list_reply;
            const btnId = buttonReply?.id || '';
            const btnTitle = buttonReply?.title || '';
            const check = (btnId + ' ' + btnTitle).toUpperCase();
            if (check.includes('BALANCE')) intent = 'BALANCE';
            else if (check.includes('FY_LAST')) intent = 'LEDGER_OLD';
            else if (check.includes('FY_THIS')) intent = 'LEDGER';
            else if (btnId === 'LEDGER_BILL_MENU') intent = 'LEDGER_BILL_MENU';
            else if (check.includes('LEDGER')) intent = 'LEDGER_MENU';
            else if (check.includes('BILL')) intent = 'BILL';
            else if (check.includes('STOCK')) intent = 'STOCK';
            else if (btnId === 'CATALOG') intent = 'CATALOG';
            else if (/^CAT_PAGE_\d+$/.test(btnId)) intent = btnId;
            else if (/^CAT_EP_[A-Z0-9]{3}_\d+$/.test(btnId)) intent = btnId;
            else if (/^CAT_PRD_[A-Z0-9]+$/.test(btnId)) intent = btnId;
            else if (/^CAT_BACK_[A-Z0-9]{3}$/.test(btnId)) intent = btnId;
            else if (btnId === 'CAT_BACK_MENU') intent = 'CAT_BACK_MENU';
            else if (/^CAT_[A-Z0-9]{3}$/.test(btnId)) intent = btnId;
            else if (btnId === 'CHECKOUT') intent = 'CHECKOUT';
            else if (btnId === 'CLEAR_CART') intent = 'CLEAR_CART';
            else if (/^QTY_[A-Z0-9]+_\d+$/.test(btnId)) {
                intent = 'QTY_INPUT';
                const qtyMatch = btnId.match(/^QTY_[A-Z0-9]+_(\d+)$/);
                if (qtyMatch) msgObj._qty = parseInt(qtyMatch[1], 10);
            }
        }

        // 2. Plain text message (fuzzy keyword matching — tolerant of
        //    trailing punctuation like "balance?", "ledger?", "25-26?")
        if (!intent && msgObj.type === 'text' && msgObj.text && msgObj.text.body) {
            const rawMsg = msgObj.text.body.trim();
            const msg = rawMsg.toLowerCase().replace(/[?!.]+$/g, '').trim();

            const pendingBillSince = pendingBillRequest.get(phoneNumber);
            const pendingStockSince = pendingStockRequest.get(phoneNumber);
            const billMatch = rawMsg.match(/([A-Za-z]-?\d{3,6})/);
            const stockMatch = rawMsg.match(/stock\s+([A-Za-z0-9]+)/i);

            if (/\bbill\b|बिल/i.test(msg) && billMatch) {
                intent = 'BILL_LOOKUP';
                msgObj._billNumber = billMatch[1];
            } else if (/\bstock\b|स्टॉक/i.test(msg) && stockMatch) {
                intent = 'STOCK_LOOKUP';
                msgObj._company = stockMatch[1];
            } else if (pendingBillSince && (Date.now() - pendingBillSince) < PENDING_BILL_TIMEOUT_MS) {
                pendingBillRequest.delete(phoneNumber);
                intent = 'BILL_LOOKUP';
                msgObj._billNumber = rawMsg;
            } else if (pendingStockSince && (Date.now() - pendingStockSince) < PENDING_STOCK_TIMEOUT_MS) {
                pendingStockRequest.delete(phoneNumber);
                intent = 'STOCK_LOOKUP';
                msgObj._company = rawMsg;
            } else if (pendingProductQty.has(phoneNumber)) {
                // Customer is entering qty for a product
                const qtyNum = parseInt(msg, 10);
                if (!isNaN(qtyNum) && qtyNum > 0) {
                    intent = 'QTY_INPUT';
                    msgObj._qty = qtyNum;
                } else {
                    pendingProductQty.delete(phoneNumber);
                    intent = 'CATALOG';
                }
            } else if (pendingCheckoutPhone.has(phoneNumber)) {
                // Customer is entering delivery phone number for checkout
                const deliveryMatch = rawMsg.replace(/\D/g, '');
                if (/^\d{10}$/.test(deliveryMatch)) {
                    intent = 'ORDER_CONFIRM';
                    msgObj._deliveryPhone = deliveryMatch;
                } else {
                    pendingCheckoutPhone.delete(phoneNumber);
                    intent = 'CATALOG';
                }
            } else if (/^(catalog|order|shop|ऑर्डर|कैटलॉग)$/i.test(msg)) {
                intent = 'CATALOG';
            } else if (/^(cart|कार्ट|मेरा ऑर्डर)$/i.test(msg)) {
                intent = 'CART';
            } else if (/^(checkout|place.?order|फाइनल)$/i.test(msg)) {
                intent = 'CHECKOUT';
            } else if (/^(cancel|clear.?cart|रद्द)$/i.test(msg)) {
                intent = 'CLEAR_CART';
            } else if (/^bal(ance)?$|बैलेंस/i.test(msg)) {
                intent = 'BALANCE';
            } else if (/\bold\b|25-?26|last\s*(fy|year)|पुराना/i.test(msg)) {
                intent = 'LEDGER_OLD';
            } else if (/\bledger\b|26-?27|this\s*(fy|year)|खाता/i.test(msg)) {
                intent = 'LEDGER';
            } else if (/^bill$|बिल/i.test(msg)) {
                intent = 'BILL';
            } else if (/^stock$|स्टॉक/i.test(msg)) {
                intent = 'STOCK';
            } else {
                // Check if the text contains a product code (e.g. "H1924" or "H 1924")
                // This covers the "Message business" pre-filled text from the catalogue
                const codeMatch = rawMsg.match(/\b([A-Z]\d{3,6})\b/i);
                if (codeMatch) {
                    intent = 'PRODUCT_ENQUIRY';
                    msgObj._productCode = codeMatch[1].toUpperCase();
                }
            }
        }

        if (!intent) {
            console.log('[WEBHOOK] Unrecognized intent from', phoneNumber, '| msg:', JSON.stringify(msgObj));
            await sendButtonsAoc(
                phoneNumber,
                'Hi! What would you like to do?',
                [
                    { id: 'BALANCE', title: 'Balance' },
                    { id: 'LEDGER_BILL_MENU', title: 'Ledger & Bill' },
                    { id: 'CATALOG', title: 'Catalog' },
                ]
            ).catch(e => console.error('[WEBHOOK] Menu send error:', e.message));
            // Send personalised app link — customer can browse & order without logging in
            await sendCtaUrlAoc(
                phoneNumber,
                '\uD83D\uDED2 Or browse & order directly on our app !',
                'Open Retailer App',
                `https://app.ekta-enterprises.com/?phone=${phoneNumber}`
            ).catch(e => console.error('[WEBHOOK] App link send error:', e.message));
            return;
        }

        console.log('[WEBHOOK] Intent:', intent, '| Phone:', phoneNumber);

        // ── Handle LEDGER_MENU (ambiguous "Ledger" tap → ask which FY) ─────────
        if (intent === 'LEDGER_MENU') {
            await sendButtonsAoc(
                phoneNumber,
                'Which ledger would you like?',
                [
                    { id: 'FY_THIS', title: 'This FY (26-27)' },
                    { id: 'FY_LAST', title: 'Last FY (25-26)' },
                ]
            ).catch(e => console.error('[WEBHOOK] Ledger FY menu send error:', e.message));
            return;
        }

        // ── Handle LEDGER_BILL_MENU (Ledger & Bill submenu) ──────────────────────
        if (intent === 'LEDGER_BILL_MENU') {
            await sendButtonsAoc(
                phoneNumber,
                'Choose an option:',
                [
                    { id: 'FY_THIS', title: 'Ledger FY 26-27' },
                    { id: 'FY_LAST', title: 'Ledger FY 25-26' },
                    { id: 'BILL', title: 'Bill' },
                ]
            ).catch(e => console.error('[WEBHOOK] Ledger-Bill submenu send error:', e.message));
            return;
        }

        // ── Handle PRODUCT_ENQUIRY (catalogue "Message business" contains code) ─
        // When a customer taps "Message business" on a catalogue product, WhatsApp
        // pre-fills the text with the product name + code. We detect the code and
        // send them a personalised deep link to that exact product page.
        if (intent === 'PRODUCT_ENQUIRY') {
            const code = msgObj._productCode;
            const product = await findCatalogProduct(code).catch(() => null);
            const productLink = `https://app.ekta-enterprises.com/product/${encodeURIComponent(code)}?phone=${phoneNumber}`;
            const productName = product ? product.PRODUCT : code;
            const rate = product ? (parseFloat(product.RATE1 || '0').toFixed(2)) : '';

            await sendTextAoc(
                phoneNumber,
                `Thanks for your interest in *${productName}*!${rate ? ` ₹${rate}` : ''}\n\nTap below to view details & order instantly on our app — no login needed 👇`
            ).catch(e => console.error('[WEBHOOK] Product enquiry text error:', e.message));
            await sendCtaUrlAoc(
                phoneNumber,
                `📦 View *${productName}* on our app`,
                'View & Order',
                productLink
            ).catch(e => console.error('[WEBHOOK] Product enquiry link error:', e.message));
            return;
        }

        // ── Handle CATALOG (show product categories) ────────────────────────────
        if (intent === 'CATALOG') {
            getOrCreateCart(phoneNumber);

            await sendCatalogList(phoneNumber, 0).catch(e => console.error('[WEBHOOK] Catalog list error:', e.message));
            return;
        }

        // ── Handle CATEGORY_{prefix} (show products in a category) ─────────────────
        if (/^CAT_[A-Z0-9]{3}$/.test(intent)) {
            const prefix = intent.substring(4);
            await sendProductList(phoneNumber, prefix, 0).catch(e => console.error('[WEBHOOK] Product list error:', e.message));
            return;
        }

        // ── Handle CAT_BACK_MENU (back to main categories) ─────────────────────
        if (intent === 'CAT_BACK_MENU') {
            await sendCatalogList(phoneNumber, 0).catch(e => console.error('[WEBHOOK] Back to menu error:', e.message));
            return;
        }
        // ── Handle CAT_BACK_{prefix} (back to category product list) ──────────────
        if (/^CAT_BACK_[A-Z0-9]{3}$/.test(intent)) {
            const prefix = intent.substring(9);
            await sendProductList(phoneNumber, prefix, 0).catch(e => console.error('[WEBHOOK] Back to category error:', e.message));
            return;
        }

        // ── Handle CAT_PRD_{code} (show product, ask for qty) ───────────────────
        if (intent.startsWith('CAT_PRD_')) {
            const code = intent.substring(8);
            const product = await findCatalogProduct(code);
            if (!product) {
                await sendTextAoc(phoneNumber, 'Product not found.').catch(e => { });
                return;
            }
            pendingProductQty.set(phoneNumber, { code, ts: Date.now() });
            const rate = parseFloat(product.RATE1 || '0');
            const schemeText = product.schemes && product.schemes.length > 0
                ? '\n\uD83C\uDFF7 Scheme: ' + product.schemes[0].discount + '% off on ' + product.schemes[0].slab1 + '+ units'
                : '';
            await sendButtonsAoc(phoneNumber,
                product.PRODUCT + '\nRate: \u20b9' + rate.toFixed(2) + schemeText + '\n\nHow many units?',
                [
                    { id: 'QTY_' + code + '_1', title: '1' },
                    { id: 'QTY_' + code + '_5', title: '5' },
                    { id: 'QTY_' + code + '_10', title: '10' },
                ]
            ).catch(e => console.error('[WEBHOOK] Product qty prompt error:', e.message));
            // Also send product page link with phone pre-filled — tap to view details & order on app
            await sendCtaUrlAoc(
                phoneNumber,
                '\uD83D\uDCF1 View full details & order on app:',
                'View Product',
                `https://app.ekta-enterprises.com/product/${encodeURIComponent(code)}?phone=${phoneNumber}`
            ).catch(e => console.error('[WEBHOOK] Product link send error:', e.message));
            return;
        }

        // ── Handle CAT_PAGE_n and CAT_EP_{prefix}_n (pagination) ────────────────
        if (/^CAT_PAGE_\d+$/.test(intent)) {
            const page = parseInt(intent.replace('CAT_PAGE_', ''), 10);
            await sendCatalogList(phoneNumber, page).catch(e => console.error('[WEBHOOK] Catalog page error:', e.message));
            return;
        }
        if (/^CAT_EP_[A-Z0-9]{3}_\d+$/.test(intent)) {
            const parts = intent.split('_');
            const prefix = parts[2];
            const page = parseInt(parts[3], 10);
            await sendProductList(phoneNumber, prefix, page).catch(e => console.error('[WEBHOOK] Product page error:', e.message));
            return;
        }

        // ── Handle QTY_INPUT (add to cart) ──────────────────────────────────────
        if (intent === 'QTY_INPUT') {
            const pending = pendingProductQty.get(phoneNumber);
            if (!pending) {
                await sendTextAoc(phoneNumber, 'No product selected. Type "catalog" to browse.').catch(e => { });
                return;
            }
            pendingProductQty.delete(phoneNumber);
            const qty = msgObj._qty;
            addToCart(phoneNumber, pending.code, qty);
            const cart = getOrCreateCart(phoneNumber);
            const item = cart.items.find(i => i.code === pending.code);
            const rate = item ? (item.rate || 0) : 0;
            const lineTotal = rate * qty;
            const grandTotal = cart.items.reduce((s, i) => s + (i.rate || 0) * i.qty, 0);
            const name = item ? item.name : pending.code;
            await sendButtonsAoc(phoneNumber,
                '\u2705 Added to cart:\n' + qty + ' \u00d7 ' + name + ' (\u20b9' + rate.toFixed(2) + ') = \u20b9' + lineTotal.toFixed(2) +
                '\nCart total: \u20b9' + grandTotal.toFixed(2),
                [
                    { id: 'CART', title: 'View Cart' },
                    { id: 'CATALOG', title: 'Shop More' },
                ]
            ).catch(e => console.error('[WEBHOOK] Add-to-cart confirm error:', e.message));
            return;
        }

        // ── Handle CART (view cart) ─────────────────────────────────────────────
        if (intent === 'CART') {
            const summary = formatCartSummary(phoneNumber);
            await sendCartSummary(phoneNumber).catch(e => console.error('[WEBHOOK] Cart summary error:', e.message));
            return;
        }

        // ── Handle CHECKOUT (place order) ───────────────────────────────────────
        if (intent === 'CHECKOUT') {
            const order = checkoutCart(phoneNumber);
            if (!order) {
                await sendTextAoc(phoneNumber, 'Your cart is empty. Type "catalog" to browse products.')
                    .catch(e => { });
                return;
            }
            // Save cart to temp state and ask for delivery phone number
            const tempOrder = orderCarts.get(phoneNumber);
            if (tempOrder) {
                tempOrder._pendingCheckout = true;
            }
            pendingCheckoutPhone.set(phoneNumber, Date.now());
            const confirm = 'Order Summary:\n\n';
            order.items.forEach(item => {
                confirm += item.qty + ' × ' + item.name + ' = ₹' + (item.mrp * item.qty).toFixed(2) + '\n';
            });
            confirm += '\n*Total: ₹' + order.total.toFixed(2) + '*\n\n';
            confirm += 'Please reply with the delivery mobile number.';
            await sendTextAoc(phoneNumber, confirm).catch(e => console.error('[WEBHOOK] Checkout phone prompt error:', e.message));
            return;
        }

        // ── Handle ORDER_CONFIRM (delivery phone received → finalize order) ─────
        if (intent === 'ORDER_CONFIRM') {
            const pending = pendingCheckoutPhone.get(phoneNumber);
            if (!pending) {
                await sendTextAoc(phoneNumber, 'No pending order. Browse "catalog" to start.').catch(e => { });
                return;
            }
            pendingCheckoutPhone.delete(phoneNumber);
            const deliveryPhone = msgObj._deliveryPhone;

            // Retrieve the order from checkoutCart result (saved in temp state)
            const tempCart = orderCarts.get(phoneNumber);
            let order = null;
            if (tempCart && tempCart._lastOrder) {
                order = tempCart._lastOrder;
                tempCart._pendingCheckout = false;
                tempCart._lastOrder = null;
            } else {
                // Rebuild from current cart
                order = {
                    orderId: phoneNumber + '_' + Date.now(),
                    phoneNumber,
                    deliveryPhone,
                    createdAt: new Date().toISOString(),
                    items: tempCart ? [...tempCart.items] : [],
                    total: tempCart ? tempCart.items.reduce((s, i) => s + i.mrp * i.qty, 0) : 0,
                };
                if (tempCart) orderCarts.delete(phoneNumber);
            }

            if (!order || order.items.length === 0) {
                await sendTextAoc(phoneNumber, 'Order empty. Browse "catalog" to start.').catch(e => { });
                return;
            }

            order.deliveryPhone = deliveryPhone;

            // Save order to file
            const ordersDir = path.join(WORKING_DIR, 'output', 'orders');
            if (!fs.existsSync(ordersDir)) fs.mkdirSync(ordersDir, { recursive: true });
            const filePath = path.join(ordersDir, order.orderId + '.json');
            fs.writeFileSync(filePath, JSON.stringify(order, null, 2));

            // Customer confirmation message
            let confirm = '✅ Order Confirmed!\n';
            confirm += 'Order ID: ' + order.orderId + '\n';
            confirm += 'Delivery to: ' + deliveryPhone + '\n\n';
            order.items.forEach(item => {
                confirm += item.qty + ' × ' + item.name + ' = ₹' + (item.mrp * item.qty).toFixed(2) + '\n';
            });
            confirm += '\n*Total: ₹' + order.total.toFixed(2) + '*\n\n';
            confirm += 'We will deliver shortly. Thank you!';
            await sendTextAoc(phoneNumber, confirm).catch(e => console.error('[WEBHOOK] Order confirm error:', e.message));

            // Notify admin(s) about the new order
            sendOrderNotificationToAdmin(phoneNumber, order).catch(err =>
                console.error('[WEBHOOK] Admin notification error:', err.message));
            return;
        }

        // ── Handle CLEAR_CART ───────────────────────────────────────────────────
        if (intent === 'CLEAR_CART') {
            clearCart(phoneNumber);
            await sendTextAoc(phoneNumber, 'Cart cleared. Type "catalog" to start fresh.').catch(e => { });
            return;
        }

        // ── Handle BILL (ask for bill number) ──────────────────────────────────
        if (intent === 'BILL') {
            pendingBillRequest.set(phoneNumber, Date.now());
            await sendTextAoc(phoneNumber, 'Please reply with your Bill Number (e.g. A-4930).')
                .catch(e => console.error('[WEBHOOK] BILL prompt send error:', e.message));
            return;
        }

        // ── Handle BILL_LOOKUP (bill number received) ───────────────────────────
        if (intent === 'BILL_LOOKUP') {
            try {
                const billNumber = msgObj._billNumber.toUpperCase();
                const outputPath = path.join(WORKING_DIR, 'output', 'bill', billNumber + '.pdf');
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                execSync('.\\BILLPDF.EXE ' + phoneNumber + ' ' + billNumber, { cwd: WORKING_DIR, windowsHide: true });

                if (!(await waitForFile(outputPath, 20000))) {
                    await sendTextAoc(phoneNumber, '❌ Bill not found. Please check the bill number and try again.');
                    return;
                }

                await sendDocumentAoc(phoneNumber, outputPath, billNumber + '.pdf');
                console.log('[WEBHOOK] Bill PDF sent to', phoneNumber, '| Bill:', billNumber);
            } catch (e) {
                console.error('[WEBHOOK] BILL_LOOKUP error:', e.message);
                await sendTextAoc(phoneNumber, '❌ Could not fetch bill. Please try again later.')
                    .catch(() => { });
            }
            return;
        }

        // ── Handle STOCK (ask for company code) ─────────────────────────────────
        if (intent === 'STOCK') {
            pendingStockRequest.set(phoneNumber, Date.now());
            await sendTextAoc(phoneNumber, 'Please reply with the company code (e.g. ME).')
                .catch(e => console.error('[WEBHOOK] STOCK prompt send error:', e.message));
            return;
        }

        // ── Handle STOCK_LOOKUP (company code received) ─────────────────────────
        // Restricted per company: only phone numbers listed in
        // output/company/{COMPANY}.txt or output/company/Main.txt may request it.
        if (intent === 'STOCK_LOOKUP') {
            try {
                const companyUpper = msgObj._company.toUpperCase();
                const numberPath = path.join(WORKING_DIR, 'output', 'company', companyUpper + '.txt');
                const mainNumbers = path.join(WORKING_DIR, 'output', 'company', 'Main.txt');

                let numberArray = [];
                if (fs.existsSync(numberPath)) {
                    numberArray = numberArray.concat(fs.readFileSync(numberPath, 'utf8').trim().split('\n').map(n => n.trim()));
                }
                if (fs.existsSync(mainNumbers)) {
                    numberArray = numberArray.concat(fs.readFileSync(mainNumbers, 'utf8').trim().split('\n').map(n => n.trim()));
                }
                if (!numberArray.includes(phoneNumber)) {
                    console.log('[WEBHOOK] STOCK denied — not authorized:', phoneNumber, companyUpper);
                    await sendTextAoc(phoneNumber, '❌ You are not authorized to view stock for this company.');
                    return;
                }

                const outputPath = path.join(WORKING_DIR, 'output', companyUpper + '_stock.xls');
                const initialModTime = fs.existsSync(outputPath) ? fs.statSync(outputPath).mtimeMs : null;

                execSync('.\\stk.exe ' + companyUpper, { cwd: WORKING_DIR, windowsHide: true });

                const startTime = Date.now();
                let fileReady = false;
                while (Date.now() - startTime < 20000) {
                    if (fs.existsSync(outputPath)) {
                        const currentModTime = fs.statSync(outputPath).mtimeMs;
                        if (currentModTime !== initialModTime) { fileReady = true; break; }
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
                if (!fileReady) {
                    await sendTextAoc(phoneNumber, '❌ Stock file not generated. Please check the company code and try again.');
                    return;
                }

                const pdfOutputPath = outputPath.replace('.xls', '.pdf');
                await convertXLSXtoPDF(outputPath, pdfOutputPath);
                if (!(await waitForFile(pdfOutputPath, 15000))) {
                    await sendTextAoc(phoneNumber, '❌ Could not prepare stock PDF. Please try again later.');
                    return;
                }

                // Copy to a unique path before sending — avoids the same
                // shared-file overwrite race the ledger flow had, since the
                // exe always writes to the same {COMPANY}_stock.pdf path.
                const uniquePath = path.join(WORKING_DIR, 'output', companyUpper + '_stock_' + phoneNumber + '_' + Date.now() + '.pdf');
                fs.copyFileSync(pdfOutputPath, uniquePath);

                await sendDocumentAoc(phoneNumber, uniquePath, companyUpper + '_stock.pdf');
                console.log('[WEBHOOK] Stock PDF sent to', phoneNumber, '| Company:', companyUpper);
            } catch (e) {
                console.error('[WEBHOOK] STOCK_LOOKUP error:', e.message);
                await sendTextAoc(phoneNumber, '❌ Could not fetch stock. Please try again later.')
                    .catch(() => { });
            }
            return;
        }

        // ── Handle BALANCE ───────────────────────────────────────────────────
        if (intent === 'BALANCE') {
            try {
                const outputPath = path.join(WORKING_DIR, 'output', 'balance', phoneNumber + '.txt');
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                execSync('"' + WORKING_DIR + '\\WHDAT.EXE" ' + phoneNumber,
                    { cwd: WORKING_DIR, windowsHide: true, shell: true });

                if (!(await waitForFile(outputPath, 15000))) {
                    await sendTextAoc(phoneNumber, '❌ Balance data not found. Please contact us.');
                    return;
                }

                const rawBalance = fs.readFileSync(outputPath, 'utf8').trim();
                const balanceAmountMatch = rawBalance.match(/([0-9.,]+\s*DR)/i);
                const balanceAmount = balanceAmountMatch ? balanceAmountMatch[0].replace(/\s*DR/i, '').trim() : null;

                let formatted = rawBalance;
                if (balanceAmount) {
                    const textUpToIs = rawBalance.substring(0, rawBalance.indexOf('IS') + 2);
                    formatted = '```' + textUpToIs + ' :``` *' + balanceAmount + '*';
                }

                const bankDetails =
                    '\n\nKindly transfer Your Balance in Bellow \n' +
                    '        Name:- EKTA ENTERPRISES\n' +
                    '        Bank :-  PUNJAB NATIONAL BANK \n' +
                    '        Branch:- Seoni\n' +
                    '        Acc. No. :- 0490008700003292\n' +
                    '        IFSC CODE :- PUNB0049000';
                formatted += bankDetails;

                // Sends land out of order if fired back-to-back (CxBot/WhatsApp
                // delivery isn't guaranteed to preserve submission order), so
                // space them out to keep text → QR → 3 buttons in sequence.
                const delay = (ms) => new Promise(r => setTimeout(r, ms));

                // Send balance text
                await sendTextAoc(phoneNumber, formatted);
                console.log('[WEBHOOK] Balance text sent to', phoneNumber);
                await delay(1200);

                // Send QR image
                const QR_IMAGE_URL = (process.env.PUBLIC_BASE_URL || 'https://server.ekta-enterprises.com') +
                    '/api/files/static/ekta pnb QR.jpeg';
                await sendImageAoc(phoneNumber, encodeURI(QR_IMAGE_URL));
                console.log('[WEBHOOK] QR image sent to', phoneNumber);
                // Images take longer to upload/process on WhatsApp's side than
                // text/button messages, so give it more headroom or the next
                // (faster) message can overtake it in delivery order.
                await delay(4000);

                // WhatsApp allows ONE direct-open-URL button per message, so
                // these go last as 3 separate messages, in order.
                const PAY_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://server.ekta-enterprises.com';
                await sendCtaUrlAoc(phoneNumber, 'PhonePe', 'Open PhonePe', PAY_BASE_URL + '/pay/phonepe').catch(e => console.error('[WEBHOOK] PhonePe button error:', e.message));
                await delay(1200);
                await sendCtaUrlAoc(phoneNumber, 'Google Pay', 'Open Google Pay', PAY_BASE_URL + '/pay/gpay').catch(e => console.error('[WEBHOOK] GPay button error:', e.message));
                await delay(1200);
                await sendCtaUrlAoc(phoneNumber, 'Paytm', 'Open Paytm', PAY_BASE_URL + '/pay/paytm').catch(e => console.error('[WEBHOOK] Paytm button error:', e.message));
                console.log('[WEBHOOK] Payment app buttons sent to', phoneNumber);

            } catch (e) {
                console.error('[WEBHOOK] BALANCE error:', e.message);
                await sendTextAoc(phoneNumber, '❌ Could not fetch balance. Please try again later.')
                    .catch(() => { });
            }
            return;
        }

        // ── Handle LEDGER / LEDGER_OLD ────────────────────────────────────────
        // Both exes write to the SAME shared path (output/LEDGER/{phone}.pdf).
        // Docs are delivered by public URL and fetched asynchronously by
        // WhatsApp, so if two ledger requests overlap the shared file can get
        // overwritten before the first one is fetched. Copy each result to a
        // unique path immediately after generation to avoid the race.
        const isOld = intent === 'LEDGER_OLD';
        try {
            const sharedPath = path.join(WORKING_DIR, 'output', 'LEDGER', phoneNumber + '.pdf');
            if (fs.existsSync(sharedPath)) fs.unlinkSync(sharedPath);

            const exe = isOld ? '.\\WHLED2526.EXE' : '.\\WHLED.EXE';
            execSync(exe + ' ' + phoneNumber, { cwd: WORKING_DIR, windowsHide: true });

            if (!(await waitForFile(sharedPath, 20000))) {
                await sendTextAoc(phoneNumber, '❌ Ledger not generated. Please contact us.');
                return;
            }

            const label = isOld ? 'Ledger_2526' : 'Ledger';
            const uniquePath = path.join(WORKING_DIR, 'output', 'LEDGER', label + '_' + phoneNumber + '_' + Date.now() + '.pdf');
            fs.copyFileSync(sharedPath, uniquePath);

            const fileName = label + '_' + phoneNumber + '.pdf';
            await sendDocumentAoc(phoneNumber, uniquePath, fileName);
            console.log('[WEBHOOK]', label, 'PDF sent to', phoneNumber);

        } catch (e) {
            console.error('[WEBHOOK] LEDGER error:', e.message);
            await sendTextAoc(phoneNumber, '❌ Could not generate ledger. Please try again later.')
                .catch(() => { });
        }

    } catch (outerErr) {
        console.error('[WEBHOOK] Outer error:', outerErr.message);
    }
});

// ─── Public File URLs ────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(WORKING_DIR, 'output');

/**
 * Convert a local file path under WORKING_DIR/output to a public URL.
 * e.g. C:\...\fmcg\output\LEDGER\9876543210.pdf → /files/LEDGER/9876543210.pdf
 */
function publicFileUrl(localPath) {
    const relative = path.relative(OUTPUT_DIR, localPath);
    return PUBLIC_BASE_URL + '/api/files/' + relative.replace(/\\/g, '/');
}

// Serve files from the output directory publicly
app.use('/files', express.static(OUTPUT_DIR, {
    // Allow all file types (PDF, XLS, etc.)
    setHeaders: (res, filePath) => {
        // Force download for PDFs and XLS files
        if (filePath.endsWith('.pdf') || filePath.endsWith('.xls') || filePath.endsWith('.xlsx')) {
            res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(filePath) + '"');
        }
    },
}));

// ─── Backup Service ────────────────────────────────────────────────────────────

class BackupService {
    constructor(config = {}) {
        this.sourceDir = config.sourceDir || 'F:\\FMCG\\d01-2627\\data';
        this.backupBaseDir = config.backupBaseDir || 'F:\\FMCG\\d01-2627\\data';
        this.whatsappNumber = config.whatsappNumber || '9169164888';
        this.retentionDays = config.retentionDays || 7;
        this.whatsappClient = config.whatsappClient || null;
    }

    setWhatsAppClient(client) {
        this.whatsappClient = client;
    }

    generateBackupFolderName() {
        return 'backup01_' + moment().format('DDMMYYYY');
    }

    async createBackupFolder() {
        const backupFolderName = this.generateBackupFolderName();
        const backupPath = path.join(this.backupBaseDir, backupFolderName);
        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }
        return backupPath;
    }

    async copyDbfFiles(backupPath) {
        if (!fs.existsSync(this.sourceDir)) {
            throw new Error('Source directory does not exist: ' + this.sourceDir);
        }
        const files = fs.readdirSync(this.sourceDir);
        const dbfFiles = files.filter(file => file.toLowerCase().endsWith('.dbf'));
        if (dbfFiles.length === 0) return 0;

        let copiedCount = 0;
        for (const file of dbfFiles) {
            try {
                fs.copyFileSync(path.join(this.sourceDir, file), path.join(backupPath, file));
                copiedCount++;
            } catch (e) {
                console.error('[BackupService] Failed to copy ' + file + ':', e.message);
            }
        }
        return copiedCount;
    }

    async createZipArchive(backupPath) {
        const zipPath = backupPath + '.zip';
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', () => resolve(zipPath));
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(backupPath, false);
            archive.finalize();
        });
    }

    async sendWhatsAppMessage(zipPath, fileCount) {
        if (!this.whatsappClient) {
            console.error('[BackupService] WhatsApp client not available');
            return false;
        }

        const chatId = '91' + this.whatsappNumber;
        const backupDate = moment().format('DD/MM/YYYY');
        const backupTime = moment().format('HH:mm:ss');

        const message =
            '🔄 *Daily Database Backup Report*\n\n' +
            '📅 Date: ' + backupDate + '\n' +
            '⏰ Time: ' + backupTime + '\n' +
            '📁 Files Backed Up: ' + fileCount + ' .dbf files\n' +
            '📦 Archive: ' + path.basename(zipPath) + '\n' +
            '✅ Status: Backup Completed Successfully\n\n' +
            '*Backup Details:*\n' +
            '• Source: ' + this.sourceDir + '\n' +
            '• Files: All .dbf database files\n' +
            '• Compression: ZIP format\n' +
            '• Retention: ' + this.retentionDays + ' days\n\n' +
            '_This is an automated backup notification._';

        try {
            await this.whatsappClient.sendText(chatId, message);

            if (fs.existsSync(zipPath)) {
                const publicZipDir = path.join(OUTPUT_DIR, 'backup');
                if (!fs.existsSync(publicZipDir)) fs.mkdirSync(publicZipDir, { recursive: true });
                const publicZipPath = path.join(publicZipDir, path.basename(zipPath));
                fs.copyFileSync(zipPath, publicZipPath);
                const publicUrl = publicFileUrl(publicZipPath);
                await this.whatsappClient.sendDocument(chatId, publicUrl, path.basename(zipPath));
            }
            return true;
        } catch (e) {
            console.error('[BackupService] Failed to send WhatsApp message:', e.message);
            return false;
        }
    }

    async sendErrorNotification(error) {
        if (!this.whatsappClient) return;
        const chatId = '91' + this.whatsappNumber;
        const errorMessage =
            '\u274C *Database Backup Failed*\n\n' +
            '\uD83D\uDCC5 Date: ' + moment().format('DD/MM/YYYY') + '\n' +
            '\u23F0 Time: ' + moment().format('HH:mm:ss') + '\n' +
            '\uD83D\uDEA8 Error: ' + error.message + '\n\n' +
            'Please check the system and resolve the issue.\n\n' +
            '_This is an automated error notification._';
        try {
            await this.whatsappClient.sendText(chatId, errorMessage);
        } catch (e) {
            console.error('[BackupService] Failed to send error notification:', e.message);
        }
    }

    async cleanupOldBackups() {
        try {
            const files = fs.readdirSync(this.backupBaseDir);
            const cutoffDate = moment().subtract(this.retentionDays, 'days');
            let deletedCount = 0;
            for (const file of files) {
                if (!file.startsWith('backup01_')) continue;
                const dateStr = file.substring(9, 17);
                const fileDate = moment(dateStr, 'DDMMYYYY');
                if (fileDate.isValid() && fileDate.isBefore(cutoffDate)) {
                    const fullPath = path.join(this.backupBaseDir, file);
                    try {
                        if (fs.statSync(fullPath).isDirectory()) {
                            fs.rmSync(fullPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(fullPath);
                        }
                        deletedCount++;
                    } catch (e) {
                        console.error('[BackupService] Failed to delete ' + file + ':', e.message);
                    }
                }
            }
            if (deletedCount > 0) {
                console.log('[BackupService] Cleanup completed: ' + deletedCount + ' old backups deleted');
            }
        } catch (e) {
            console.error('[BackupService] Cleanup failed:', e.message);
        }
    }

    async performBackup() {
        console.log('[BackupService] Starting backup process...');
        try {
            const backupPath = await this.createBackupFolder();
            const fileCount = await this.copyDbfFiles(backupPath);
            if (fileCount === 0) throw new Error('No .dbf files found to backup');

            const zipPath = await this.createZipArchive(backupPath);
            const messageSent = await this.sendWhatsAppMessage(zipPath, fileCount);
            await this.cleanupOldBackups();

            try {
                fs.rmSync(backupPath, { recursive: true, force: true });
            } catch (e) {
                console.error('[BackupService] Failed to remove backup folder:', e.message);
            }

            return { success: true, fileCount, zipPath, messageSent };
        } catch (e) {
            console.error('[BackupService] Backup process failed:', e.message);
            await this.sendErrorNotification(e);
            return { success: false, error: e.message };
        }
    }
}

// ── Backup Configuration & Scheduling ─────────────────────────────────────────

let backupConfig;
try {
    const configPath = path.join(__dirname, 'backup-config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const raw = JSON.parse(configData);
    backupConfig = raw.backup || raw;
} catch (e) {
    console.error('[CONFIG] Failed to load backup configuration, using defaults:', e.message);
    backupConfig = {
        schedule: { enabled: true, time: '21:00', timezone: 'Asia/Kolkata', cron: '0 21 * * *' },
        paths: { sourceDir: 'F:\\FMCG\\d01-2627\\data', backupBaseDir: 'F:\\FMCG\\d01-2627\\data' },
        whatsapp: { number: '9169164888', sendNotifications: true, sendFiles: true },
        retention: { days: 7, autoCleanup: true },
        manual: { enabled: true, allowedNumbers: ['9169164888'] }
    };
}

const backupService = new BackupService({
    sourceDir: backupConfig.paths.sourceDir,
    backupBaseDir: backupConfig.paths.backupBaseDir,
    whatsappNumber: backupConfig.whatsapp.number,
    retentionDays: backupConfig.retention.days,
});

// Use the modern CxBotClient (aggregate API) for backup notifications
backupService.setWhatsAppClient(cxbot);

// Schedule daily backup if enabled
if (backupConfig.schedule.enabled) {
    cron.schedule(backupConfig.schedule.cron, async () => {
        console.log('[CRON] Starting scheduled backup at ' + backupConfig.schedule.time + '...');
        try {
            const result = await backupService.performBackup();
            if (result.success) {
                console.log('[CRON] Scheduled backup completed successfully');
            } else {
                console.error('[CRON] Scheduled backup failed:', result.error);
            }
        } catch (e) {
            console.error('[CRON] Scheduled backup error:', e.message);
        }
    }, { scheduled: true, timezone: backupConfig.schedule.timezone });
    console.log('[CRON] Daily backup scheduled for ' + backupConfig.schedule.time + ' ' + backupConfig.schedule.timezone);
} else {
    console.log('[CRON] Scheduled backup is disabled in configuration');
}

// ── Backup API Endpoints (trigger from app.js or directly) ────────────────────

app.get('/api/backup/status', (req, res) => {
    res.json({
        scheduled: backupConfig.schedule.enabled,
        scheduleTime: backupConfig.schedule.time,
        timezone: backupConfig.schedule.timezone,
        retentionDays: backupConfig.retention.days,
        sourceDir: backupConfig.paths.sourceDir,
        whatsappNumber: backupConfig.whatsapp.number,
    });
});

app.post('/api/backup/trigger', async (req, res) => {
    try {
        const result = await backupService.performBackup();
        if (result.success) {
            res.json({ success: true, fileCount: result.fileCount, zipPath: result.zipPath });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log('[API] FMCG Business API listening on port ' + PORT);
    console.log('[API] Base URL: http://localhost:' + PORT);
});
