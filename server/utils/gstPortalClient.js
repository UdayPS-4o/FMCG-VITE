// Shared plumbing for the GST portal (CharteredInfo GSP) integrations:
// data folders, saved auth token, HTTP calls and the EVC signature.
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { readGstCredentials } = require('./gstCredentials');

const GSP_BASE = 'https://gstapi.charteredinfo.com';
const TOKEN_FILE = 'GST_TOKEN.json';

// ---- folders ---------------------------------------------------------------
// Downloaded portal JSON (GSTR1/<MMYYYY>/, GSTR2B/<MMYYYY>/, gstr3b/) and the saved token live in
// GST_DATA_DIR - by default the folder that holds the FY data folders (e.g. ...\fmcg), which is
// also where the legacy VFP programs keep them, so existing downloads are picked up.
function dataDir() {
  if (process.env.GST_DATA_DIR) return process.env.GST_DATA_DIR;
  const dbf = process.env.DBF_FOLDER_PATH;
  if (!dbf) throw new Error('DBF_FOLDER_PATH (or GST_DATA_DIR) environment variable not set.');
  return path.dirname(path.resolve(dbf));
}
// System-side CSV exports (B2B.CSV, b2cs.csv, cdnr.csv, DOC.CSV, hsn(b2b).csv, hsn(b2c).csv, GSTR-3.csv)
function csvDir() {
  return process.env.GST_CSV_DIR || dataDir();
}

