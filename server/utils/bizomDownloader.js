// Bizom report auto-download for the Godrej purchase import.
//   1. Log in to reports.bizom.in (username/password + OTP read from Yahoo mail over IMAP)
//   2. Report 11721 (Primary Sale and Grn Status): all states, last 7 days -> GODPUR.CSV
//   3. Report 5497 (Price Check Report)                                    -> GPRICE.CSV
//
// Required in server/.env:
//   BIZOM_USERNAME, BIZOM_PASSWORD
//   YAHOO_EMAIL, YAHOO_APP_PASSWORD   (Yahoo "app password", not the normal login password)
// Optional:
//   BIZOM_PURCHASE_REPORT_ID=11721, BIZOM_PRICE_REPORT_ID=5497, BIZOM_HEADLESS=true
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const puppeteer = require('puppeteer');

const BASE = 'https://reports.bizom.in';
const PROFILE_DIR = path.join(__dirname, '..', '.bizom-profile');
const DEBUG_DIR = path.join(__dirname, '..', 'db', 'bizom-debug');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let state = { running: false, startedAt: null, finishedAt: null, ok: null, error: null, log: [], files: {} };

function log(msg) {
  const line = `${new Date().toLocaleTimeString('en-IN', { hour12: false })}  ${msg}`;
  console.log('[bizom]', msg);
  state.log.push(line);
  if (state.log.length > 300) state.log.shift();
}

const getStatus = () => ({ ...state, log: [...state.log] });

function chromePath() {
  const candidates = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config.json'), 'utf8'));
    if (cfg.chromePath) candidates.push(cfg.chromePath);
  } catch { /* no config */ }
  candidates.push(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  );
  return candidates.find((p) => p && fs.existsSync(p));
}

// ---------------------------------------------------------------- OTP (Yahoo IMAP)
async function fetchOtpFromYahoo(sinceMs, timeoutMs = 150000) {
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const user = process.env.YAHOO_EMAIL;
  const pass = process.env.YAHOO_APP_PASSWORD;
  if (!user || !pass) throw new Error('YAHOO_EMAIL / YAHOO_APP_PASSWORD missing in server/.env');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const client = new ImapFlow({ host: 'imap.mail.yahoo.com', port: 993, secure: true, auth: { user, pass }, logger: false });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        // Yahoo's IMAP FROM search does not match partial addresses, so scan the newest mails instead
        const total = client.mailbox.exists || 0;
        const candidates = [];
        if (total > 0) {
          for await (const m of client.fetch(`${Math.max(1, total - 20)}:*`, { envelope: true, internalDate: true })) {
            const from = (m.envelope?.from || []).map((f) => f.address || '').join(' ');
            if (/bizom/i.test(from) && new Date(m.internalDate).getTime() >= sinceMs - 30000) candidates.push(m.uid);
          }
        }
        for (const uid of candidates.reverse()) {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg) continue;
          const mail = await simpleParser(msg.source);
          const text = `${mail.subject || ''} ${mail.text || ''} ${mail.html || ''}`;
          const m = text.match(/OTP\)?\s*(?:is|:)?\s*(\d{4,8})/i) || text.match(/\b(\d{6})\b/);
          if (m) return m[1];
        }
      } finally {
        lock.release();
      }
    } catch (e) {
      if (/auth/i.test(e.message || '') || e.authenticationFailed) {
        throw new Error('Yahoo IMAP login failed — check YAHOO_EMAIL / YAHOO_APP_PASSWORD');
      }
      log(`IMAP: ${e.message}`);
    } finally {
      await client.logout().catch(() => {});
    }
    await sleep(5000);
  }
  throw new Error('OTP mail from Bizom not received within time');
}

