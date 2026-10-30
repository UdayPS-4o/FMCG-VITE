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
const books = require('../../utils/gstBooks');

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
const num = (v) => Number(v) || 0;
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
  res.json(t ? { hasToken: true, savedDate: t.savedDate, savedAt: t.savedAt, tokenPreview: `${t.token.slice(0, 8)}…` } : { hasToken: false });
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

// GSTIN -> "PARTY NAME, PLACE" from the party master (CMPL.json) and purchase register (PUR.json).
// Used for tooltips on GSTIN columns. Rebuilt only when either file changes.
let partyCache = { key: '', names: {} };
router.get('/gst/party-names', handle(async (req, res) => {
  const dir = path.join(process.env.DBF_FOLDER_PATH || '', 'data', 'json');
  const files = ['CMPL.json', 'PUR.json'].map((f) => path.join(dir, f));
  const stats = await Promise.all(files.map((f) => fs.stat(f).catch(() => null)));
  const key = stats.map((s) => (s ? s.mtimeMs : 0)).join('|');
  if (key !== partyCache.key) {
    const names = {};
    const add = (gstin, name, place) => {
      const g = String(gstin || '').trim().toUpperCase();
      const n = String(name || '').trim();
      if (!/^\d{2}[A-Z0-9]{13}$/.test(g) || !n || names[g]) return;
      const p = String(place || '').trim();
      names[g] = p ? `${n}, ${p}` : n;
    };
    let cmpl, pur;
    try {
      [cmpl, pur] = await Promise.all(files.map((f, i) => (stats[i] ? data.readJsonStable(f, { retries: 3, waitMs: 1000 }).then((r) => r.data) : Promise.resolve([]))));

    } catch (e) {
      if (partyCache.key) return res.json(partyCache.names); // mid-update: serve the previous list
      throw e;
    }
    for (const r of cmpl) {
      if (r._deleted) continue;
      add(r.GSTNO, r.C_NAME, r.C_PLACE);
      add(r.C_GST, r.C_NAME, r.C_PLACE);
      add(r.C_CST, r.C_NAME, r.C_PLACE);
    }
    for (const r of pur) if (!r._deleted) add(r.C_CST, r.C_NAME, r.C_PLACE);
    partyCache = { key, names };
  }
  res.json(partyCache.names);
}));

// purchase bills (PB/PD) and GST expense journals (JB) of this FY and the previous one, for GSTR-2A matching
router.post('/gst/purchase-docs', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const docs = await data.purchaseDocsAround(fp);
  // journals posted from this page that CASH.json does not show yet
  const seen = new Set(docs.map((d) => `${d.billNorm}_${d.gstin}`));
  for (const p of await books.postedAsDocs()) if (!seen.has(`${p.billNorm}_${p.gstin}`)) docs.push(p);
  res.json({ docs });
}));

// ---------------------------------------------------------------- adding missing invoices to the books
const ownState = async () => (await gsp.getContext({ needToken: false })).gstin.slice(0, 2);

// expense / tax accounts, supplier GSTIN -> party, last accounts used per supplier, GSTR-2B trade names
router.get('/gst/books/masters', handle(async (req, res) => {
  const fp = gsp.validPeriod(req.query.fp) ? String(req.query.fp) : null;
  const [m, names, sugg, state] = await Promise.all([books.loadMasters(), books.tradeNames(), fp ? books.suggestions(fp) : {}, ownState()]);
  const accounts = Object.values(m.accounts).sort((x, y) => x.code.localeCompare(y.code));
  res.json({ ownState: state, accounts, expense: m.expense, tax: m.tax, parties: m.parties, tradeNames: names, suggestions: sugg });
}));

router.get('/gst/books/journals', handle(async (req, res) => {
  res.json({ journals: (await books.readStore()).journals.map((j) => ({ ...j, lines: books.linesOf(j) })) });
}));

router.post('/gst/books/journals', handle(async (req, res) => {
  const created = await books.createJournals(req.body.entries, req.user && (req.user.name || req.user.username), await ownState());
  res.json({ ok: true, created });
}));

