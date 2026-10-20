// GST portal routes (mounted under /api/reports/gst):
//   GSTR-1 portal viewer + matching   (GSTR1_PORTAL_VIEWER.prg)
//   GSTR-2B portal viewer + matching  (GSTR2B_PORTAL_VIEWER.prg)
//   GSTR-1 JSON generation & filing   (GSTR1_PORTAL_UPLOAD.PRG)
//   GSTR-3B save / offset / filing    (GSTR3B_PORTAL_UPLOAD.PRG)
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const authMiddleware = require('../middleware');
const gsp = require('../../utils/gstPortalClient');
const data = require('../../utils/gstReturnData');
const build = require('../../utils/gstFilingBuilders');

const router = express.Router();

// /api/reports is registered before the global auth middleware, so authenticate here and allow admins only
// (these endpoints can save, submit and file returns on the GST portal).
router.use('/gst', authMiddleware, (req, res, next) => {
  if (!req.user || !Array.isArray(req.user.routeAccess) || !req.user.routeAccess.includes('Admin')) {
    return res.status(403).json({ message: 'Only admin users can use the GST portal tools.' });
  }
  next();
});

// wraps a handler: errors with .needAuth become 401 so the page can ask for an OTP
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(`[GST] ${req.method} ${req.path}:`, e.message);
    res.status(e.status || 500).json({ message: e.message, needAuth: !!e.needAuth });
  }
};

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });
const periodsOf = (body) => {
  const periods = Array.isArray(body.periods) ? [...new Set(body.periods.map(String))] : [];
  if (!periods.length || !periods.every(gsp.validPeriod)) throw badRequest('Select at least one valid return period (MMYYYY).');
  return periods;
};
const fpOf = (body) => {
  const fp = String(body.fp || '');
  if (!gsp.validPeriod(fp)) throw badRequest('Return period must be in MMYYYY format, e.g. 082026.');
  return fp;
};
const expired = (res, message) => res.status(401).json({ message: message || 'GST auth token expired or invalid. Authenticate again with an OTP.', needAuth: true, tokenExpired: true });

// ============================================================ auth / config
router.get('/gst/config', handle(async (req, res) => {
  const ctx = await gsp.getContext({ needToken: false });
  res.json({ gstin: ctx.gstin, username: ctx.username, dataDir: gsp.dataDir(), csvDir: gsp.csvDir() });
}));

router.get('/gst/auth/status', handle(async (req, res) => {
  const t = await gsp.readToken();
  res.json(t ? { hasToken: true, savedDate: t.savedDate, tokenPreview: `${t.token.slice(0, 8)}…` } : { hasToken: false });
}));

router.post('/gst/auth/otp', handle(async (req, res) => {
  const ctx = await gsp.getContext({ needToken: false });
  const text = await gsp.requestOtp(ctx);
  const r = await gsp.packResponse(text, { dropTokenOnExpiry: false });
  res.status(r.ok ? 200 : 502).json(r);
}));

router.post('/gst/auth/token', handle(async (req, res) => {
  const otp = String(req.body.otp || '').trim();
  if (!/^\d{4,8}$/.test(otp)) throw badRequest('Enter the OTP received on mobile / email.');
  const ctx = await gsp.getContext({ needToken: false });
  const text = await gsp.requestAuthToken(ctx, otp);
  const json = gsp.parseJson(text);
  const token = json && (json.auth_token || (json.data && json.data.auth_token));
  if (!token) {
    return res.status(502).json({ ok: false, message: gsp.errorOf(json, text) || 'Auth token not returned by the GST API.', data: json });
  }
  await gsp.saveToken(token, ctx.gstin, ctx.username);
  res.json({ ok: true, message: 'Authenticated. Token saved.' });
}));

router.delete('/gst/auth/token', handle(async (req, res) => {
  await gsp.clearToken();
  res.json({ ok: true });
}));

// which of the given periods already have downloaded JSON on disk
router.post('/gst/local-periods', handle(async (req, res) => {
  const periods = periodsOf(req.body);
  const has = req.body.type === 'gstr2b' ? data.hasLocalGstr2b : data.hasLocalGstr1;
  const local = [];
  for (const p of periods) if (await has(p)) local.push(p);
  res.json({ local });
}));

