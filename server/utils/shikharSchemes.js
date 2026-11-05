// Shikhar (HUL) scheme downloader.
// HUL shows each outlet only the schemes for its channel, so we log in as one retail and one wholesale
// outlet, download both catalogues and tag every scheme slab RT / WS / BOTH by where it was offered.
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://shikhar-cdn-prod.hulcd.com/api/v1/products_v1/brands';
const SESSIONS_FILE = path.join(__dirname, '../db/shikhar-sessions.json'); // gitignored (server/db)
const OUTPUT_FILE = path.join(__dirname, '../../public/all.json');
const LEGACY_SCRAPER = path.join(__dirname, '../../scraper_puppeteer.js');
const SIDES = ['retail', 'wholesale'];
const SEGMENT_FOR_SIDE = { retail: 'RT', wholesale: 'WS' };

// Decode the 'data' cookie Shikhar sets after OTP login: base64 JSON holding the retailer profile + token
function decodeCookie(value) {
    const raw = String(value || '').trim().replace(/^data=/, '');
    let retailer;
    try {
        retailer = JSON.parse(Buffer.from(decodeURIComponent(raw), 'base64').toString('utf8')).retailer;
    } catch {
        throw new Error('This is not a Shikhar "data" cookie (could not decode it).');
    }
    if (!retailer || !retailer.accesstoken || !retailer.parcodehul) {
        throw new Error('The cookie has no logged-in outlet. Log in to shikhar.hulcd.com again and copy the "data" cookie.');
    }
    return { raw, retailer };
}

async function writeJsonAtomic(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
}

async function readSessions() {
    let sessions = {};
    try {
        sessions = JSON.parse(await fs.readFile(SESSIONS_FILE, 'utf8'));
    } catch { /* first run */ }
    // Before this file existed the retail cookie lived inside scraper_puppeteer.js
    if (!sessions.retail) {
        try {
            const src = await fs.readFile(LEGACY_SCRAPER, 'utf8');
            const m = src.match(/"name"\s*:\s*"data"[^}]*?"value"\s*:\s*"([^"]+)"/s);
            if (m) {
                decodeCookie(m[1]);
                sessions.retail = { cookie: m[1], saved_at: null };
            }
        } catch { /* no usable legacy cookie */ }
    }
    return sessions;
}

// What the page shows for each side; never returns the cookie itself
async function sessionStatus() {
    const sessions = await readSessions();
    const status = {};
    for (const side of SIDES) {
        const s = sessions[side];
        if (!s) { status[side] = null; continue; }
        try {
            const { retailer } = decodeCookie(s.cookie);
            status[side] = { outlet: retailer.name || '', hulid: retailer.parcodehul, saved_at: s.saved_at || null };
        } catch (e) {
            status[side] = { error: e.message, saved_at: s.saved_at || null };
        }
    }
    return status;
}