// change the debit / credit lines, entry date or narration of a draft
router.patch('/gst/books/journals/:id', handle(async (req, res) => {
  const b = req.body || {};
  const journal = await books.updateJournal(req.params.id, { lines: b.lines, entryDate: b.entryDate, narration: b.narration }, await ownState());
  res.json({ ok: true, journal });
}));

router.delete('/gst/books/journals/:id', handle(async (req, res) => {
  await books.deleteJournal(req.params.id);
  res.json({ ok: true });
}));

// writes the selected drafts to CASH.DBF as JB vouchers
router.post('/gst/books/journals/post', handle(async (req, res) => {
  const posted = await books.postJournals(req.body.ids, await ownState());
  res.json({ ok: true, posted });
}));

// new creditor (Sundry Creditors, CT…) in CMPL.DBF
router.post('/gst/books/parties', handle(async (req, res) => {
  res.json({ ok: true, party: await books.createParty(req.body || {}) });
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
const g3b = require('../../utils/gstr3bForm');
const gstr3bUrl = (ctx, fp, action) => `${gsp.GSP_BASE}/taxpayerapi/dec/v7.0/returns/gstr3b?${gsp.qs({
  action, aspid: ctx.aspid, password: ctx.password, gstin: ctx.gstin, username: ctx.username, ret_period: fp, authtoken: ctx.token,
})}`;
const GSTR3B_HEADERS = { api_version: '7.0', userrole: 'GSTR3B', rtn_typ: 'GSTR3B' };
const gstr3bCacheFile = (gstin, fp, action) => path.join(gsp.dataDir(), 'gstr3b', `${action}_${gstin}_${fp}.json`);

// GET with the local cache used by the VFP tool: gstr3b/<ACTION>_<GSTIN>_<MMYYYY>.json
async function gstr3bCachedGet(fp, action, fresh) {
  const ctx0 = await gsp.getContext({ needToken: false });
  const file = gstr3bCacheFile(ctx0.gstin, fp, action);
  if (!fresh) {
    const cached = await gsp.readJsonIfExists(file);
    if (cached && !gsp.errorOf(gsp.parseJson(cached), cached)) return { text: cached, fromCache: true };
  }
  const ctx = await gsp.getContext();
  const text = await gsp.gspRequest({ url: gstr3bUrl(ctx, fp, action), headers: GSTR3B_HEADERS });
  const pack = await gsp.packResponse(text);
  if (pack.ok) { gsp.ensureDir(path.dirname(file)); await fs.writeFile(file, text); }
  return { text, pack, fromCache: false };
}
const dropCache = async (fp, action) => {
  const ctx = await gsp.getContext({ needToken: false });
  await fs.unlink(gstr3bCacheFile(ctx.gstin, fp, action)).catch(() => undefined);
};

// filing status of returns for a period (RETTRACK): [{ rtntype, ret_prd, status, arn, dof, mof }]
async function trackReturns(fp) {
  const ctx = await gsp.getContext();
  const url = `${gsp.GSP_BASE}/taxpayerapi/dec/v0.3/returns?${gsp.qs({
    action: 'RETTRACK', aspid: ctx.aspid, password: ctx.password, username: ctx.username, gstin: ctx.gstin, authtoken: ctx.token, ret_period: fp,
  })}`;
  const pack = await gsp.packResponse(await gsp.gspRequest({ url }));
  return { pack, list: pack.ok ? (data.deepFind(pack.data, 'EFiledlist') || []) : [] };
}

router.post('/gst/returns/track', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const { pack, list } = await trackReturns(fp);
  if (!pack.ok) return sendPack(res, pack);
  res.json({ ok: true, list });
}));

// figures from the books: 3.1(a) sales and 4A(5) ITC, from CASH (default) or the VFP GSTR-3.csv export
router.post('/gst/gstr3b/system', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const sys = req.body.source === 'csv' ? await g3b.systemFromCsv() : await g3b.systemFromCash(fp);
  if (!sys) {
    const msg = req.body.source === 'csv' ? `GSTR-3.csv not found in ${gsp.csvDir()}` : `CASH.json for ${fp} not found`;
    throw Object.assign(new Error(msg), { status: 404 });
  }
  res.json(sys);
}));