// ============================================================ GSTR-1 viewer
const GSTR1_ACTIONS = [
  ['b2b.json', 'B2B', { action_required: 'N' }],
  ['b2cs.json', 'B2CS', {}],
  ['cdnr.json', 'CDNR', { action_required: 'N' }],
  ['dociss.json', 'DOCISS', {}],
  ['hsn.json', 'HSNSUM', {}],
];
const gstr1GetUrl = (ctx, action, per, extra = {}) => `${gsp.GSP_BASE}/taxpayerapi/dec/v4.1/returns/gstr1?${gsp.qs({
  action, ...extra, aspid: ctx.aspid, username: ctx.username, gstin: ctx.gstin, ret_period: per, authtoken: ctx.token, password: ctx.password,
})}`;

// a token / network failure must not overwrite data that was downloaded earlier
const transientFailure = (text) => gsp.isTokenError(text) || /"NETWORK"/.test(text);

router.post('/gst/gstr1/fetch', handle(async (req, res) => {
  const periods = periodsOf(req.body);
  const useLocal = !!req.body.useLocal;
  const fetchWarnings = [];
  const toFetch = [];
  for (const p of periods) if (!(useLocal && (await data.hasLocalGstr1(p)))) toFetch.push(p);

  if (toFetch.length) {
    const ctx = await gsp.getContext();
    for (const per of toFetch) {
      const dir = data.gstr1Dir(per);
      gsp.ensureDir(dir);
      for (const [file, action, extra] of GSTR1_ACTIONS) {
        const text = await gsp.gspRequest({ url: gstr1GetUrl(ctx, action, per, extra) });
        if (gsp.isTokenError(text)) { await gsp.clearToken(); return expired(res); }
        if (transientFailure(text)) { fetchWarnings.push({ period: per, section: action, message: gsp.errorOf(gsp.parseJson(text), text) }); continue; }
        await fs.writeFile(path.join(dir, file), text);
      }
    }
  }
  const { rows, warnings } = await data.loadGstr1Local(periods);
  res.json({ rows, warnings: [...fetchWarnings, ...warnings], fetched: toFetch, fromDisk: periods.filter((p) => !toFetch.includes(p)) });
}));

router.post('/gst/gstr1/match', handle(async (req, res) => {
  const periods = periodsOf(req.body);
  const { rows, warnings } = await data.loadGstr1Local(periods);
  const { data: matched, notes } = await data.matchGstr1(rows, periods);
  res.json({ rows: matched, warnings, notes });
}));

// ============================================================ GSTR-2B viewer
router.post('/gst/gstr2b/fetch', handle(async (req, res) => {
  const periods = periodsOf(req.body);
  const useLocal = !!req.body.useLocal;
  const fetchWarnings = [];
  const toFetch = [];
  for (const p of periods) if (!(useLocal && (await data.hasLocalGstr2b(p)))) toFetch.push(p);

  if (toFetch.length) {
    const ctx = await gsp.getContext();
    for (const per of toFetch) {
      const dir = data.gstr2bDir(per);
      gsp.ensureDir(dir);
      const url = `${gsp.GSP_BASE}/taxpayerapi/dec/v4.2/returns/gstr2b?${gsp.qs({
        aspid: ctx.aspid, username: ctx.username, gstin: ctx.gstin, ret_period: per, authtoken: ctx.token, password: ctx.password,
        action: 'GET2B', typ: '', file_num: 1, rtnprd: per,
      })}`;
      const text = await gsp.gspRequest({ url });
      if (gsp.isTokenError(text)) { await gsp.clearToken(); return expired(res); }
      if (transientFailure(text)) { fetchWarnings.push({ period: per, section: 'GSTR-2B', message: gsp.errorOf(gsp.parseJson(text), text) }); continue; }
      await fs.writeFile(path.join(dir, 'gstr2b.json'), text);
    }
  }
  const { rows, warnings } = await data.loadGstr2bLocal(periods);
  res.json({ rows, warnings: [...fetchWarnings, ...warnings], fetched: toFetch, fromDisk: periods.filter((p) => !toFetch.includes(p)) });
}));

