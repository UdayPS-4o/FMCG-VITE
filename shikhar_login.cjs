/**
 * shikhar_login.cjs
 *
 * Opens a VISIBLE browser window so you can manually log into shikhar.hulcd.com.
 * After login is detected, it extracts all cookies and saves them to shikhar_cookies.json.
 *
 * Run manually:  node shikhar_login.cjs
 * OR triggered via the web app's "Refresh Login" button → POST /api/schemes/login
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

const COOKIES_OUTPUT_PATH = path.join(__dirname, 'shikhar_cookies.json');
const SHIKHAR_URL = 'https://shikhar.hulcd.com/';
const SESSION_DIR = path.join(__dirname, '../temp');

// How long to wait for the user to complete login (5 minutes)
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Checks if the page looks like the logged-in home screen.
 * We detect login by checking if the 'data' cookie exists and has an accesstoken.
 */
async function isLoggedIn(page) {
    try {
        const cookies = await page.cookies();
        const dataCookie = cookies.find(c => c.name === 'data');
        if (!dataCookie) return false;

        const urlDecoded = decodeURIComponent(dataCookie.value);
        const jsonData = JSON.parse(Buffer.from(urlDecoded, 'base64').toString('utf8'));
        return !!(jsonData?.retailer?.accesstoken);
    } catch {
        return false;
    }
}

async function main() {
    console.log('====================================================');
    console.log('  Shikhar Login Cookie Extractor');
    console.log('====================================================');
    console.log('Launching visible browser...');
    console.log('Please log in to Shikhar when the browser opens.');
    console.log(`You have ${LOGIN_TIMEOUT_MS / 60000} minutes to complete login.`);
    console.log('');

    await fs.ensureDir(SESSION_DIR);

    const browser = await puppeteer.launch({
        headless: false, // VISIBLE browser so the user can log in
        userDataDir: SESSION_DIR,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-automation',
            '--window-size=420,900', // mobile-like window for Shikhar's mobile web UI
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: { width: 420, height: 900 },
    });

    const page = await browser.newPage();

    // Emulate a mobile device so Shikhar loads correctly
    await page.setUserAgent(
        'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );

    console.log(`Navigating to ${SHIKHAR_URL} ...`);
    await page.goto(SHIKHAR_URL, { waitUntil: 'domcontentloaded' });

    // Check if we're already logged in from a saved session
    if (await isLoggedIn(page)) {
        console.log('✅ Already logged in from saved session! Extracting cookies...');
        await saveCookies(page);
        await browser.close();
        return;
    }

    console.log('⏳ Waiting for you to log in... (browser is open)');

    // Poll every 3 seconds to check if login completed
    const startTime = Date.now();
    let loggedIn = false;

    while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 3000)); // wait 3 seconds

        loggedIn = await isLoggedIn(page);
        if (loggedIn) break;

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r⏳ Waiting for login... ${elapsed}s elapsed`);
    }

    if (!loggedIn) {
        console.error('\n❌ Login timeout! Please try again.');
        await browser.close();
        process.exit(1);
    }

    console.log('\n✅ Login detected! Extracting cookies...');
    await saveCookies(page);
    await browser.close();

    console.log('');
    console.log('====================================================');
    console.log('✅ Done! You can now run the scraper.');
    console.log(`   Cookies saved to: ${COOKIES_OUTPUT_PATH}`);
    console.log('====================================================');
}

async function saveCookies(page) {
    const cookies = await page.cookies();

    if (!cookies || cookies.length === 0) {
        console.error('❌ No cookies found on page!');
        return;
    }

    // Also extract accesstoken and header info from the data cookie
    const dataCookie = cookies.find(c => c.name === 'data');
    let extractedInfo = {};

    if (dataCookie) {
        try {
            const urlDecoded = decodeURIComponent(dataCookie.value);
            const jsonData = JSON.parse(Buffer.from(urlDecoded, 'base64').toString('utf8'));
            const retailer = jsonData.retailer || {};
            extractedInfo = {
                accesstoken: retailer.accesstoken || '',
                hulid: retailer.parcodehul || '',
                retailer_name: retailer.name || '',
                retailer_code: retailer.rscode || '',
                expires_approx: dataCookie.expires
                    ? new Date(dataCookie.expires * 1000).toISOString()
                    : 'unknown',
            };
            console.log(`   Retailer: ${extractedInfo.retailer_name} (${extractedInfo.retailer_code})`);
            console.log(`   HUL ID:   ${extractedInfo.hulid}`);
            console.log(`   Token:    ${extractedInfo.accesstoken.substring(0, 20)}...`);
            console.log(`   Expires:  ${extractedInfo.expires_approx}`);
        } catch (e) {
            console.warn('   ⚠ Could not decode data cookie:', e.message);
        }
    }

    const output = {
        extracted_at: new Date().toISOString(),
        info: extractedInfo,
        cookies: cookies,
    };

    await fs.writeJson(COOKIES_OUTPUT_PATH, output, { spaces: 2 });
    console.log(`   Saved ${cookies.length} cookies to ${COOKIES_OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