router.post('/gst/gstr3b/autofill', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const liab = await gstr3bCachedGet(fp, 'AUTOLIAB', !!req.body.fresh);
  if (liab.pack && !liab.pack.ok) return sendPack(res, liab.pack, { step: 'AUTOLIAB' });
  const intr = await gstr3bCachedGet(fp, 'RETINT', !!req.body.fresh);
  const intrFailed = intr.pack && !intr.pack.ok;
  const retint = intrFailed ? null : gsp.parseJson(intr.text);
  const { form, meta } = g3b.formFromAutoLiab(gsp.parseJson(liab.text));
  res.json({
    ok: true, form, meta, interest: retint && retint.interest ? retint.interest : null, retint,
    retintError: intrFailed ? intr.pack.message : '', fromCache: liab.fromCache,
  });
}));

router.post('/gst/gstr3b/summary', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const r = await gstr3bCachedGet(fp, 'RETSUM', !!req.body.fresh);
  if (r.pack && !r.pack.ok) return sendPack(res, r.pack);
  const json = gsp.parseJson(r.text);
  res.json({ ok: true, data: json, ...g3b.formFromRetsum(json), fromCache: r.fromCache });
}));

// Get Cash & ITC balance (ledgers v0.3, action BAL)
router.post('/gst/gstr3b/ledger', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const url = `${gsp.GSP_BASE}/taxpayerapi/dec/v0.3/ledgers?${gsp.qs({
    action: 'BAL', gstin: ctx.gstin, ret_period: fp, aspid: ctx.aspid, password: ctx.password, username: ctx.username, authtoken: ctx.token,
  })}`;
  const pack = await gsp.packResponse(await gsp.gspRequest({ url }));
  if (!pack.ok) return sendPack(res, pack);
  res.json({ ok: true, ...g3b.parseLedgerBal(pack.data) });
}));

// closing balances of the Electronic Credit Reversal & Re-claimed Statement (CLOSINGBAL) and RCM liability/ITC
// statement (RCMCLOSINGBAL) - used for the GSTN advisory 643 validations of 4D(1) and 4A(2)/(3)
router.post('/gst/gstr3b/balances', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const get = async (action) => gsp.packResponse(await gsp.gspRequest({ url: gstr3bUrl(ctx, fp, action), headers: GSTR3B_HEADERS }));
  const [rev, rcm, ob] = await Promise.all([get('CLOSINGBAL'), get('RCMCLOSINGBAL'), get('OPENINGBAL')]);
  if (rev.tokenExpired || rcm.tokenExpired) return expired(res);
  const toTax = (p) => {
    const b = (p.ok && p.data && p.data.clsbal) || null;
    return b ? { iamt: Number(b.igst) || 0, camt: Number(b.cgst) || 0, samt: Number(b.sgst) || 0, csamt: Number(b.cess) || 0 } : null;
  };
  res.json({
    ok: true, reclaim: toTax(rev), rcm: toTax(rcm), reclaimError: rev.ok ? '' : rev.message, rcmError: rcm.ok ? '' : rcm.message,
    // opening balance declared for the reclaim statement (one-time declaration on the portal)
    openingDeclared: ob.ok && ob.data ? (Array.isArray(ob.data.tr) ? ob.data.tr : []) : null,
  });
}));

