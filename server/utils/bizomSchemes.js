// Godrej scheme download from the Bizom salesman app API (g-next.bizom.in).
// Port of src/Bizom/new_scraper/index.js:
//   1. App login (login.bizom.in/users/pdalogin) -> CAKEPHP cookie
//   2. Product list -> Skunit id => skucode map
//   3. getuserinfo -> outlet category holder ids -> scheme holders -> scheme ids
//   4. getSchemeForSchemeIds -> schemes, for_skunit_id replaced by for_skucode
//   5. Saved to server/db/godrej-schemes/all_schemes.json (read by routes/godrej_scheme.js)
//
// Required in server/.env:
//   BIZOM_APP_USERNAME, BIZOM_APP_PASSWORD   (salesman app login, not the reports.bizom.in login)
// Optional:
//   BIZOM_APP_VERSION=3.0.28.007  (auto-bumped when Bizom answers "download latest version")
//   BIZOM_WAREHOUSE_IDS=6,1755
//   BIZOM_WHOLESALE_CATEGORIES=13  (Bizom outlet category ids that are wholesale; all others are retail)
const path = require('path');
const fsp = require('fs').promises;

const OUT_DIR = path.join(__dirname, '..', 'db', 'godrej-schemes');
const SCHEMES_FILE = path.join(OUT_DIR, 'all_schemes.json');
const API = 'https://g-next.bizom.in/';
const APP_ID = 'b0929bfb769547b4';
const IMEI = '0c1a18a4f55596c3';

let appVersion = process.env.BIZOM_APP_VERSION || '3.0.28.007';
let running = null;

const userAgent = () => `Bizom/${appVersion} Android`;

async function login(username, password, retried = false) {
    // Bizom is strict about this exact multipart layout (per-part Content-Length)
    const boundary = '994580c0-3d1d-4ab8-91ed-e4c595d611a1';
    const part = (name, value) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="data[User][${name}]"\r\n` +
        `Content-Length: ${Buffer.byteLength(value)}\r\n\r\n${value}\r\n`;
    const body = part('username', username) + part('password', password) +
        part('imei', IMEI) + part('language', 'en') + `--${boundary}--\r\n`;

    const res = await fetch('https://login.bizom.in/users/pdalogin/', {
        method: 'POST',
        headers: { 'User-Agent': userAgent(), 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body
    });
    if (!res.ok) throw new Error(`Bizom login failed (HTTP ${res.status})`);
    const data = await res.json();

    if (data.Result === 'true' && data.Cookie) return data.Cookie;

    if (!retried && /latest version/i.test(data.Reason || '') && data.minSdkVersion && data.minSdkVersion !== appVersion) {
        console.log(`[bizom-schemes] app version ${appVersion} rejected, retrying as ${data.minSdkVersion}`);
        appVersion = data.minSdkVersion;
        return login(username, password, true);
    }
    throw new Error(`Bizom login failed: ${data.Reason || 'no session cookie returned'}`);
}

async function api(cookie, urlPath, payload) {
    const headers = { 'User-Agent': userAgent(), 'X-App-Id': APP_ID, Cookie: cookie };
    const opts = payload
        ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        : { headers };
    const res = await fetch(API + urlPath, opts);
    if (!res.ok) throw new Error(`Bizom ${urlPath.split('?')[0]} failed (HTTP ${res.status})`);
    return res.json();
}

async function fetchSkuCodeMap(cookie) {
    const map = {};
    const limit = 10000;
    for (let page = 1; ; page++) {
        const data = await api(cookie, `skunits/getareawisecategoriesproductsNewApi?fordevice=0,1&skunitsOnly=1&pageno=${page}&limit=${limit}&language=en`);
        const products = data.Products || [];
        for (const p of products) {
            if (p.Skunit && p.Skunit.id) map[p.Skunit.id] = p.Skunit.skucode || p.Skunit.id;
        }
        if (products.length < limit) break;
    }
    return map;
}

async function fetchSchemes(cookie) {
    const user = await api(cookie, 'users/getuserinfo?language=en');
    const dropdown = user.User?.workflows?.setDistributorDropDownValues;
    if (!dropdown) throw new Error('Bizom user info has no outlet categories (setDistributorDropDownValues)');
    const holderIds = JSON.parse(dropdown).outletcategories?.id || [];

    const holders = await api(cookie, 'schemes/getSchemeHoldersForSyncOfflineData?language=en', {
        api_version: '1',
        holderIds: holderIds.join(','),
        holderType: 'outletcategory',
        warehouseIds: process.env.BIZOM_WAREHOUSE_IDS || '6,1755'
    });
    // Which outlet categories each scheme is attached to -> retail / wholesale / both
    const wholesaleCats = new Set(String(process.env.BIZOM_WHOLESALE_CATEGORIES || '13').split(',').map(s => s.trim()));
    const sides = {};
    for (const h of holders.schemeholders || []) {
        const side = wholesaleCats.has(String(h.holderid)) ? 'WS' : 'RT';
        for (const id of h.schemeids || []) {
            sides[id] = sides[id] || new Set();
            sides[id].add(side);
        }
    }
    const schemeIds = Object.keys(sides);
    if (schemeIds.length === 0) return [];

    const data = await api(cookie, 'schemes/getSchemeForSchemeIds?language=en', { schemeIds: schemeIds.join(',') });
    const schemes = data.Scheme || [];
    for (const scheme of schemes) {
        const s = sides[scheme.id] || sides[scheme.scheme_id];
        scheme.outlet_segment = !s || s.size > 1 ? 'BOTH' : [...s][0];
    }
    return schemes;
}

async function run() {
    const username = process.env.BIZOM_APP_USERNAME;
    const password = process.env.BIZOM_APP_PASSWORD;
    if (!username || !password) throw new Error('BIZOM_APP_USERNAME / BIZOM_APP_PASSWORD missing in server/.env');

    const cookie = await login(username, password);
    const skuCodes = await fetchSkuCodeMap(cookie);
    const schemes = await fetchSchemes(cookie);

    for (const scheme of schemes) {
        if (Array.isArray(scheme.for_skunit_id)) {
            scheme.for_skucode = scheme.for_skunit_id.map(id => skuCodes[id] || id);
            delete scheme.for_skunit_id;
        }
    }

    await fsp.mkdir(OUT_DIR, { recursive: true });
    const tmp = SCHEMES_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(schemes), 'utf8');
    await fsp.rename(tmp, SCHEMES_FILE);

    return {
        schemes: schemes.length,
        active: schemes.filter(s => s.active === '1').length,
        retail: schemes.filter(s => s.outlet_segment === 'RT').length,
        wholesale: schemes.filter(s => s.outlet_segment === 'WS').length,
        products: Object.keys(skuCodes).length,
        file: SCHEMES_FILE
    };
}

// Concurrent clicks share one download instead of hammering Bizom
function downloadSchemes() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
}

module.exports = { downloadSchemes, SCHEMES_FILE };
