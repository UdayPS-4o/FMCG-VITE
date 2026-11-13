/**
 * Demo session for the promo video.
 * The app runs for real, but every personal endpoint is answered here with a
 * FICTIONAL retailer, and nothing is ever written to the real server.
 * Only the public, read-only catalogue (products / brands / schemes / images)
 * is fetched from production.
 */
import puppeteer from 'puppeteer';

export const APP = 'http://localhost:5174';
const PROD = 'https://server.ekta-enterprises.com';
const PASS_GET = [/^\/api\/app\/products/, /^\/api\/app\/brands/, /^\/api\/app\/schemes\/active/, /^\/api\/app\/product-images/];

const day = 86400000;
const iso = (dAgo, h = 11) => { const d = new Date(Date.now() - dAgo * day); d.setHours(h, 20, 0, 0); return d.toISOString(); };
const dmy = (dAgo) => { const d = new Date(Date.now() - dAgo * day); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };

export const USER = {
    partyCode: 'DEMO01',
    name: 'Shree Ganesh Kirana Store',
    mobile: '98XXXXXX10',
    address: 'Main Bazaar, Station Road',
    gst: '23ABCDE1234F1Z5',
    balance: '₹18,640.00 DR',
    mustChangePassword: false,
};

const orders = [
    {
        id: 'T1042', series: 'T', billNo: 1042, date: iso(1, 16), updatedAt: iso(1, 17), status: 'Approved',
        partyCode: USER.partyCode, partyName: USER.name, totalAmount: 6480, notes: 'Payment Mode: Cash', paymentMode: 'Cash',
        items: [
            { productCode: 'D1', productName: 'SURF EXCEL EASY WASH 1KG', qtyPcs: 0, qtyBoxes: 2, rate: 2640, netAmount: 5280 },
            { productCode: 'D2', productName: 'LIFEBUOY TOTAL 100G', qtyPcs: 48, qtyBoxes: 0, rate: 25, netAmount: 1200 },
        ],
    },
    {
        id: 'T1031', series: 'T', billNo: 1031, date: iso(5, 12), updatedAt: iso(5, 15), status: 'Invoiced',
        invoiceSeries: 'A', invoiceBillNo: '2318', invoiceAmount: 12160,
        partyCode: USER.partyCode, partyName: USER.name, totalAmount: 12160, notes: 'Payment Mode: Credit', paymentMode: 'Credit',
        items: [
            { productCode: 'D3', productName: 'MK SOYA OIL 4KG JAR', qtyPcs: 0, qtyBoxes: 4, rate: 2920, netAmount: 11680 },
            { productCode: 'D4', productName: 'CLINIC PLUS SHAMPOO 80ML', qtyPcs: 12, qtyBoxes: 0, rate: 40, netAmount: 480 },
        ],
    },
];

const invoices = [
    { SERIES: 'A', BILL: 2204, DATE: iso(12), N_B_AMT: 8425 },
    { SERIES: 'A', BILL: 2097, DATE: iso(21), N_B_AMT: 15230 },
    { SERIES: 'A', BILL: 1988, DATE: iso(33), N_B_AMT: 6480 },
    { SERIES: 'A', BILL: 1850, DATE: iso(47), N_B_AMT: 9870 },
];

const summary = {
    details: { gst: USER.gst, fssai: '11423999000123', pan: 'ABCDE1234F', email: 'ganeshkirana@example.com', address: USER.address, pincode: '480001' },
    credit: { limit: 50000, days: 15 },
    balance: { amount: 18640, type: 'DR' },
    outstanding: {
        total: 18640,
        bills: [
            { date: dmy(5), series: 'A', billNo: '2318', label: 'A-2318', amount: 12160, pending: 12160, ageDays: 5, dueDays: 10, overdueDays: null },
            { date: dmy(12), series: 'A', billNo: '2204', label: 'A-2204', amount: 8425, pending: 6480, ageDays: 12, dueDays: 3, overdueDays: null },
        ],
    },
    location: null,
    prefs: { orderUpdates: true, paymentReminders: true, schemeAlerts: true, contacts: [] },
};

const led = (dAgo, narration, book, dr, cr, series = '', billNo = '') =>
    ({ date: dmy(dAgo), narration, book, cr, dr, amount: cr > 0 ? cr : dr, type: cr > 0 ? 'CR' : 'DR', series, billNo });
const ledger = [
    led(5, 'SALE BILL A-2318', 'SALE', 12160, 0, 'A', '2318'),
    led(9, 'UPI RECEIVED', 'BANK', 0, 10000),
    led(12, 'SALE BILL A-2204', 'SALE', 8425, 0, 'A', '2204'),
    led(19, 'CASH RECEIVED', 'CASH', 0, 15230),
    led(21, 'SALE BILL A-2097', 'SALE', 15230, 0, 'A', '2097'),
    led(30, 'UPI RECEIVED', 'BANK', 0, 6480),
    led(33, 'SALE BILL A-1988', 'SALE', 6480, 0, 'A', '1988'),
    led(47, 'SALE BILL A-1850', 'SALE', 9870, 0, 'A', '1850'),
];