router.post('/gst/gstr2b/match', handle(async (req, res) => {
  const periods = periodsOf(req.body);
  const { rows, warnings } = await data.loadGstr2bLocal(periods);
  const { data: matched, notes } = await data.matchGstr2b(rows, periods);
  res.json({ rows: matched, warnings, notes });
}));

// ============================================================ GSTR-1 upload / filing
const gstr1Headers = (ctx, fp) => ({
  clientid: ctx.aspid, 'client-secret': ctx.password, aspid: ctx.aspid, 'asp-secret': ctx.password, password: ctx.password,
  gstin: ctx.gstin, ret_period: fp, 'auth-token': ctx.token, api_version: '4.0', userrole: 'GSTR1', rtn_typ: 'GSTR1',
  'state-cd': ctx.gstin.slice(0, 2), username: ctx.username, 'ip-usr': '192.168.1.1', txn: `T${Date.now().toString(36).toUpperCase()}`,
});
const gstr1Url = (ctx, fp, pathPart, params) => `${gsp.GSP_BASE}/taxpayerapi/dec/${pathPart}?${gsp.qs({
  ...params, aspid: ctx.aspid, password: ctx.password, username: ctx.username, gstin: ctx.gstin, ret_period: fp, authtoken: ctx.token,
})}`;
const RET1 = { api_version: '4.1', userrole: 'GSTR1', rtn_typ: 'GSTR1' };

async function gstr1Call(fp, { method, pathPart, params, body }) {
  const ctx = await gsp.getContext();
  const text = await gsp.gspRequest({ method, url: gstr1Url(ctx, fp, pathPart, params), headers: gstr1Headers(ctx, fp), body });
  return { text, pack: await gsp.packResponse(text), ctx };
}
const sendPack = (res, pack, extra = {}) => {
  if (pack.tokenExpired) return expired(res, pack.message);
  res.status(pack.ok ? 200 : 502).json({ ...pack, ...extra });
};
const modulesOf = (m = {}) => ({ b2b: m.b2b !== false, b2cs: m.b2cs !== false, cdnr: m.cdnr !== false, hsn: m.hsn !== false, doc: m.doc !== false });

// preview of the JSON that "Save" will upload
router.post('/gst/gstr1/build', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext({ needToken: false });
  const out = await build.buildGstr1Payload({ gstin: ctx.gstin, fp, modules: modulesOf(req.body.modules) });
  await fs.writeFile(path.join(gsp.dataDir(), 'GSTR1_PAYLOAD_TMP.JSON'), JSON.stringify(out.payload, null, 2));
  res.json(out);
}));

router.post('/gst/gstr1/save', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx0 = await gsp.getContext();
  const out = await build.buildGstr1Payload({ gstin: ctx0.gstin, fp, modules: modulesOf(req.body.modules) });
  await fs.writeFile(path.join(gsp.dataDir(), 'GSTR1_PAYLOAD_TMP.JSON'), JSON.stringify(out.payload, null, 2));
  const { pack } = await gstr1Call(fp, { method: 'PUT', pathPart: 'v4.1/returns/gstr1', params: { action: 'RETSAVE', ...RET1 }, body: out.payload });
  const refId = pack.data && (pack.data.reference_id || (pack.data.data && pack.data.data.reference_id));
  sendPack(res, pack, { refId: refId || '', counts: out.counts, gross: out.gross, missing: out.missing });
}));

router.post('/gst/gstr1/summary', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const { text, pack } = await gstr1Call(fp, { method: 'GET', pathPart: 'v4.1/returns/gstr1', params: { action: 'RETSUM' } });
  if (pack.ok) await fs.writeFile(path.join(gsp.dataDir(), `GSTR1_SUMMARY_${fp}.JSON`), text);
  const secSum = pack.ok ? data.deepFind(pack.data, 'sec_sum') || [] : [];
  sendPack(res, pack, { secSum });
}));

