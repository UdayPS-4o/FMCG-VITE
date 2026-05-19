/**
 * Shikhar Scheme Scraper — Direct HTTP (no Puppeteer)
 * Reads cookies/headers from this file, calls the Shikhar API directly,
 * and writes the result to public/all.json.
 */

const fs = require('fs-extra');
const path = require('path');

const BASE_URL = 'https://shikhar-cdn-prod.hulcd.com/api/v1/products_v1/brands';
const OUTPUT_PATH = path.join(__dirname, 'public', 'all.json');

const COOKIES = [
    {
        "domain": ".hulcd.com",
        "expirationDate": 1812910702.169183,
        "hostOnly": false,
        "httpOnly": false,
        "name": "_ga_HG3QRT1TP7",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "GS2.1.s1778350267$o12$g0$t1778350702$j43$l0$h0"
    },
    {
        "domain": "shikhar.hulcd.com",
        "expirationDate": 1804134324,
        "hostOnly": true,
        "httpOnly": false,
        "name": "data",
        "path": "/",
        "sameSite": "strict",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "eyJtZXNzYWdlY29kZSI6MjAwLCJtZXNzYWdlIjoiT1RQIFZlcmlmaWVkISIsIm1lc3NhZ2VfaWQiOjI4LCJ3ZWJlbmdhZ2VfYW5hbHl0aWMiOiIxIiwicmV0YWlsZXIiOnsicGFyY29kZWh1bCI6IkhVTC0xMDI5MzhQMzU5IiwiaW1hZ2V1cmwiOm51bGwsIm90cCI6bnVsbCwiZmxhZyI6MCwicHJpdmFjeV9mbGFnIjoiMSIsImFjY2Vzc3Rva2VuIjoiZXlKaGJHY2lPaUpJVXpJMU5pSjkuZXlKa1lYUmhJam9pU0ZWTUxURXdNamt6T0ZBek5Ua2lMQ0psZUhBaU9qRTFPVFV4TnpnNE5EVTJOSDAuVVRmNFJhRzdkQk85bGtlMk81Y2s3NVhRdzN3ZzJWSjZ6MDJiN21yMi1EOCIsInJzY29kZSI6IkEzQTE5OCIsInF1YW50aXR5bGltaXQiOjk5OTk5LCJhbW91bnRsaW1pdCI6MTAwMDAsIm1pbnF0eSI6MCwiaXN2aWpldGEiOiIiLCJsb2dpbmZsYWciOjEsImxvZ2luZGF0ZSI6IjIwMjYtMDMtMDRUMDk6NTQ6MzkuMDAwKzA1OjMwIiwidmVyc2lvbmNvZGUiOjEyMSwid2VsY29tZWZsYWciOjEsInRlcm1zYW5kY29uZGl0aW9uc2ZsYWciOjEsImN1cnJlbnRkYXRldGltZSI6IjIwMjEtMDQtMjlUMDA6MjQ6MDYuMDAwKzA1OjMwIiwibG9ja2NvdW50ZXIiOjAsInBheW1lbnRtb2RlIjoxLCJvdHBjb3VudCI6MCwid2ViYWNjZXNzdG9rZW4iOm51bGwsInB3YWtleSI6bnVsbCwiaXNhZHZwYXltZW50IjozLCJ0ZXJtc2ZsYWd1bmlwYXkiOjEsImxhbmd1YWdldHlwZSI6IjAiLCJsb2dpbmNhcGNvdW50Ijo3LCJ2aWRlb3N0YXR1cyI6bnVsbCwid2hhdHN1cGZsYWciOjAsInJlZmVyYWxfY29kZSI6IjE0OTI5MTEiLCJyZWZlcmVuY2VfY29kZSI6bnVsbCwicGFyc3RhdHVzIjoiQUNUSVZFIiwic2hpa2hhcl9zdGF0dXMiOiJBQ1RJVkUiLCJlbWFpbGlkIjoibnVsbCIsIm5hbWUiOiJTYW5kZWVwIEtpcmFuYSBDaGFwYXJhIiwic21jb2RlIjpudWxsLCJhcmVhY29kZSI6IkVfTVAwMDEiLCJzdGF0ZSI6Ik1BUCIsImNvdW50cnkiOiJJTiIsImN1cnJlbmN5IjoiTiIsInBhcmFkZHJlc3MxIjoiTmVhciBPbGQgUG9saWNlIFN0YXRpb24iLCJwYXJhZGRyZXNzMiI6IkNoYXBhcmEiLCJwYXJhZGRyZXNzMyI6IkRpc3QtU2VvbmkiLCJwYXJhZGRyZXNzNCI6Ik4uQS4iLCJwYXJjb2RlcmVmIjoiUDE2NTgiLCJicmFuY2giOiIxMCIsIndoYXRzcHBfY29uc2VudF9tc2ciOiJSZWNlaXZlIHBvaW50cyBlYXJuZWQgaW5mb3JtYXRpb24gb24gV2hhdHNBcHAvU01TIiwiaXNpdGVtY2FwX2VuYWJsZSI6MSwiYWx0ZXJuYXRlcGhvbmUiOiIiLCJuZXdfZGV2aWNlX21lc3NhZ2UiOiJZb3UgYXJlIHRyeWluZyB0byBsb2dpbiB0aHJvdWdoIGEgZGlmZmVyZW50IGRldmljZS5QbGVhc2UgZW50ZXIgdGhlIE9UUCBzZW50IHRvIHlvdXIgbW9iaWxlIG51bWJlciBvciBlbWFpbCBpZCB0byBsb2dpbi5cblx0ICBcblx0IiwidXBkYXRlZW1haWxmbGFnIjowLCJpc19uZXdfdXNlciI6MCwiaXNfdmFsaWRfaW1laSI6MCwibmV3X3VzZXJfbWVzc2FnZSI6IllvdSBoYXZlIFNpZ25lZCBVcCBTdWNjZXNzZnVsbHkuIiwicGFyYWNjZXNzdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlKOS5leUprWVhSaElqb2lTRlZNTFRFd01qa3pPRkF6TlRraUxDSmxlSEFpT2pFMU9UVXhOemc0TkRVMk5IMC5VVGY0UmFHN2RCTzlsa2UyTzVjazc1WFF3M3dnMlZKNnowMmI3bXIyLUQ4IiwiaXNfcmVhY3RfbmF0aXZlX2hvbWVwYWdlIjoxLCJpc19yZWFjdF9uYXRpdmUiOjEsImVuYWJsZV92b2ljZV9zZWFyY2giOjF9fQ%3D%3D"
    },
    {
        "domain": ".shikhar.hulcd.com",
        "expirationDate": 1804134332,
        "hostOnly": false,
        "httpOnly": false,
        "name": "cookieconsent_status",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "allow"
    },
    {
        "domain": ".hulcd.com",
        "expirationDate": 1797481626.966235,
        "hostOnly": false,
        "httpOnly": false,
        "name": "_ga_VMEWT4Q7H3",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "GS2.1.s1762921555$o1$g1$t1762921626$j60$l0$h0"
    },
    {
        "domain": ".hulcd.com",
        "expirationDate": 1812910267.650159,
        "hostOnly": false,
        "httpOnly": false,
        "name": "_ga",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "GA1.1.840092059.1762921556"
    },
    {
        "domain": ".hulcd.com",
        "expirationDate": 1784953111,
        "hostOnly": false,
        "httpOnly": false,
        "name": "_gcl_au",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "1.1.53753752.1777177111"
    }
];

