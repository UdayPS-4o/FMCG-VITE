const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

const BASE_URL = 'https://shikhar-cdn-prod.hulcd.com/api/v1/products_v1/brands';
const BRANDS_DIR = path.join(__dirname, '../brands');
const CACHE_DIR = path.join(__dirname, '../cache');

const COOKIES = [
    {
        "domain": "shikhar.hulcd.com",
        "expirationDate": 1781176792.928001,
        "hostOnly": true,
        "httpOnly": false,
        "name": "data",
        "path": "/",
        "sameSite": "strict",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "eyJtZXNzYWdlY29kZSI6MjAwLCJtZXNzYWdlIjoiT1RQIFZlcmlmaWVkISIsIm1lc3NhZ2VfaWQiOjI4LCJ3ZWJlbmdhZ2VfYW5hbHl0aWMiOiIxIiwicmV0YWlsZXIiOnsicGFyY29kZWh1bCI6IkhVTC0xMDI5MzhQMzU5IiwiaW1hZ2V1cmwiOm51bGwsIm90cCI6bnVsbCwiZmxhZyI6MCwicHJpdmFjeV9mbGFnIjoiMSIsImFjY2Vzc3Rva2VuIjoiZXlKaGJHY2lPaUpJVXpJMU5pSjkuZXlKa1lYUmhJam9pU0ZWTUxURXdNamt6T0ZBek5Ua2lMQ0psZUhBaU9qRTFPVFV4TnpnNE5EVTJOSDAuVVRmNFJhRzdkQk85bGtlMk81Y2s3NVhRdzN3ZzJWSjZ6MDJiN21yMi1EOCIsInJzY29kZSI6IkEzQTE5OCIsInF1YW50aXR5bGltaXQiOjk5OTk5LCJhbW91bnRsaW1pdCI6MTAwMDAsIm1pbnF0eSI6MCwiaXN2aWpldGEiOiIiLCJsb2dpbmZsYWciOjEsImxvZ2luZGF0ZSI6IjIwMjUtMTItMTNUMTY6NDk6NTMuMDAwKzA1OjMwIiwidmVyc2lvbmNvZGUiOjEyMSwid2VsY29tZWZsYWciOjEsInRlcm1zYW5kY29uZGl0aW9uc2ZsYWciOjEsImN1cnJlbnRkYXRldGltZSI6IjIwMjEtMDQtMjlUMDA6MjQ6MDYuMDAwKzA1OjMwIiwibG9ja2NvdW50ZXIiOjAsInBheW1lbnRtb2RlIjoxLCJvdHBjb3VudCI6MCwid2ViYWNjZXNzdG9rZW4iOm51bGwsInB3YWtleSI6bnVsbCwiaXNhZHZwYXltZW50IjozLCJ0ZXJtc2ZsYWdldHlwZSI6IjAiLCJsb2dpbmNhcGNvdW50IjozLCJ2aWRlb3N0YXR1cyI6bnVsbCwid2hhdHN1cGZsYWciOjAsInJlZmVyYWxfY29kZSI6IjE0OTI5MTEiLCJyZWZlcmVuY2VfY29kZSI6bnVsbCwicGFyc3RhdHVzIjoiQUNUSVZFIiwic2hpa2hhcl9zdGF0dXMiOiJBQ1RJVkUiLCJlbWFpbGlkIjoibnVsbCIsIm5hbWUiOiJTYW5kZWVwIEtpcmFuYSBDaGFwYXJhIiwic21jb2RlIjpudWxsLCJhcmVhY29kZSI6IkVfTVAwMDEiLCJzdGF0ZSI6Ik1BUCIsImNvdW50cnkiOiJJTiIsImN1cnJlbmN5IjoiTiIsInBhcmFkZHJlc3MxIjoiTmVhciBPbGQgUG9saWNlIFN0YXRpb24iLCJwYXJhZGRyZXNzMiI6IkNoYXBhcmEiLCJwYXJhZGRyZXNzMyI6IkRpc3QtU2VvbmkiLCJwYXJhZGRyZXNzNCI6Ik4uQS4iLCJwYXJjb2RlcmVmIjoiUDE2NTgiLCJicmFuY2giOiIxMCIsIndoYXRzcHBfY29uc2VudF9tc2ciOiJSZWNlaXZlIHBvaW50cyBlYXJuZWQgaW5mb3JtYXRpb24gb24gV2hhdHNBcHAvU01TIiwiaXNpdGVtY2FwX2VuYWJsZSI6MSwiYWx0ZXJuYXRlcGhvbmUiOiIiLCJuZXdfZGV2aWNlX21lc3NhZ2UiOiJZb3UgYXJlIHRyeWluZyB0byBsb2dpbiB0aHJvdWdoIGEgZGlmZmVyZW50IGRldmljZS5QbGVhc2UgZW50ZXIgdGhlIE9UUCBzZW50IHRvIHlvdXIgbW9iaWxlIG51bWJlciBvciBlbWFpbCBpZCB0byBsb2dpbi5cblx0ICBcblx0IiwidXBkYXRlZW1haWxmbGFnIjowLCJpc19uZXdfdXNlciI6MCwiaXNfdmFsaWRfaW1laSI6MCwibmV3X3VzZXJfbWVzc2FnZSI6IllvdSBoYXZlIFNpZ25lZCBVcCBTdWNjZXNzZnVsbHkuIiwicGFyYWNjZXNzdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlKOS5leUprWVhSaElqb2lTRlZNTFRFd01qa3pPRkF6TlRraUxDSmxlSEFpT2pFMU9UVXhOemc0TkRVMk5IMC5VVGY0UmFHN2RCTzlsa2UyTzVjazc1WFF3M3dnMlZKNnowMmI3bXIyLUQ4IiwiaXNfcmVhY3RfbmF0aXZlX2hvbWVwYWdlIjoxLCJpc19yZWFjdF9uYXRpdmUiOjEsImVuYWJsZV92b2ljZV9zZWFyY2giOjF9fQ%3D%3D"
    },
    {
        "domain": "shikhar.hulcd.com",
        "expirationDate": 1781176802.539941,
        "hostOnly": true,
        "httpOnly": false,
        "name": "lang_id",
        "path": "/",
        "sameSite": "strict",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "0"
    },
    {
        "domain": ".shikhar.hulcd.com",
        "expirationDate": 1781176800.60003,
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
        "domain": "shikhar.hulcd.com",
        "expirationDate": 1781176802.540209,
        "hostOnly": true,
        "httpOnly": false,
        "name": "lang",
        "path": "/",
        "sameSite": "strict",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "en"
    }
];

const HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "hulid": "HUL-102938P359",
    "ispwa": "1",
    "languagetype": "0",
    "pragma": "no-cache",
    "versioncode": "121",
    "viewall": "1"
};

async function init() {
    await fs.ensureDir(BRANDS_DIR);
    await fs.ensureDir(CACHE_DIR);
}

/**
 * Tries to extract a valid accesstoken from the live browser session cookies.
 * If the live 'data' cookie exists and has a valid token, updates HEADERS and returns true.
 * Otherwise, sets hardcoded COOKIES on the page and returns false.
 */
async function resolveSessionCookies(page) {
    const liveCookies = await page.cookies();
    const liveDataCookie = liveCookies.find(c => c.name === 'data');

    if (liveDataCookie) {
        try {
            const urlDecoded = decodeURIComponent(liveDataCookie.value);
            const jsonData = JSON.parse(Buffer.from(urlDecoded, 'base64').toString('utf8'));
            const token = jsonData?.retailer?.accesstoken;
            const hulid = jsonData?.retailer?.parcodehul;

            if (token) {
                console.log(`[Session] ✅ Live session found! Retailer: ${jsonData?.retailer?.name || 'unknown'}`);
                console.log(`[Session]    Token: ${token.substring(0, 20)}...`);
                HEADERS['accesstoken'] = token;
                if (hulid) HEADERS['hulid'] = hulid;
                return true; // Using live session
            }
        } catch (e) {
            console.warn('[Session] ⚠ Could not decode live data cookie:', e.message);
        }
    }

    // Live session is missing or expired → fall back to hardcoded COOKIES
    console.log('[Session] ⚠ No valid live session found. Falling back to hardcoded cookies...');
    const cleanCookies = COOKIES.map(c => {
        const cookie = { ...c };
        if (cookie.expirationDate) {
            cookie.expires = cookie.expirationDate;
            delete cookie.expirationDate;
        }
        if (cookie.sameSite === null) delete cookie.sameSite;
        if (cookie.storeId !== undefined) delete cookie.storeId;
        if (cookie.hostOnly !== undefined) delete cookie.hostOnly;
        return cookie;
    });
    await page.setCookie(...cleanCookies);

    // Also extract accesstoken from hardcoded data cookie
    const hardcodedDataCookie = COOKIES.find(c => c.name === 'data');
    if (hardcodedDataCookie) {
        try {
            const urlDecoded = decodeURIComponent(hardcodedDataCookie.value);
            const jsonData = JSON.parse(Buffer.from(urlDecoded, 'base64').toString('utf8'));
            const token = jsonData?.retailer?.accesstoken;
            const hulid = jsonData?.retailer?.parcodehul;
            if (token) {
                HEADERS['accesstoken'] = token;
                if (hulid) HEADERS['hulid'] = hulid;
                console.log('[Session]    Hardcoded token applied.');
            }
        } catch (e) {
            console.warn('[Session] ⚠ Could not decode hardcoded data cookie:', e.message);
        }
    }

    return false; // Using hardcoded fallback
}