// GSTN check of the form against the auto-calculated (hard-locked) values - nothing is saved (action VALID)
router.post('/gst/gstr3b/validate', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const payload = g3b.buildPayload({ gstin: ctx.gstin, fp, form: req.body.form });
  const text = await gsp.gspRequest({ method: 'POST', url: gstr3bUrl(ctx, fp, 'VALID'), headers: GSTR3B_HEADERS, body: payload });
  const pack = await gsp.packResponse(text);
  if (!pack.ok) return sendPack(res, pack);
  // GSTN answers 200 with isValid "N" and the tables / fields that differ from its computed values
  const d = pack.data || {};
  const fields = g3b.validationFields(d);
  if (String(d.isValid || '').toUpperCase() === 'N' || fields.length) {
    return res.status(422).json({ ...pack, ok: false, isValid: 'N', fields, message: `${d.error_message || 'GSTN validation failed.'} ${fields.map((x) => x.label).join('; ')}`.trim() });
  }
  sendPack(res, pack);
}));

// ask GSTN to re-compute the system interest (action CMPINT); RETINT is re-read afterwards
router.post('/gst/gstr3b/recompute-interest', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const text = await gsp.gspRequest({ method: 'POST', url: gstr3bUrl(ctx, fp, 'CMPINT'), headers: GSTR3B_HEADERS, body: { gstin: ctx.gstin, ret_period: fp } });
  const pack = await gsp.packResponse(text);
  if (pack.ok) await dropCache(fp, 'RETINT');
  sendPack(res, pack);
}));

// Table 6.1 tax liability breakup by tax period (RETBKP) - after offset, before filing; needed when part of
// this month's liability belongs to earlier periods, so GSTN can compute interest correctly
router.post('/gst/gstr3b/breakup', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const rows = (Array.isArray(req.body.breakup) ? req.body.breakup : []).map((b) => ({
    ret_period: String(b.ret_period || ''),
    liability: { iamt: Number(b.liability && b.liability.iamt) || 0, camt: Number(b.liability && b.liability.camt) || 0, samt: Number(b.liability && b.liability.samt) || 0, csamt: Number(b.liability && b.liability.csamt) || 0 },
  }));
  if (!rows.length || !rows.every((b) => gsp.validPeriod(b.ret_period))) throw badRequest('Each breakup row needs a valid return period (MMYYYY).');
  if (new Set(rows.map((b) => b.ret_period)).size !== rows.length) throw badRequest('A return period appears twice in the breakup.');
  await assertNotFiled(fp);
  const ctx = await gsp.getContext();
  const payload = { gstin: ctx.gstin, ret_period: fp, breakup: rows };
  const text = await gsp.gspRequest({ method: 'PUT', url: gstr3bUrl(ctx, fp, 'RETBKP'), headers: GSTR3B_HEADERS, body: payload });
  sendPack(res, await gsp.packResponse(text), { payload });
}));

router.post('/gst/gstr3b/payload', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext({ needToken: false });
  res.json(g3b.buildPayload({ gstin: ctx.gstin, fp, form: req.body.form }));
}));

const putGstr3b = async (fp, action, payload) => {
  const ctx = await gsp.getContext();
  const text = await gsp.gspRequest({ method: 'PUT', url: gstr3bUrl(ctx, fp, action), headers: GSTR3B_HEADERS, body: payload });
  return gsp.packResponse(text);
};
const assertNotFiled = async (fp) => {
  const { list } = await trackReturns(fp);
  const filed = list.find((x) => String(x.rtntype).toUpperCase() === 'GSTR3B' && /filed/i.test(String(x.status)));
  if (filed) throw Object.assign(new Error(`GSTR-3B for ${fp} is already filed (ARN ${filed.arn}, ${filed.dof}).`), { status: 409 });
};

// dryRun: returns the payload and what changes against the return currently saved on the portal
router.post('/gst/gstr3b/save', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const payload = g3b.buildPayload({ gstin: ctx.gstin, fp, form: req.body.form });
  if (req.body.dryRun) {
    const sum = await gstr3bCachedGet(fp, 'RETSUM', true);
    if (sum.pack && !sum.pack.ok) return sendPack(res, sum.pack, { step: 'RETSUM' });
    const saved = g3b.buildPayload({ gstin: ctx.gstin, fp, form: g3b.formFromRetsum(gsp.parseJson(sum.text)).form });
    return res.json({ ok: true, payload, changes: g3b.diffPayload(saved, payload) });
  }
  await assertNotFiled(fp);
  const pack = await putGstr3b(fp, 'RETSAVE', payload);
  if (pack.ok) await dropCache(fp, 'RETSUM');
  sendPack(res, pack, { payload });
}));