// ─── Extract access token from the 'data' cookie ───────────────────────────
function extractAccessToken() {
    const dataCookie = COOKIES.find(c => c.name === 'data');
    if (!dataCookie) return '';
    try {
        const decoded = Buffer.from(decodeURIComponent(dataCookie.value), 'base64').toString('utf8');
        const json = JSON.parse(decoded);
        return json?.retailer?.accesstoken || '';
    } catch (e) {
        console.warn('Could not extract access token:', e.message);
        return '';
    }
}

// ─── Build cookie header string ────────────────────────────────────────────
function buildCookieHeader() {
    return COOKIES.map(c => `${c.name}=${c.value}`).join('; ');
}

// ─── Make a direct API request ─────────────────────────────────────────────
async function apiGet(url, extraHeaders = {}) {
    const accessToken = extractAccessToken();
    const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'hulid': 'HUL-102938P359',
        'ispwa': '1',
        'languagetype': '0',
        'pragma': 'no-cache',
        'versioncode': '121',
        'viewall': '1',
        'cookie': buildCookieHeader(),
        ...( accessToken ? { 'accesstoken': accessToken } : {} ),
        ...extraHeaders
    };

    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
}

// ─── Fetch all brands ──────────────────────────────────────────────────────
async function getAllBrands() {
    console.log('Fetching brands list...');
    const data = await apiGet(`${BASE_URL}/brands`);
    if (!data.brands_list || data.brands_list.length === 0) {
        throw new Error('No brands returned — check cookies/auth');
    }
    console.log(`Found ${data.brands_list.length} brands.`);
    return data.brands_list;
}