router.post('/gst/gstr1/status', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const refId = String(req.body.refId || '').trim();
  if (!refId) throw badRequest('Reference ID is required.');
  const { text, pack } = await gstr1Call(fp, { method: 'GET', pathPart: 'v0.3/returns', params: { action: 'RETSTATUS', ref_id: refId } });
  await fs.writeFile(path.join(gsp.dataDir(), `GSTR1_STATUS_${fp}.JSON`), text);
  sendPack(res, pack);
}));

router.post('/gst/gstr1/proceed', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const { pack } = await gstr1Call(fp, { method: 'POST', pathPart: 'v1.1/returns/gstrptf', params: { action: 'RETNEWPTF' }, body: { gstin: ctx.gstin, ret_period: fp } });
  sendPack(res, pack);
}));

router.post('/gst/gstr1/submit', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const { pack } = await gstr1Call(fp, { method: 'POST', pathPart: 'v4.1/returns/gstr1', params: { action: 'RETSUBMIT', ...RET1 } });
  sendPack(res, pack);
}));

router.post('/gst/gstr1/reset', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const { pack } = await gstr1Call(fp, { method: 'POST', pathPart: 'v4.1/returns/gstr1', params: { action: 'RESET', ...RET1 } });
  sendPack(res, pack);
}));

const panOf = (body) => {
  const pan = String(body.pan || '').trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw badRequest('Enter a valid PAN of the authorised signatory.');
  return pan;
};

// EVC OTP for filing. form: R1 (GSTR-1) or R3B (GSTR-3B)
router.post('/gst/evc-otp', handle(async (req, res) => {
  const pan = panOf(req.body);
  const form = req.body.form === 'R3B' ? 'R3B' : 'R1';
  const ctx = await gsp.getContext();
  const pack = await gsp.packResponse(await gsp.requestEvcOtp(ctx, pan, form));
  sendPack(res, pack);
}));

router.post('/gst/gstr1/file', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const pan = panOf(req.body);
  const otp = String(req.body.otp || '').trim();
  if (!otp) throw badRequest('Enter the EVC OTP.');
  // Step 1: summary, taken as-is without whitespace, is both the signed data and the request body
  const sum = await gstr1Call(fp, { method: 'GET', pathPart: 'v4.1/returns/gstr1', params: { action: 'RETSUM' } });
  if (!sum.pack.ok) return sendPack(res, sum.pack, { step: 'RETSUM' });
  const summary = gsp.stripWhitespaceChars(sum.text);
  const sign = gsp.evcSignature(pan, otp, summary);
  const ctx = sum.ctx;
  const url = `${gstr1Url(ctx, fp, 'v4.0/returns/gstr1', { action: 'RETFILE' })}&st=EVC&sid=${encodeURIComponent(pan)}%7C${encodeURIComponent(otp)}&sign=${sign}`;
  const text = await gsp.gspRequest({ method: 'POST', url, headers: gstr1Headers(ctx, fp), body: summary });
  sendPack(res, await gsp.packResponse(text));
}));

// ============================================================ GSTR-3B
const gstr3bUrl = (ctx, fp, action) => `${gsp.GSP_BASE}/taxpayerapi/dec/v7.0/returns/gstr3b?${gsp.qs({
  action, aspid: ctx.aspid, password: ctx.password, gstin: ctx.gstin, username: ctx.username, ret_period: fp, authtoken: ctx.token,
})}`;
const GSTR3B_HEADERS = { api_version: '7.0', userrole: 'GSTR3B', rtn_typ: 'GSTR3B' };