async function fetchWithPuppeteer(page, cacheKey, url, headers = {}) {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);

    if (await fs.exists(cachePath)) {
        console.log(`[Cache Hit] ${cacheKey}`);
        return await fs.readJson(cachePath);
    } // commentout this if forced to retry

    console.log(`[Fetching] ${url} (Key: ${cacheKey})`);

    // We execute the fetch inside the browser context
    // and return the result back to Node.js
    const result = await page.evaluate(async (url, headers, baseHeaders) => {
        try {
            const finalHeaders = { ...baseHeaders, ...headers };
            // Retrieve accesstoken from local storage/cookies if needed, 
            // but cookies should handle it if the site uses cookie-based auth.
            // However, the original request had an 'accesstoken' header.
            // We might need to extract it from the 'data' cookie or similar if it's dynamic.
            // For now, let's try just headers provided + cookies.

            // Note: If the site rejects it, we might need to grab the token from localStorage or cookie.
            // The 'data' cookie seems to have an 'accesstoken' field inside it (it's base64 encoded JSON).

            const response = await fetch(url, {
                method: 'GET',
                headers: finalHeaders
            });

            if (!response.ok) {
                return { error: true, status: response.status, statusText: response.statusText, text: await response.text() };
            }
            return await response.json();
        } catch (e) {
            return { error: true, message: e.toString() };
        }
    }, url, headers, HEADERS);

    if (result.error) {
        throw new Error(`Browser fetch failed: ${JSON.stringify(result)}`);
    }

    await fs.writeJson(cachePath, result, { spaces: 2 });
    return result;
}

async function getAllBrands(page) {
    // accesstoken is already set in HEADERS by resolveSessionCookies() called in main()

    try {
        const data = await fetchWithPuppeteer(page, 'brands_list', `${BASE_URL}/brands`);
        if (data.brands_list && data.brands_list.length > 0) {
            return data.brands_list;
        }
    } catch (e) {
        console.warn("API fetch for brands failed, falling back to docs.md...", e.message);
    }

    // Fallback to docs.md
    try {
        const docsPath = path.join(__dirname, 'docs.md');
        if (await fs.exists(docsPath)) {
            const content = await fs.readFile(docsPath, 'utf8');
            // Extract the JSON object. It starts with { and contains "brands_list"
            const match = content.match(/{\s*"messagecode"[\s\S]*?"brands_list":\s*(\[\s*\{[\s\S]*?\}\s*\])\s*\}/);
            if (match && match[1]) {
                // We need the whole object or just the list? The function returns list.
                // let's parse the whole object found in match[0]
                const jsonStr = match[0];
                const parsed = JSON.parse(jsonStr);
                console.log(`Loaded ${parsed.brands_list.length} brands from docs.md`);
                return parsed.brands_list;
            } else {
                // Try simpler regex just for the array
                const arrayMatch = content.match(/"brands_list":\s*(\[\s*\{[\s\S]*?\}\s*\])/);
                if (arrayMatch && arrayMatch[1]) {
                    const list = JSON.parse(arrayMatch[1]);
                    console.log(`Loaded ${list.length} brands from docs.md (array only)`);
                    return list;
                }
            }
        }
    } catch (e) {
        console.error("Failed to load brands from docs.md:", e.message);
    }

    return [];
}