// ─── Fetch all products for one brand (with pagination) ───────────────────
async function getProductsForBrand(brand) {
    const { brand_id: brandId, brand_desc: brandName } = brand;
    let allProducts = [];
    let start = 0;
    let emptyCount = 0;
    const seenBasepacks = new Set();
    let consecutiveDuplicatePages = 0;

    while (true) {
        let data;
        try {
            data = await apiGet(`${BASE_URL}/brands_products_new`, {
                'brandid': brandId,
                'start': String(start),
                'outoffstockbasepacks': ''
            });
        } catch (err) {
            console.error(`  Error at start=${start} for ${brandName}: ${err.message}`);
            break;
        }

        if (data.messagecode !== 200 || !data.productgroup) {
            console.warn(`  Unexpected response for ${brandName} at start=${start}`);
            break;
        }

        const page = data.productgroup.flatMap(g => g.products || []);
        
        // Deduplication check to prevent infinite loop if API repeats last page
        let newCount = 0;
        for (const p of page) {
            if (p.basepack_code && !seenBasepacks.has(p.basepack_code)) {
                seenBasepacks.add(p.basepack_code);
                allProducts.push(p);
                newCount++;
            }
        }

        console.log(`  ${brandName}: start=${start} → ${page.length} raw, ${newCount} new (total ${allProducts.length})`);

        if (newCount === 0 && page.length > 0) {
            consecutiveDuplicatePages++;
            if (consecutiveDuplicatePages >= 2) {
                console.log(`  Stopping ${brandName}: received duplicate pages.`);
                break;
            }
        } else {
            consecutiveDuplicatePages = 0;
        }

        if (page.length === 0) {
            emptyCount++;
            if (emptyCount >= 2) break;
            start += 20;
        } else {
            emptyCount = 0;
            const nextStart = typeof data.start === 'number' && data.start > start ? data.start : start + page.length;
            start = nextStart;
        }
    }
    return allProducts;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
    await fs.ensureDir(path.join(__dirname, 'public'));

    const brands = await getAllBrands();
    const allBrandsData = [];

    // Process brands concurrently to avoid HTTP timeout
    const CONCURRENCY = 5;
    for (let i = 0; i < brands.length; i += CONCURRENCY) {
        const batch = brands.slice(i, i + CONCURRENCY);
        console.log(`\n--- Processing batch ${i/CONCURRENCY + 1} of ${Math.ceil(brands.length/CONCURRENCY)} ---`);
        
        const promises = batch.map(async (brand) => {
            try {
                const products = await getProductsForBrand(brand);
                return {
                    brand_id: brand.brand_id,
                    brand_desc: brand.brand_desc,
                    products,
                    scraped_at: new Date().toISOString()
                };
            } catch (err) {
                console.error(`Failed brand ${brand.brand_id}:`, err.message);
                return null;
            }
        });

        const results = await Promise.all(promises);
        for (const res of results) {
            if (res) allBrandsData.push(res);
        }
    }

    const combined = {
        total_brands: allBrandsData.length,
        total_products: allBrandsData.reduce((s, b) => s + b.products.length, 0),
        brands: allBrandsData,
        scraped_at: new Date().toISOString()
    };

    await fs.writeJson(OUTPUT_PATH, combined, { spaces: 2 });
    console.log(`\n[Done] ${combined.total_brands} brands, ${combined.total_products} products → ${OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