// GET with the local cache used by the VFP tool: gstr3b/<ACTION>_<GSTIN>_<MMYYYY>.json
async function gstr3bCachedGet(fp, action, fresh) {
  const ctx0 = await gsp.getContext({ needToken: false });
  const dir = path.join(gsp.dataDir(), 'gstr3b');
  const file = path.join(dir, `${action}_${ctx0.gstin}_${fp}.json`);
  if (!fresh) {
    const cached = await gsp.readJsonIfExists(file);
    if (cached && !gsp.errorOf(gsp.parseJson(cached), cached)) return { text: cached, fromCache: true };
  }
  const ctx = await gsp.getContext();
  const text = await gsp.gspRequest({ url: gstr3bUrl(ctx, fp, action), headers: GSTR3B_HEADERS });
  const pack = await gsp.packResponse(text);
  if (pack.ok) { gsp.ensureDir(dir); await fs.writeFile(file, text); }
  return { text, pack, fromCache: false };
}

router.post('/gst/gstr3b/parse-csv', handle(async (req, res) => {
  const out = await build.parseGstr3Csv();
  if (!out) throw Object.assign(new Error(`GSTR-3.csv not found in ${gsp.csvDir()}`), { status: 404 });
  res.json(out);
}));

router.post('/gst/gstr3b/autofill', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const liab = await gstr3bCachedGet(fp, 'AUTOLIAB', !!req.body.fresh);
  if (liab.pack && !liab.pack.ok) return sendPack(res, liab.pack, { step: 'AUTOLIAB' });
  const intr = await gstr3bCachedGet(fp, 'RETINT', !!req.body.fresh);
  if (intr.pack && !intr.pack.ok) return sendPack(res, intr.pack, { step: 'RETINT' });
  const tables = build.parseAutoLiab(gsp.parseJson(liab.text));
  res.json({ ok: true, ...tables, retint: gsp.parseJson(intr.text), fromCache: liab.fromCache && intr.fromCache });
}));

router.post('/gst/gstr3b/summary', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const r = await gstr3bCachedGet(fp, 'RETSUM', !!req.body.fresh);
  if (r.pack && !r.pack.ok) return sendPack(res, r.pack);
  res.json({ ok: true, data: gsp.parseJson(r.text), fromCache: r.fromCache });
}));

const putGstr3b = async (fp, action, payload) => {
  const ctx = await gsp.getContext();
  const text = await gsp.gspRequest({ method: 'PUT', url: gstr3bUrl(ctx, fp, action), headers: GSTR3B_HEADERS, body: payload });
  return gsp.packResponse(text);
};

router.post('/gst/gstr3b/payload', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext({ needToken: false });
  res.json(build.buildGstr3bPayload({ gstin: ctx.gstin, fp, osup: req.body.osup || {}, itc: req.body.itc || {} }));
}));

router.post('/gst/gstr3b/save', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const payload = build.buildGstr3bPayload({ gstin: ctx.gstin, fp, osup: req.body.osup || {}, itc: req.body.itc || {} });
  sendPack(res, await putGstr3b(fp, 'RETSAVE', payload), { payload });
}));

router.post('/gst/gstr3b/offset', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const payload = build.buildOffsetPayload({ gstin: ctx.gstin, fp, pditc: req.body.pditc, pdcash: req.body.pdcash });
  sendPack(res, await putGstr3b(fp, 'RETOFFSET', payload), { payload });
}));

router.post('/gst/gstr3b/file', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const pan = panOf(req.body);
  const otp = String(req.body.otp || '').trim().toUpperCase();
  if (!otp) throw badRequest('Enter the EVC OTP.');
  const ctx = await gsp.getContext();
  const sumText = await gsp.gspRequest({ url: gstr3bUrl(ctx, fp, 'RETSUM'), headers: GSTR3B_HEADERS });
  const sumPack = await gsp.packResponse(sumText);
  if (!sumPack.ok) return sendPack(res, sumPack, { step: 'RETSUM' });
  const sign = gsp.evcSignature(pan, otp, gsp.stripWhitespaceChars(sumText));
  const url = `${gstr3bUrl(ctx, fp, 'RETFILE')}&st=EVC&sid=${encodeURIComponent(pan)}%7C${encodeURIComponent(otp)}&sign=${sign}`;
  const text = await gsp.gspRequest({ method: 'POST', url, headers: GSTR3B_HEADERS });
  sendPack(res, await gsp.packResponse(text));
}));

module.exports = router;