/** Swap the placeholder order lines for real catalogue products (public data). */
export async function hydrateOrders() {
    const get = async (brand) => (await (await fetch(`${PROD}/api/app/products?page=1&limit=20&brand=${brand}`)).json()).data.filter(p => p.image_url);
    const pool = [...(await get('B_049')).slice(0, 2), ...(await get('B_035')).slice(0, 1), ...(await get('B_019')).slice(0, 2)];
    const line = (p, boxes, pcs) => {
        const conv = Number(p.MULT_F) || 1, rate = Number(p.RATE1) || 0;
        return { productCode: p.CODE, productName: p.PRODUCT, qtyPcs: pcs, qtyBoxes: boxes, rate: boxes && !pcs ? rate * conv : rate, mrp: p.MRP1, sch: 0, netAmount: Math.round((boxes * conv + pcs) * rate * 100) / 100, image_url: p.image_url };
    };
    orders[0].items = [line(pool[0], 1, 0), line(pool[2], 0, 12)];
    orders[1].items = [line(pool[1], 1, 0), line(pool[3], 0, 6), line(pool[4], 0, 6)];
    for (const o of orders) { o.totalAmount = Math.round(o.items.reduce((s, i) => s + i.netAmount, 0)); if (o.invoiceAmount != null) o.invoiceAmount = o.totalAmount; }
    summary.outstanding.bills[0].amount = summary.outstanding.bills[0].pending = orders[1].totalAmount;
    summary.outstanding.total = summary.balance.amount = orders[1].totalAmount + summary.outstanding.bills[1].pending;
    USER.balance = `₹${summary.balance.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} DR`;
    ledger[0].dr = ledger[0].amount = orders[1].totalAmount;
}

function mockFor(method, path, body) {
    const p = path.replace(/^\/api\/app/, '');
    if (p === '/me') return USER;
    if (p === '/request-otp') return { success: true };
    if (p === '/verify-otp') return { success: true, token: 'demo-token', user: USER, mustChangePassword: false };
    if (p === '/wa-cart') return { waCart: [] };
    if (p === '/promotions/active') return [];
    if (p === '/festival-theme/active') return { theme: null, serverTime: new Date().toISOString() };
    if (p === '/orders' && method === 'GET') return [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (p === '/orders' && method === 'POST') {
        const o = { ...body, id: 'T1043', series: 'T', billNo: 1043, date: new Date().toISOString(), status: 'Pending', partyCode: USER.partyCode, partyName: USER.name };
        orders.push(o);
        return { success: true, order: o };
    }
    if (p === '/past-invoices') return invoices;
    if (p === '/ledger') return { success: true, data: ledger };
    if (p === '/profile/summary') return summary;
    if (p.startsWith('/profile/ledger')) return { fy: '2627', years: ['2627', '2526'], data: ledger };
    if (p === '/profile/sessions') return [{ id: 1, device: 'Android · Chrome', createdAt: iso(20), lastSeen: iso(0), current: true }];
    return {}; // anything else (push subscribe, prefs, logout …) is swallowed
}

export const approveLatestOrder = () => {
    const o = orders.find(x => x.id === 'T1043');
    if (o) { o.status = 'Approved'; o.updatedAt = new Date().toISOString(); }
};

const cache = new Map();
async function fromProd(pathAndQuery) {
    if (cache.has(pathAndQuery)) return cache.get(pathAndQuery);
    const r = await fetch(PROD + pathAndQuery);
    const out = { status: r.status, contentType: r.headers.get('content-type') || 'application/json', body: Buffer.from(await r.arrayBuffer()) };
    if (r.ok) cache.set(pathAndQuery, out);
    return out;
}

export async function openApp({ width = 800, height = 1600, dsf = 1, loggedIn = true } = {}) {
    const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
        try {
            const u = new URL(req.url());
            if (u.port === '5174' && req.resourceType() === 'document') {
                // Render the 400px-wide phone layout at 2x so the recording is sharp (800x1600)
                const html = (await (await fetch(req.url())).text()).replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=400, user-scalable=no">');
                return req.respond({ status: 200, contentType: 'text/html', body: html });
            }
            if (u.port !== '8000' && u.port !== '5000') return req.continue();
            const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
            if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
            const isApi = u.pathname.startsWith('/api/');
            const pass = req.method() === 'GET' && (!isApi || PASS_GET.some(re => re.test(u.pathname)));
            if (pass) {
                // the cache-buster on /brands would defeat our cache
                const q = u.pathname.startsWith('/api/app/brands') ? '' : u.search;
                const r = await fromProd(u.pathname + q);
                return req.respond({ status: r.status, headers: cors, contentType: r.contentType, body: r.body });
            }
            let body = {};
            try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
            return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockFor(req.method(), u.pathname, body)) });
        } catch (e) {
            try { req.abort(); } catch { /* already handled */ }
        }
    });
    await page.evaluateOnNewDocument((user, loggedIn) => {
        if (loggedIn && !localStorage.getItem('app_token')) {
            localStorage.setItem('app_token', 'demo-token');
            localStorage.setItem('app_user', JSON.stringify(user));
        }
        if (!localStorage.getItem('app_language')) localStorage.setItem('app_language', 'hi');
        // show every tap as a ripple so viewers can follow along
        const css = document.createElement('style');
        css.textContent = '@keyframes promoTap{0%{transform:translate(-50%,-50%) scale(.35);opacity:.95}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}';
        const ripple = (x, y) => {
            if (!css.isConnected) document.documentElement.appendChild(css);
            const d = document.createElement('div');
            d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:54px;height:54px;border-radius:50%;background:rgba(79,70,229,.28);border:2.5px solid rgba(79,70,229,.85);pointer-events:none;z-index:2147483647;animation:promoTap .55s ease-out forwards`;
            document.documentElement.appendChild(d);
            setTimeout(() => d.remove(), 600);
        };
        window.addEventListener('mousedown', e => ripple(e.clientX, e.clientY), true);
        // no real notification prompt / service worker in the demo
        try { Object.defineProperty(window, 'Notification', { value: undefined }); } catch { /* ignore */ }
    }, USER, loggedIn);
    return { browser, page };
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