function client(cookie) {
    const { raw, retailer } = decodeCookie(cookie);
    const get = async (url, extra = {}) => {
        const res = await fetch(url, {
            headers: {
                accept: 'application/json, text/plain, */*',
                'content-type': 'application/json',
                hulid: retailer.parcodehul,
                ispwa: '1',
                languagetype: '0',
                versioncode: '121',
                viewall: '1',
                cookie: `data=${raw}`,
                accesstoken: retailer.accesstoken,
                ...extra
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return res.json();
    };
    return { get, retailer };
}

async function fetchBrands(get, outletName) {
    const data = await get(`${BASE_URL}/brands`);
    if (!Array.isArray(data.brands_list) || data.brands_list.length === 0) {
        throw new Error(`Shikhar rejected the ${outletName} session (no brands returned). Update that cookie.`);
    }
    return data.brands_list;
}

async function fetchBrandProducts(get, brandId) {
    const products = [];
    const seen = new Set();
    let start = 0, emptyPages = 0, duplicatePages = 0;
    while (true) {
        const data = await get(`${BASE_URL}/brands_products_new`, { brandid: brandId, start: String(start), outoffstockbasepacks: '' });
        if (data.messagecode !== 200 || !data.productgroup) break;
        const page = data.productgroup.flatMap(g => g.products || []);
        let added = 0;
        for (const p of page) {
            if (p.basepack_code && !seen.has(p.basepack_code)) {
                seen.add(p.basepack_code);
                products.push(p);
                added++;
            }
        }
        // The API repeats its last page instead of returning an empty one
        if (added === 0 && page.length > 0) {
            if (++duplicatePages >= 2) break;
        } else {
            duplicatePages = 0;
        }
        if (page.length === 0) {
            if (++emptyPages >= 2) break;
            start += 20;
        } else {
            emptyPages = 0;
            start = typeof data.start === 'number' && data.start > start ? data.start : start + page.length;
        }
    }
    return products;
}

async function downloadOutlet(cookie) {
    const { get, retailer } = client(cookie);
    const brands = await fetchBrands(get, retailer.name);
    const result = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < brands.length; i += CONCURRENCY) {
        const batch = await Promise.all(brands.slice(i, i + CONCURRENCY).map(async b => {
            try {
                return { brand_id: b.brand_id, brand_desc: b.brand_desc, products: await fetchBrandProducts(get, b.brand_id) };
            } catch (e) {
                console.error(`Shikhar ${retailer.name}: brand ${b.brand_desc} failed:`, e.message);
                return { brand_id: b.brand_id, brand_desc: b.brand_desc, products: [] };
            }
        }));
        result.push(...batch);
    }
    return { outlet: { name: retailer.name, hulid: retailer.parcodehul }, brands: result };
}

// Merge the outlets' catalogues. A slab offered to both outlets is BOTH, otherwise the side that saw it.
// (Same activity code = same scheme: slabs and discounts were identical across outlets when compared.)
function mergeOutlets(downloads) {
    const brands = new Map();
    const products = new Map(); // basepack -> product
    const slabs = new Map();    // basepack -> Map(activity|slabStart -> { scheme, sides:Set })

    for (const [side, dl] of Object.entries(downloads)) {
        for (const b of dl.brands) {
            if (!brands.has(b.brand_id)) brands.set(b.brand_id, { brand_id: b.brand_id, brand_desc: b.brand_desc, basepacks: [] });
            for (const p of b.products) {
                const bp = p.basepack_code;
                if (!products.has(bp)) {
                    products.set(bp, p);
                    brands.get(b.brand_id).basepacks.push(bp);
                    slabs.set(bp, new Map());
                }
                const bySlab = slabs.get(bp);
                for (const s of p.new_schemes_info || []) {
                    const key = `${s.activitycode}|${s.scheme_slab_start}`;
                    const entry = bySlab.get(key) || { scheme: s, sides: new Set() };
                    entry.sides.add(side);
                    bySlab.set(key, entry);
                }
            }
        }
    }

    const counts = { RT: 0, WS: 0, BOTH: 0 };
    const out = [];
    for (const b of brands.values()) {
        out.push({
            brand_id: b.brand_id,
            brand_desc: b.brand_desc,
            products: b.basepacks.map(bp => {
                const new_schemes_info = [...slabs.get(bp).values()].map(({ scheme, sides }) => {
                    const outlet_segment = sides.size > 1 ? 'BOTH' : SEGMENT_FOR_SIDE[[...sides][0]];
                    counts[outlet_segment]++;
                    return { ...scheme, outlet_segment };
                });
                // schemes_info repeats new_schemes_info in another shape; drop it so each slab appears once
                return { ...products.get(bp), new_schemes_info, schemes_info: [] };
            })
        });
    }
    return { brands: out, counts };
}

async function run() {
    const sessions = await readSessions();
    const sides = SIDES.filter(side => sessions[side]);
    if (sides.length === 0) throw new Error('No Shikhar session saved. Paste the Retail and Wholesale cookies first.');

    const downloads = {};
    const failures = [];
    await Promise.all(sides.map(async side => {
        try {
            downloads[side] = await downloadOutlet(sessions[side].cookie);
        } catch (e) {
            failures.push(`${side}: ${e.message}`);
        }
    }));
    // A partial download would tag everything as one side, so stop instead of overwriting good data
    if (failures.length) throw new Error(`Shikhar download failed. ${failures.join(' | ')}`);

    const { brands, counts } = mergeOutlets(downloads);
    const combined = {
        total_brands: brands.length,
        total_products: brands.reduce((n, b) => n + b.products.length, 0),
        outlets: Object.fromEntries(Object.entries(downloads).map(([side, d]) => [side, d.outlet])),
        brands,
        scraped_at: new Date().toISOString()
    };
    await writeJsonAtomic(OUTPUT_FILE, combined);
    return {
        products: combined.total_products,
        outlets: combined.outlets,
        slabs: counts,
        missing: SIDES.filter(side => !sessions[side])
    };
}

let inflight = null;
function downloadSchemes() {
    if (!inflight) inflight = run().finally(() => { inflight = null; });
    return inflight;
}

// Validate, test against Shikhar, then persist the cookie for one side
async function saveSession(side, cookie) {
    if (!SIDES.includes(side)) throw new Error('side must be "retail" or "wholesale".');
    const { raw, retailer } = decodeCookie(cookie);
    const { get } = client(raw);
    await fetchBrands(get, retailer.name);
    const sessions = await readSessions();
    const other = SIDES.find(s => s !== side);
    if (sessions[other]) {
        try {
            if (decodeCookie(sessions[other].cookie).retailer.parcodehul === retailer.parcodehul) {
                throw new Error(`${retailer.name} is already saved as the ${other} outlet. Use a different outlet's login.`);
            }
        } catch (e) {
            if (e.message.includes('already saved')) throw e;
        }
    }
    sessions[side] = { cookie: raw, saved_at: new Date().toISOString() };
    await writeJsonAtomic(SESSIONS_FILE, sessions);
    return { outlet: retailer.name, hulid: retailer.parcodehul };
}

module.exports = { downloadSchemes, sessionStatus, saveSession, OUTPUT_FILE };