router.post('/gst/gstr3b/offset', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const ctx = await gsp.getContext();
  const payload = g3b.buildOffsetPayload({ gstin: ctx.gstin, fp, pditc: req.body.pditc, pdcash: req.body.pdcash });
  // GSTN rejects partial / excess payment (RT-3BAS1070): every head must equal what the saved return says is payable
  const sum = await gstr3bCachedGet(fp, 'RETSUM', true);
  if (sum.pack && !sum.pack.ok) return sendPack(res, sum.pack, { step: 'RETSUM' });
  const { ledgers } = g3b.formFromRetsum(gsp.parseJson(sum.text));
  const problems = g3b.offsetProblems(payload, ledgers);
  if (problems.length) throw badRequest(`Offset does not equal the liability on the portal: ${problems.join('; ')}`);
  // the liability ledger ids appear in RETSUM only once GSTN has posted the return's liability to the ledger
  const ids = new Map(ledgers.filter((l) => l.liab_ldg_id).map((l) => [l.trans_typ, l.liab_ldg_id]));
  const needed = [payload.pditc, ...payload.pdcash].filter((x) => x && (num(x.trans_typ) === 30002 || num(x.trans_typ) === 30003));
  // before the first offset RETSUM has no ids (seen Sep-2026: they appeared only after the offset), and an id of 0
  // was rejected with RT-3BGC-9017 - so leave the field out when it is not known yet
  const noIds = needed.some((x) => !ids.get(num(x.trans_typ)));
  needed.forEach((x) => {
    const id = ids.get(num(x.trans_typ));
    if (id) x.liab_ldg_id = id; else delete x.liab_ldg_id;
  });
  await assertNotFiled(fp);
  const pack = await putGstr3b(fp, 'RETOFFSET', payload);
  if (pack.ok) await dropCache(fp, 'RETSUM');
  else if (noIds && !pack.tokenExpired) {
    pack.message = `${pack.message || 'Offset failed.'} — GSTN did not accept the offset through the API. Do it on gst.gov.in instead: `
      + 'GSTR-3B → Proceed to payment → "Make payment / Post credit to ledger"; then click "Load portal data" here and file.';
  }
  sendPack(res, pack, { payload });
}));

router.post('/gst/gstr3b/file', handle(async (req, res) => {
  const fp = fpOf(req.body);
  const pan = panOf(req.body);
  const otp = String(req.body.otp || '').trim().toUpperCase();
  if (!otp) throw badRequest('Enter the EVC OTP.');
  await assertNotFiled(fp);
  const ctx = await gsp.getContext();
  const sumText = await gsp.gspRequest({ url: gstr3bUrl(ctx, fp, 'RETSUM'), headers: GSTR3B_HEADERS });
  const sumPack = await gsp.packResponse(sumText);
  if (!sumPack.ok) return sendPack(res, sumPack, { step: 'RETSUM' });
  // the summary (without whitespace) is both the signed data and the request body - sending no body is rejected
  // with RT-3BAS1029 "mismatch between signed data and payload"
  const summary = gsp.stripWhitespaceChars(sumText);
  const sign = gsp.evcSignature(pan, otp, summary);
  const url = `${gstr3bUrl(ctx, fp, 'RETFILE')}&st=EVC&sid=${encodeURIComponent(pan)}%7C${encodeURIComponent(otp)}&sign=${sign}`;
  const text = await gsp.gspRequest({ method: 'POST', url, headers: GSTR3B_HEADERS, body: summary });
  const pack = await gsp.packResponse(text);
  if (pack.ok) await dropCache(fp, 'RETSUM');
  sendPack(res, pack);
}));

module.exports = router;