// ---------------------------------------------------------------- Bizom pages
async function screenshot(page, name) {
  try {
    await fsp.mkdir(DEBUG_DIR, { recursive: true });
    const file = path.join(DEBUG_DIR, `${Date.now()}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    log(`Screenshot saved: ${file}`);
  } catch { /* ignore */ }
}

const onLoginPage = (page) => /\/users\/login/i.test(page.url());

async function login(page) {
  const username = process.env.BIZOM_USERNAME;
  const password = process.env.BIZOM_PASSWORD;
  if (!username || !password) throw new Error('BIZOM_USERNAME / BIZOM_PASSWORD missing in server/.env');

  log('Logging in to Bizom…');
  await page.waitForSelector('#username', { visible: true, timeout: 30000 });
  await page.$eval('#username', (el) => { el.value = ''; });
  await page.type('#username', username);
  await page.$eval('#password', (el) => { el.value = ''; });
  await page.type('#password', password);
  await sleep(5500); // the page locks the button for 5s after a previous attempt
  const otpRequestedAt = Date.now();
  await page.click('#login');

  // Either the OTP box appears or (no MFA) the page redirects
  await page.waitForFunction(
    () => document.getElementById('otp')?.type === 'text' || !/\/users\/login/.test(location.pathname) ||
      (document.getElementById('message')?.innerText || '').trim().length > 0,
    { timeout: 30000 },
  );
  if (!onLoginPage(page)) return;
  const otpVisible = await page.$eval('#otp', (el) => el.type === 'text');
  if (!otpVisible) {
    const msg = await page.$eval('#message', (el) => el.innerText).catch(() => '');
    throw new Error(`Bizom login failed: ${msg || 'unknown error'}`);
  }

  log('OTP sent — reading it from Yahoo mail…');
  const otp = await fetchOtpFromYahoo(otpRequestedAt);
  log('OTP received, submitting');
  await page.type('#otp', otp);
  // the page disables #login for 5s after each click; a click while disabled is silently ignored
  for (let attempt = 1; attempt <= 3 && onLoginPage(page); attempt++) {
    await page.waitForFunction(() => !document.getElementById('login')?.disabled, { timeout: 15000 }).catch(() => {});
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('#login'),
    ]);
    const msg = onLoginPage(page) ? await page.$eval('#message', (el) => el.innerText).catch(() => '') : '';
    if (/invalid|incorrect|expired|wrong/i.test(msg)) break;
  }
  if (onLoginPage(page)) {
    const msg = await page.$eval('#message', (el) => el.innerText).catch(() => '');
    throw new Error(`OTP rejected by Bizom: ${msg || 'still on login page'}`);
  }
  log('Logged in');
}

async function openReport(page, reportId) {
  const url = `${BASE}/reports/view/${reportId}`;
  log(`Opening report ${reportId}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  if (onLoginPage(page)) {
    await login(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  }
  if (onLoginPage(page)) throw new Error('Could not open report — still on login page');
  await page.waitForFunction(() => [...document.querySelectorAll('button,a')].some((b) => b.innerText.trim() === 'Update'), { timeout: 60000 });
  await sleep(1500);
}

// "Select States" multiselect -> tick "Select all"
async function selectAllStates(page) {
  const result = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label,div,span,h5,p')].find((el) => el.children.length === 0 && el.innerText.trim() === 'Select States');
    if (!label) return 'no-label';
    let container = label.parentElement;
    for (let i = 0; i < 4 && container && !container.querySelector('.multiselect-container, ul.dropdown-menu'); i++) container = container.parentElement;
    if (!container) return 'no-container';
    const btn = container.querySelector('button.multiselect, button.dropdown-toggle, button');
    btn?.click();
    const opts = [...container.querySelectorAll('.multiselect-container li, ul.dropdown-menu li')];
    const all = opts.find((li) => /select all/i.test(li.innerText));
    if (!all) return 'no-select-all';
    const cb = all.querySelector('input[type=checkbox]');
    if (cb && !cb.checked) (all.querySelector('label') || cb).click();
    return 'ok:' + (container.querySelector('button')?.innerText || '').trim();
  });
  log(`Select states: ${result}`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(5, 300).catch(() => {});
  await sleep(2500); // warehouses list reloads after state change
  if (!String(result).startsWith('ok')) throw new Error(`Could not select all states (${result})`);
}

// Date range picker (#reportrange0, a jQuery daterangepicker) -> "Last 7 Days"
async function selectLast7Days(page) {
  await page.click('#reportrange0');
  await sleep(800);
  const picked = await page.evaluate(() => {
    const li = [...document.querySelectorAll('.daterangepicker .ranges li[data-range-key="Last 7 Days"]')].find((l) => l.offsetParent);
    if (!li) return false;
    li.click();
    return true;
  });
  await sleep(800);
  const label = await page.$eval('#reportrange0', (el) => el.innerText.trim()).catch(() => '');
  log(`Date range: ${label}`);
  const m = label.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (!picked || !m || m[1] === m[2]) throw new Error(`Could not set date range to Last 7 Days (${label || 'no label'})`);
}

// Update -> wait until the report has loaded (the page re-enables #reportsUpdateButton)
async function clickUpdateAndWait(page) {
  log('Clicking Update…');
  await page.waitForFunction(() => !document.getElementById('reportsUpdateButton')?.disabled, { timeout: 60000 });
  await page.click('#reportsUpdateButton');
  await page.waitForFunction(() => document.getElementById('reportsUpdateButton')?.disabled, { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('reportsUpdateButton')?.disabled, { timeout: 300000, polling: 1000 });
  await sleep(1500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].filter((tr) => tr.innerText.trim()).length);
  log(`Report loaded (${rows} rows on screen)`);
}

const cookieHeader = async (page) => (await page.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');

// Download = Bizom generates the file on its side, then exposes it at /reportdownloads/index/<hash>
async function downloadReportFile(page, reportId) {
  log('Requesting download…');
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const respPromise = page.waitForResponse((r) => r.url().includes(`/reports/emailReport/${reportId}`), { timeout: 120000 });
  const started = await page.evaluate(() => {
    if (typeof window.downloadReport !== 'function') return 'no-fn';
    const r = window.downloadReport(4);
    return r === false ? 'sent' : String(r);
  });
  let resp;
  try {
    resp = await respPromise;
  } catch {
    throw new Error(`Download request not sent (${started}) — Bizom may already be generating this report; try again in a few minutes`);
  }
  const body = await resp.json().catch(() => null);
  const id = body?.Data?.id;
  const hash = body?.Data?.filenamehash;
  if (!id || !hash) throw new Error(`Unexpected download response: ${JSON.stringify(body).slice(0, 200)}`);
  log('Bizom is generating the file…');
  // stop the page's own polling/redirect; we fetch the file ourselves
  await page.goto('about:blank').catch(() => {});

  const cookie = await cookieHeader(page);
  const headers = { Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': await page.browser().userAgent() };
  const deadline = Date.now() + 10 * 60000;
  while (Date.now() < deadline) {
    await sleep(6000);
    const r = await fetch(`${BASE}/reportdownloads/fetchs3URL/${id}/${hash}`, { headers });
    const j = await r.json().catch(() => null);
    if (j?.result === true && j?.data?.s3URL) break;
  }
  if (Date.now() >= deadline) throw new Error('Bizom did not finish generating the file in 10 minutes');

  const fileResp = await fetch(`${BASE}/reportdownloads/index/${hash}`, { headers: { Cookie: cookie, 'User-Agent': headers['User-Agent'] }, redirect: 'follow' });
  if (!fileResp.ok) throw new Error(`File download failed: HTTP ${fileResp.status}`);
  const buf = Buffer.from(await fileResp.arrayBuffer());
  const name = decodeURIComponent((fileResp.headers.get('content-disposition') || '').match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || new URL(fileResp.url).pathname.split('/').pop() || 'report');
  log(`Downloaded ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
  return { buf, name };
}

// Save the downloaded file as <outDir>/<targetName> (unzips / converts xlsx when needed)
async function saveAs({ buf, name }, outDir, targetName) {
  const target = path.join(outDir, targetName);
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // "PK": zip or xlsx
  if (isZip && /\.xlsx?$/i.test(name)) {
    const xlsx = require('node-xlsx');
    const [sheet] = xlsx.parse(buf);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    await fsp.writeFile(target, sheet.data.map((r) => r.map(esc).join(',')).join('\r\n'), 'utf8');
  } else if (isZip) {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buf);
    const entry = Object.values(zip.files).find((f) => /\.csv$/i.test(f.name));
    if (!entry) throw new Error(`Zip ${name} has no CSV inside`);
    await fsp.writeFile(target, await entry.async('nodebuffer'));
  } else {
    if (/<html/i.test(buf.subarray(0, 500).toString())) throw new Error('Got an HTML page instead of the report file');
    await fsp.writeFile(target, buf);
  }
  log(`Saved ${target}`);
  return target;
}

async function run({ reports, headless, outDir }) {
  const launch = {
    headless: headless ?? String(process.env.BIZOM_HEADLESS || 'false') === 'true',
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1366, height: 800 },
    args: ['--no-sandbox', '--window-size=1366,850'],
  };
  const exe = chromePath();
  if (exe) launch.executablePath = exe;
  const browser = await puppeteer.launch(launch);
  let page;
  try {
    page = await browser.newPage();
    if (reports.includes('purchase')) {
      const id = process.env.BIZOM_PURCHASE_REPORT_ID || '11721';
      await openReport(page, id);
      await selectAllStates(page);
      await selectLast7Days(page);
      await clickUpdateAndWait(page);
      state.files.godpur = await saveAs(await downloadReportFile(page, id), outDir, 'GODPUR.CSV');
    }
    if (reports.includes('price')) {
      const id = process.env.BIZOM_PRICE_REPORT_ID || '5497';
      await openReport(page, id);
      await clickUpdateAndWait(page);
      state.files.gprice = await saveAs(await downloadReportFile(page, id), outDir, 'GPRICE.CSV');
    }
  } catch (e) {
    if (page && page.url() !== 'about:blank') await screenshot(page, 'error');
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}

// Runs the download and resolves with the saved file paths (rejects on failure).
// Used by startDownload (webapp) and by fmcgizom_download.js (BAT file).
function downloadReports(opts) {
  if (state.running) return Promise.reject(new Error('A download is already running'));
  state = { running: true, startedAt: new Date().toISOString(), finishedAt: null, ok: null, error: null, log: [], files: {} };
  log(`Starting Bizom download (${opts.reports.join(', ')})`);
  return run(opts)
    .then(() => {
      state.ok = true;
      log('Done');
      return state.files;
    })
    .catch((e) => {
      state.ok = false;
      state.error = e.message;
      log(`FAILED: ${e.message}`);
      throw e;
    })
    .finally(() => {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    });
}

function startDownload(opts) {
  if (state.running) return false;
  downloadReports(opts).catch(() => {}); // outcome is reported through getStatus()
  return true;
}

module.exports = { startDownload, downloadReports, getStatus, fetchOtpFromYahoo };