// case-insensitive file lookup so B2B.CSV / b2b.csv both work
async function findFile(dir, name) {
  try {
    const files = await fs.readdir(dir);
    const hit = files.find((f) => f.toLowerCase() === name.toLowerCase());
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

const validPeriod = (p) => /^(0[1-9]|1[0-2])20\d\d$/.test(String(p || ''));

// ---- token -----------------------------------------------------------------
const ddmmyyyy = (d = new Date()) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

async function readToken() {
  try {
    const raw = await fs.readFile(path.join(dataDir(), TOKEN_FILE), 'utf8');
    const j = JSON.parse(raw);
    return j && j.auth_token ? { token: j.auth_token, savedDate: j.saved_date || '', savedAt: j.saved_at || '', gstin: j.gstin || '', username: j.username || '' } : null;
  } catch {
    return null;
  }
}
async function saveToken(token, gstin, username) {
  const body = { auth_token: token, saved_date: ddmmyyyy(), saved_at: new Date().toISOString(), gstin, username };
  await fs.writeFile(path.join(dataDir(), TOKEN_FILE), JSON.stringify(body, null, 2));
}
async function clearToken() {
  try { await fs.unlink(path.join(dataDir(), TOKEN_FILE)); } catch { /* none saved */ }
}

// ---- credentials / context --------------------------------------------------
async function getContext({ needToken = true } = {}) {
  const creds = await readGstCredentials();
  if (!creds.gstin || !creds.username || !creds.aspid) {
    const err = new Error('GST credentials (GSTIN / username / ASP id) are missing in sv.vcc.');
    err.status = 500;
    throw err;
  }
  const ctx = { gstin: creds.gstin, username: creds.username, aspid: creds.aspid, password: creds.password, token: '' };
  if (needToken) {
    const t = await readToken();
    if (!t) {
      const err = new Error('No saved GST auth token. Authenticate with an OTP first.');
      err.status = 401;
      err.needAuth = true;
      throw err;
    }
    ctx.token = t.token;
  }
  return ctx;
}

// ---- HTTP -------------------------------------------------------------------
const q = (v) => encodeURIComponent(v == null ? '' : String(v));
const qs = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${q(v)}`).join('&');

// Returns the raw response text. Never throws - transport failures come back as a GSP-style error JSON.
async function gspRequest({ method = 'GET', url, headers = {}, body, timeout = 120000 }) {
  try {
    const res = await axios({
      method,
      url,
      headers: { 'Content-Type': 'application/json', ...headers },
      data: body === undefined || body === '' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      timeout,
      validateStatus: () => true,
      transformResponse: [(d) => d],
    });
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  } catch (e) {
    return JSON.stringify({ status_cd: '0', error: { error_cd: 'NETWORK', message: e.message } });
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// A GSP / GSTN error envelope: {status_cd:"0", error:{error_cd, message}} or {error:"..."}
function errorOf(json, text) {
  if (!json) return text && text.trim() ? `Unreadable response: ${String(text).slice(0, 300)}` : 'Empty response from the GST API.';
  const hasErr = json.status_cd === '0' || json.error || json.error_cd;
  if (!hasErr) return '';
  const e = json.error;
  if (e && typeof e === 'object') return `${e.error_cd ? `[${e.error_cd}] ` : ''}${e.message || e.error_msg || JSON.stringify(e)}`.trim();
  if (typeof e === 'string') return e;
  return json.message || json.error_msg || JSON.stringify(json).slice(0, 300);
}

// Same heuristic as the VFP tools: error + "token" in the response means the saved token has expired.
function isTokenError(text) {
  const t = String(text || '').toLowerCase();
  // AUTH4037 = API access not enabled / API user validity shorter than the token: an account problem, not an expired token
  if (t.includes('auth4037')) return false;
  return ((t.includes('error') || t.includes('invalid')) && t.includes('token')) || t.includes('gsp101') || t.includes('auth-token')
    // session expired / not valid for data APIs: AUTH158 "Invalid Auth token", RET2B1010 "API Authorization Failed"
    || t.includes('auth158') || t.includes('ret2b1010') || t.includes('authorization failed');
}

// Wraps a portal response for the browser: { ok, message, tokenExpired, data, raw }
async function packResponse(text, { dropTokenOnExpiry = true } = {}) {
  const json = parseJson(text);
  const message = errorOf(json, text);
  const tokenExpired = !!message && isTokenError(text);
  if (tokenExpired && dropTokenOnExpiry) await clearToken();
  return { ok: !message, message, tokenExpired, data: json, raw: json ? undefined : text };
}

// ---- auth -------------------------------------------------------------------
async function requestOtp(ctx) {
  const url = `${GSP_BASE}/taxpayerapi/dec/v1.0/authenticate?${qs({ action: 'OTPREQUEST', gstin: ctx.gstin, username: ctx.username, aspid: ctx.aspid, password: ctx.password })}`;
  return gspRequest({ url, headers: { aspid: ctx.aspid, password: ctx.password }, timeout: 30000 });
}
async function requestAuthToken(ctx, otp) {
  const url = `${GSP_BASE}/taxpayerapi/dec/v1.0/authenticate?${qs({ action: 'AUTHTOKEN', gstin: ctx.gstin, username: ctx.username, OTP: otp, aspid: ctx.aspid, password: ctx.password })}`;
  return gspRequest({ url, headers: { aspid: ctx.aspid, password: ctx.password }, timeout: 30000 });
}
async function requestEvcOtp(ctx, pan, formType) {
  const url = `${GSP_BASE}/taxpayerapi/dec/v1.0/authenticate?${qs({ action: 'EVCOTP', gstin: ctx.gstin, username: ctx.username, aspid: ctx.aspid, password: ctx.password, pan, form_type: formType, authtoken: ctx.token })}`;
  return gspRequest({ url, headers: { password: ctx.password }, timeout: 30000 });
}

// ---- EVC signature ----------------------------------------------------------
// Port of gst_hmac.ps1: HMAC-SHA256( key = "PAN|OTP", data = base64(payload) ), base64 + URL-escaped.
function evcSignature(pan, otp, payloadText) {
  const b64Payload = Buffer.from(payloadText, 'utf8').toString('base64');
  const sig = crypto.createHmac('sha256', Buffer.from(`${pan}|${otp}`, 'utf8')).update(Buffer.from(b64Payload, 'utf8')).digest('base64');
  return encodeURIComponent(sig);
}
const stripWhitespaceChars = (s) => String(s).replace(/[\r\n\t]/g, '');

// ---- local JSON store ---------------------------------------------------------
async function readJsonIfExists(file) {
  try { return await fs.readFile(file, 'utf8'); } catch { return null; }
}
function ensureDir(dir) {
  fsSync.mkdirSync(dir, { recursive: true });
}

module.exports = {
  GSP_BASE, dataDir, csvDir, findFile, validPeriod,
  readToken, saveToken, clearToken, getContext,
  q, qs, gspRequest, parseJson, errorOf, isTokenError, packResponse,
  requestOtp, requestAuthToken, requestEvcOtp,
  evcSignature, stripWhitespaceChars, readJsonIfExists, ensureDir,
};