async function getProductsForBrand(page, brand) {
    const brandId = brand.brand_id;
    const brandName = brand.brand_desc;
    const finalFilePath = path.join(BRANDS_DIR, `${brandId}.json`);

    if (await fs.exists(finalFilePath)) {
        console.log(`[Completed] ${brandName} (${brandId}) already scraped.`);
        return await fs.readJson(finalFilePath);
    }

    let allProducts = [];
    let start = 0;
    let hasMore = true;

    while (hasMore) {
        const cacheKey = `brand_${brandId}_page_${start}`;
        let data;
        try {
            // Updated headers for pagination as per products_fetch.md, 
            // brandid and start are headers now? Or params? 
            // The docs.md showed them as headers in example 2 (products_fetch.md lines 3-28).
            // Line 8: "brandid": "B_015"
            // Line 23: "start": "0"
            // So we pass them as headers.

            data = await fetchWithPuppeteer(page, cacheKey, `${BASE_URL}/brands_products_new`, {
                "brandid": brandId,
                "start": start.toString(),
                "outoffstockbasepacks": ""
            });
        } catch (err) {
            console.error(`Stopping pagination for ${brandName} due to error: ${err.message}`);
            break;
        }

        if (data.messagecode !== 200 || !data.productgroup) {
            console.warn(`Unexpected response for brand ${brandId} at start ${start}`);
            hasMore = false;
            break;
        }

        const productsInPage = data.productgroup.flatMap(group => group.products || []);
        allProducts.push(...productsInPage);

        console.log(`Scraped ${productsInPage.length} products for ${brandName} (Total: ${allProducts.length})`);

        const nextStart = data.start; // The API returns the next start index
        // If nextStart is provided (and different from current), use it.
        // Also check if products were actually returned to avoid infinite loops if 'start' doesn't increment but returns same data?
        // Usually 'start' increments.

        if (nextStart !== undefined && nextStart > start && productsInPage.length > 0) {
            start = nextStart;
        } else {
            hasMore = false;
        }
    }

    const brandResult = {
        brand_id: brandId,
        brand_desc: brandName,
        products: allProducts,
        scraped_at: new Date().toISOString()
    };

    if (allProducts.length > 0) {
        await fs.writeJson(finalFilePath, brandResult, { spaces: 2 });
        console.log(`[Saved] ${brandName} products to ${finalFilePath}`);
    } else {
        console.warn(`[Empty] No products found for ${brandName}`);
        // Save empty result too so we don't retry forever?
        await fs.writeJson(finalFilePath, brandResult, { spaces: 2 });
    }
    return brandResult;
}

async function main() {
    try {
        await init();

        console.log('Launching browser...');
        const browser = await puppeteer.launch({
            headless: "new",
            userDataDir: path.join(__dirname, '../temp'),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-automation'],
            ignoreDefaultArgs: ["--enable-automation"]
        });
        const page = await browser.newPage();

        // Cookies should be persisted in userDataDir, so we might not need to set them manually
        // if the user has logged in via manual_login.js. 
        // We will fallback to using the hardcoded cookies ONLY if not already logged in? 
        // For now, let's rely on the persisted session and NOT overwrite cookies blindly which might logout the user.
        // console.log('Setting cookies...');
        // await page.setCookie(...cleanCookies);

        console.log('Navigating to base domain...');
        // We need to be on the allowed domain context to make requests with cookies
        await page.goto('https://shikhar.hulcd.com/', { waitUntil: 'domcontentloaded' });

        // Resolve session: use live cookies if valid, else fall back to hardcoded COOKIES
        const usingLiveSession = await resolveSessionCookies(page);
        if (!usingLiveSession) {
            // Reload the page so the newly set hardcoded cookies are active
            await page.goto('https://shikhar.hulcd.com/', { waitUntil: 'domcontentloaded' });
        }

        console.log('Fetching brands list...');
        const brands = await getAllBrands(page);
        console.log(`Found ${brands.length} brands.`);

        const allBrandsData = [];

        for (const brand of brands) {
            console.log(`\nProcessing brand: ${brand.brand_desc} (${brand.brand_id})...`);
            try {
                const brandData = await getProductsForBrand(page, brand);
                if (brandData.products.length > 0) {
                    allBrandsData.push(brandData);
                }
            } catch (err) {
                console.error(`Failed to scrape brand ${brand.brand_id}:`, err.message);
            }
        }

        console.log('\nCreating combined all.json...');
        const combined = {
            total_brands: allBrandsData.length,
            total_products: allBrandsData.reduce((sum, b) => sum + b.products.length, 0),
            brands: allBrandsData,
            scraped_at: new Date().toISOString()
        };

        await fs.writeJson(path.join(__dirname, 'public', 'all.json'), combined, { spaces: 2 });
        console.log(`[Success] Scraped all products and saved to public/all.json`);

        await browser.close();

    } catch (error) {
        console.error('Global Error:', error);
        // Ensure browser closes if it exists? 
        // We'll let the script exit.
    }
}

main();
