// Parsers for the GSTR-1 / GSTR-2B portal JSON, the system CSV / CASH.json readers and the matching
// logic. Port of GSTR1_PORTAL_VIEWER.prg and GSTR2B_PORTAL_VIEWER.prg.
const fs = require('fs').promises;
const path = require('path');
const { dataDir, csvDir, findFile, parseJson, errorOf } = require('./gstPortalClient');

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v == null ? '' : String(v));
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n) => r2(n).toFixed(2);

// the API sometimes wraps the payload (data / docdata ...) - find a key anywhere in the tree
function deepFind(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const queue = [obj];
  while (queue.length) {
    const cur = queue.shift();
    if (Array.isArray(cur)) { queue.push(...cur.filter((x) => x && typeof x === 'object')); continue; }
    if (Object.prototype.hasOwnProperty.call(cur, key) && cur[key] != null) return cur[key];
    queue.push(...Object.values(cur).filter((x) => x && typeof x === 'object'));
  }
  return undefined;
}
const arr = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- GSTR-1 parsers
function parseGstr1B2B(json, per) {
  const rows = [];
  for (const sup of arr(deepFind(json, 'b2b'))) {
    for (const inv of arr(sup.inv)) {
      const base = {
        RET_PER: per, CTIN: str(sup.ctin), CFS: str(sup.cfs), INUM: str(inv.inum), IDT: str(inv.idt), VAL: num(inv.val),
        POS: str(inv.pos), RCHRG: str(inv.rchrg), ETIN: str(inv.etin), INV_TYP: str(inv.inv_typ), CFLAG: str(inv.cflag),
        DIFF_PCT: num(inv.diff_percent), SRCTYP: str(inv.srctyp), IRN: str(inv.irn), IRNDATE: str(inv.irngendate),
      };
      const itms = arr(inv.itms);
      if (!itms.length) rows.push({ ...base, ITEM_NUM: 0, RT: 0, TXVAL: 0, IAMT: 0, CAMT: 0, SAMT: 0, CSAMT: 0, MISMATCH: '', REASON: '' });
      for (const it of itms) {
        const d = it.itm_det || it;
        rows.push({ ...base, ITEM_NUM: num(it.num), RT: num(d.rt), TXVAL: num(d.txval), IAMT: num(d.iamt), CAMT: num(d.camt), SAMT: num(d.samt), CSAMT: num(d.csamt), MISMATCH: '', REASON: '' });
      }
    }
  }
  return rows;
}

function parseGstr1B2CS(json, per) {
  return arr(deepFind(json, 'b2cs')).map((o) => ({
    RET_PER: per, FLAG: str(o.flag), SPLY_TY: str(o.sply_ty), DIFF_PCT: num(o.diff_percent), RT: num(o.rt), TYP: str(o.typ),
    ETIN: str(o.etin), POS: str(o.pos), TXVAL: num(o.txval), IAMT: num(o.iamt), CAMT: num(o.camt), SAMT: num(o.samt), CSAMT: num(o.csamt),
    MISMATCH: '', REASON: '',
  }));
}

function parseGstr1CDNR(json, per) {
  const rows = [];
  for (const sup of arr(deepFind(json, 'cdnr'))) {
    for (const nt of arr(sup.nt)) {
      const base = {
        RET_PER: per, CTIN: str(sup.ctin), CFS: str(sup.cfs), NTTY: str(nt.ntty), NT_NUM: str(nt.nt_num), NT_DT: str(nt.nt_dt),
        INUM: str(nt.inum), IDT: str(nt.idt), VAL: num(nt.val), POS: str(nt.pos), RCHRG: str(nt.rchrg), INV_TYP: str(nt.inv_typ),
        SRCTYP: str(nt.srctyp), IRN: str(nt.irn), IRNDATE: str(nt.irngendate),
      };
      const itms = arr(nt.itms);
      if (!itms.length) rows.push({ ...base, ITEM_NUM: 0, RT: 0, TXVAL: 0, IAMT: 0, CAMT: 0, SAMT: 0, CSAMT: 0, MISMATCH: '', REASON: '' });
      for (const it of itms) {
        const d = it.itm_det || it;
        rows.push({ ...base, ITEM_NUM: num(it.num), RT: num(d.rt), TXVAL: num(d.txval), IAMT: num(d.iamt), CAMT: num(d.camt), SAMT: num(d.samt), CSAMT: num(d.csamt), MISMATCH: '', REASON: '' });
      }
    }
  }
  return rows;
}

function parseGstr1DocIss(json, per) {
  const rows = [];
  const det = arr(deepFind(json, 'doc_det'));
  for (const d of det) {
    for (const doc of arr(d.docs)) {
      rows.push({
        RET_PER: per, DOC_NUM: num(d.doc_num), NUM: num(doc.num), FROM_DOC: str(doc.from), TO_DOC: str(doc.to),
        TOTNUM: num(doc.totnum), CANC: num(doc.cancel), NET_ISS: num(doc.net_issue), MISMATCH: '', REASON: '',
      });
    }
  }
  return rows;
}

function parseGstr1Hsn(json, per) {
  const rows = [];
  const hsn = deepFind(json, 'hsn') || json;
  const push = (typ, list) => arr(list).forEach((o) => rows.push({
    RET_PER: per, TYP: typ, NUM: num(o.num), HSN_SC: str(o.hsn_sc), DESC: str(o.desc), UDES: str(o.user_desc), UQC: str(o.uqc),
    QTY: num(o.qty), TXVAL: num(o.txval), IAMT: num(o.iamt), CAMT: num(o.camt), SAMT: num(o.samt), CSAMT: num(o.csamt), RT: num(o.rt),
    MISMATCH: '', REASON: '',
  }));
  push('B2B', hsn && hsn.hsn_b2b);
  push('B2C', hsn && hsn.hsn_b2c);
  return rows;
}

// ---------------------------------------------------------------- GSTR-2B parsers
const GSTR2B_ROW = (per, ctin, o) => ({
  RET_PER: per, CTIN: str(ctin), CFS: '', INUM: str(o.inum).trim(), IDT: str(o.dt), VAL: num(o.val), POS: str(o.pos),
  RCHRG: str(o.rev), ETIN: '', INV_TYP: str(o.typ), CFLAG: '', DIFF_PCT: 0, SRCTYP: str(o.srctyp), IRN: str(o.irn),
  IRNDATE: str(o.irngendate), ITEM_NUM: 0, RT: 0, TXVAL: num(o.txval), IAMT: num(o.igst), CAMT: num(o.cgst), SAMT: num(o.sgst),
  CSAMT: num(o.cess), MISMATCH: '', REASON: '',
});

function parseGstr2bB2B(json, per) {
  const rows = [];
  for (const sup of arr(deepFind(json, 'b2b'))) for (const inv of arr(sup.inv)) rows.push(GSTR2B_ROW(per, sup.ctin, inv));
  return rows;
}

function parseGstr2bCDNR(json, per) {
  const rows = [];
  for (const sup of arr(deepFind(json, 'cdnr'))) {
    for (const nt of arr(sup.nt)) {
      rows.push({
        RET_PER: per, CTIN: str(sup.ctin), CFS: '', NTTY: str(nt.typ), NT_NUM: str(nt.ntnum), NT_DT: str(nt.dt), INUM: '', IDT: '',
        VAL: num(nt.val), POS: str(nt.pos), RCHRG: str(nt.rev), INV_TYP: str(nt.suptyp), SRCTYP: str(nt.srctyp), IRN: str(nt.irn),
        IRNDATE: str(nt.irngendate), ITEM_NUM: 0, RT: 0, TXVAL: num(nt.txval), IAMT: num(nt.igst), CAMT: num(nt.cgst), SAMT: num(nt.sgst),
        CSAMT: num(nt.cess), MISMATCH: '', REASON: '',
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- local store
const GSTR1_FILES = { b2b: 'b2b.json', b2cs: 'b2cs.json', cdnr: 'cdnr.json', dociss: 'dociss.json', hsn: 'hsn.json' };
const gstr1Dir = (per) => path.join(dataDir(), 'GSTR1', per);
const gstr2bDir = (per) => path.join(dataDir(), 'GSTR2B', per);

async function readText(file) {
  try { return await fs.readFile(file, 'utf8'); } catch { return null; }
}

// A saved file only counts as downloaded data when it is not an error envelope
// (old runs saved GSP / GSTN errors to disk, e.g. GSP101 "missing auth-token").
async function hasUsableFile(file) {
  const text = await readText(file);
  return text !== null && !errorOf(parseJson(text), text);
}
async function hasLocalGstr1(per) {
  for (const f of ['b2b.json', 'cdnr.json', 'b2cs.json']) {
    if (await hasUsableFile(path.join(gstr1Dir(per), f))) return true;
  }
  return false;
}
async function hasLocalGstr2b(per) {
  return hasUsableFile(path.join(gstr2bDir(per), 'gstr2b.json'));
}

// A saved file that holds an error envelope has no usable data (e.g. "No document found")
function warningOf(section, per, text) {
  if (text == null) return null;
  const msg = errorOf(parseJson(text), text);
  return msg ? { period: per, section, message: msg } : null;
}

async function loadGstr1Local(periods) {
  const rows = { b2b: [], b2cs: [], cdnr: [], dociss: [], hsn: [] };
  const warnings = [];
  for (const per of periods) {
    const texts = {};
    for (const [k, f] of Object.entries(GSTR1_FILES)) texts[k] = await readText(path.join(gstr1Dir(per), f));
    const j = (k) => (texts[k] ? parseJson(texts[k]) : null);
    rows.b2b.push(...parseGstr1B2B(j('b2b'), per));
    rows.b2cs.push(...parseGstr1B2CS(j('b2cs'), per));
    rows.cdnr.push(...parseGstr1CDNR(j('cdnr'), per));
    rows.dociss.push(...parseGstr1DocIss(j('dociss'), per));
    rows.hsn.push(...parseGstr1Hsn(j('hsn'), per));
    for (const k of Object.keys(GSTR1_FILES)) {
      const w = warningOf(k.toUpperCase(), per, texts[k]);
      if (w) warnings.push(w);
    }
  }
  return { rows, warnings };
}

async function loadGstr2bLocal(periods) {
  const rows = { b2b: [], cdnr: [] };
  const warnings = [];
  for (const per of periods) {
    const text = await readText(path.join(gstr2bDir(per), 'gstr2b.json'));
    const json = text ? parseJson(text) : null;
    rows.b2b.push(...parseGstr2bB2B(json, per));
    rows.cdnr.push(...parseGstr2bCDNR(json, per));
    const w = warningOf('GSTR-2B', per, text);
    if (w) warnings.push(w);
  }
  return { rows, warnings };
}

// ---------------------------------------------------------------- CSV reading
function parseCsv(text) {
  const out = [];
  let row = [], cell = '', inQ = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function readCsv(name) {
  const file = await findFile(csvDir(), name);
  if (!file) return null;
  return parseCsv(await fs.readFile(file, 'utf8')).map((r) => r.map((c) => String(c).trim()));
}

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
// "02-Aug-26" -> "02-08-2026" (portal format); anything else is returned untouched (VFP ConvertDate)
function convertDate(d) {
  d = String(d || '').trim();
  const m = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{2,4})$/.exec(d);
  if (!m) return d;
  const mm = MONTHS[m[2].toUpperCase()];
  if (!mm) return d;
  const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${m[1].padStart(2, '0')}-${mm}-${yy}`;
}
const periodOfDate = (d) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(convertDate(d));
  return m ? `${m[2]}${m[3]}` : '';
};

// ---------------------------------------------------------------- GSTR-1 matching
const MISMATCH_TOL = 1.0;
const reason = (portal, sys) => `portal value is ${fmt(portal)} and system value is ${fmt(sys)} diff=${fmt(Math.abs(sys - portal))}`;

function groupSum(rows, keyFn, fields) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let g = map.get(k);
    if (!g) { g = { ...r }; for (const f of fields) g[f] = 0; map.set(k, g); }
    for (const f of fields) g[f] += r[f] || 0;
  }
  return map;
}

const bad = (row) => row.MISMATCH && row.MISMATCH !== 'No mismatch';

async function matchGstr1(data, periods) {
  const notes = [];
  const periodOk = (p) => !p || periods.includes(p);
  const rate = (v) => r2(num(v)).toFixed(2);

  // ---- B2B (key: invoice no + rate)
  const b2bCsv = await readCsv('B2B.CSV');
  if (!b2bCsv) notes.push('B2B.CSV not found - B2B not matched.');
  else {
    const sys = b2bCsv.filter((r) => r[0] && !/gstin/i.test(r[0]) && !/invoice/i.test(r[2]))
      .map((r) => ({ INUM: r[2], IDT: convertDate(r[3]), VAL: num(r[4]), RT: num(r[10]), TXVAL: num(r[11]) }));
    const sysMap = groupSum(sys, (r) => `${r.INUM}|${rate(r.RT)}`, ['TXVAL']);
    sysMap.forEach((g, k) => { g.VAL = Math.max(...sys.filter((s) => `${s.INUM}|${rate(s.RT)}` === k).map((s) => s.VAL)); });
    const portalSum = groupSum(data.b2b, (r) => `${r.INUM.trim()}|${rate(r.RT)}`, ['TXVAL']);
    const seen = new Set();
    for (const row of data.b2b) {
      const key = `${row.INUM.trim()}|${rate(row.RT)}`;
      seen.add(key);
      const s = sysMap.get(key);
      const ptx = portalSum.get(key).TXVAL;
      if (!s) { row.MISMATCH = 'Missing'; row.REASON = 'Invoice missing in system data'; }
      else if (Math.abs(s.TXVAL - ptx) > MISMATCH_TOL) { row.MISMATCH = 'TXVAL- mismatch'; row.REASON = reason(ptx, s.TXVAL); }
      else if (Math.abs(s.VAL - row.VAL) > MISMATCH_TOL) { row.MISMATCH = 'VAL- mismatch'; row.REASON = reason(row.VAL, s.VAL); }
      else { row.MISMATCH = 'No mismatch'; row.REASON = 'Correct'; }
    }
    sysMap.forEach((s, key) => {
      const per = periodOfDate(s.IDT);
      if (seen.has(key) || !periodOk(per)) return;
      data.b2b.push({ RET_PER: per, CTIN: '', CFS: '', INUM: s.INUM, IDT: s.IDT, VAL: s.VAL, POS: '', RCHRG: '', ETIN: '', INV_TYP: '', CFLAG: '', DIFF_PCT: 0, SRCTYP: '', IRN: '', IRNDATE: '', ITEM_NUM: 0, RT: s.RT, TXVAL: s.TXVAL, IAMT: 0, CAMT: 0, SAMT: 0, CSAMT: 0, MISMATCH: 'Missing', REASON: 'Invoice missing on portal' });
    });
  }

  // ---- CDNR (key: note no + rate)
  const cdnrCsv = await readCsv('cdnr.csv');
  if (!cdnrCsv) notes.push('cdnr.csv not found - CDNR not matched.');
  else {
    const sys = cdnrCsv.filter((r) => r[0] && !/gstin/i.test(r[0]) && !/note/i.test(r[2]))
      .map((r) => ({ NT_NUM: r[2], NT_DT: convertDate(r[3]), VAL: num(r[8]), RT: num(r[10]), TXVAL: num(r[11]) }));
    const sysMap = groupSum(sys, (r) => `${r.NT_NUM}|${rate(r.RT)}`, ['TXVAL']);
    sysMap.forEach((g, k) => { g.VAL = Math.max(...sys.filter((s) => `${s.NT_NUM}|${rate(s.RT)}` === k).map((s) => s.VAL)); });
    const portalSum = groupSum(data.cdnr, (r) => `${r.NT_NUM.trim()}|${rate(r.RT)}`, ['TXVAL']);
    const seen = new Set();
    for (const row of data.cdnr) {
      const key = `${row.NT_NUM.trim()}|${rate(row.RT)}`;
      seen.add(key);
      const s = sysMap.get(key);
      const ptx = portalSum.get(key).TXVAL;
      if (!s) { row.MISMATCH = 'Missing'; row.REASON = 'Note missing in system data'; }
      else if (Math.abs(s.TXVAL - ptx) > MISMATCH_TOL) { row.MISMATCH = 'TXVAL- mismatch'; row.REASON = reason(ptx, s.TXVAL); }
      else if (Math.abs(s.VAL - row.VAL) > MISMATCH_TOL) { row.MISMATCH = 'VAL- mismatch'; row.REASON = reason(row.VAL, s.VAL); }
      else { row.MISMATCH = 'No mismatch'; row.REASON = 'Correct'; }
    }
    sysMap.forEach((s, key) => {
      const per = periodOfDate(s.NT_DT);
      if (seen.has(key) || !periodOk(per)) return;
      data.cdnr.push({ RET_PER: per, CTIN: '', CFS: '', NTTY: '', NT_NUM: s.NT_NUM, NT_DT: s.NT_DT, INUM: '', IDT: '', VAL: s.VAL, POS: '', RCHRG: '', INV_TYP: '', SRCTYP: '', IRN: '', IRNDATE: '', ITEM_NUM: 0, RT: s.RT, TXVAL: s.TXVAL, IAMT: 0, CAMT: 0, SAMT: 0, CSAMT: 0, MISMATCH: 'Missing', REASON: 'Note missing on portal' });
    });
  }

  // ---- B2CS (key: place of supply state code + rate)
  const b2csCsv = await readCsv('b2cs.csv');
  if (!b2csCsv) notes.push('b2cs.csv not found - B2CS not matched.');
  else {
    const sys = b2csCsv.filter((r) => r[0] && !/^type$/i.test(r[0]) && !/place/i.test(r[1]))
      .map((r) => ({ POS: r[1], P2: r[1].slice(0, 2), RT: num(r[2]), TXVAL: num(r[4]) }));
    const sysMap = groupSum(sys, (r) => `${r.P2}|${rate(r.RT)}`, ['TXVAL']);
    const portalSum = groupSum(data.b2cs, (r) => `${str(r.POS).slice(0, 2)}|${rate(r.RT)}`, ['TXVAL']);
    const seen = new Set();
    for (const row of data.b2cs) {
      const key = `${str(row.POS).slice(0, 2)}|${rate(row.RT)}`;
      seen.add(key);
      const s = sysMap.get(key);
      const ptx = portalSum.get(key).TXVAL;
      if (!s) { row.MISMATCH = 'Missing'; row.REASON = 'Record missing in system data'; }
      else if (Math.abs(s.TXVAL - ptx) > MISMATCH_TOL) { row.MISMATCH = 'TXVAL- mismatch'; row.REASON = reason(ptx, s.TXVAL); }
      else { row.MISMATCH = 'No mismatch'; row.REASON = 'Correct'; }
    }
    const per0 = periods[0] || '';
    sysMap.forEach((s, key) => {
      if (seen.has(key)) return;
      data.b2cs.push({ RET_PER: per0, FLAG: '', SPLY_TY: '', DIFF_PCT: 0, RT: s.RT, TYP: '', ETIN: '', POS: s.POS, TXVAL: s.TXVAL, IAMT: 0, CAMT: 0, SAMT: 0, CSAMT: 0, MISMATCH: 'Missing', REASON: 'Record missing on portal' });
    });
  }

  // ---- HSN (key: hsn + rate, separately for B2B / B2C)
  for (const typ of ['B2B', 'B2C']) {
    const fileName = `hsn(${typ.toLowerCase()}).csv`;
    const csv = await readCsv(fileName);
    if (!csv) { notes.push(`${fileName} not found - HSN ${typ} not matched.`); continue; }
    const sys = csv.filter((r) => r[0] && !/hsn/i.test(r[0]) && !/description/i.test(r[1]))
      .map((r) => ({ HSN_SC: r[0], QTY: num(r[3]), TXVAL: num(r[5]), RT: num(r[10]) }));
    const sysMap = groupSum(sys, (r) => `${r.HSN_SC}|${rate(r.RT)}`, ['TXVAL', 'QTY']);
    const portalRows = data.hsn.filter((r) => r.TYP === typ);
    const portalSum = groupSum(portalRows, (r) => `${r.HSN_SC.trim()}|${rate(r.RT)}`, ['TXVAL', 'QTY']);
    const seen = new Set();
    for (const row of portalRows) {
      const key = `${row.HSN_SC.trim()}|${rate(row.RT)}`;
      seen.add(key);
      const s = sysMap.get(key);
      const p = portalSum.get(key);
      if (!s) { row.MISMATCH = 'Missing'; row.REASON = `HSN missing in system ${fileName}`; }
      else if (Math.abs(s.TXVAL - p.TXVAL) > MISMATCH_TOL) { row.MISMATCH = 'TXVAL- mismatch'; row.REASON = reason(p.TXVAL, s.TXVAL); }
      else if (Math.abs(s.QTY - p.QTY) > 0.001) { row.MISMATCH = 'QTY- mismatch'; row.REASON = `portal qty is ${p.QTY} and system qty is ${s.QTY} diff=${r2(Math.abs(s.QTY - p.QTY))}`; }
      else { row.MISMATCH = 'No mismatch'; row.REASON = 'Correct'; }
    }
    const per0 = periods[0] || '';
    sysMap.forEach((s, key) => {
      if (seen.has(key)) return;
      data.hsn.push({ RET_PER: per0, TYP: typ, NUM: 0, HSN_SC: s.HSN_SC, DESC: '', UDES: '', UQC: '', QTY: s.QTY, TXVAL: s.TXVAL, IAMT: 0, CAMT: 0, SAMT: 0, CSAMT: 0, RT: s.RT, MISMATCH: 'Missing', REASON: 'HSN missing on portal' });
    });
  }
  return { data, notes };
}

// ---------------------------------------------------------------- CASH.json (system purchase side)
const cashCache = new Map(); // file -> { mtime, bills }

const fyFolderOf = (per) => {
  const m = parseInt(per.slice(0, 2), 10);
  const y = parseInt(per.slice(2), 10);
  const start = m >= 4 ? y : y - 1;
  return `D01-${String(start).slice(2)}${String(start + 1).slice(2)}`;
};

async function findCashJson(per) {
  const base = process.env.DBF_FOLDER_PATH;
  if (!base) return null;
  const parent = path.dirname(path.resolve(base));
  const cands = [
    path.join(parent, fyFolderOf(per), 'data', 'json', 'CASH.json'),
    path.join(parent, fyFolderOf(per).toLowerCase(), 'data', 'json', 'CASH.json'),
  ];
  if (path.basename(base).toLowerCase() === fyFolderOf(per).toLowerCase()) cands.unshift(path.join(base, 'data', 'json', 'CASH.json'));
  for (const c of cands) { try { await fs.access(c); return c; } catch { /* next */ } }
  return null;
}

const toIst = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + 5.5 * 3600 * 1000);
};
const dmy = (d) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}` : '');
const pOf = (d) => (d ? `${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}` : '');

// The DBF sync rewrites the big JSON exports (CASH.json ~150 MB) in place, so a read can catch a half-written file.
// Read until the file is stable (same size / mtime before and after) and parses; retry a few times otherwise.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function readJsonStable(file, { retries = 5, waitMs = 2000 } = {}) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const before = await fs.stat(file);
      const text = await fs.readFile(file, 'utf8');
      const after = await fs.stat(file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || text.length === 0) throw new Error('file changed while reading');
      return { data: JSON.parse(text), mtime: after.mtimeMs };
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(waitMs);
    }
  }
  const err = new Error(`${path.basename(file)} is being updated by the data sync right now - please try again in a minute. (${lastErr && lastErr.message})`);
  err.status = 503;
  throw err;
}

// Aggregates CASH by bill number: VR (max), CR sum, GG DR (taxable), VI DR (IGST), VG DR (CGST+SGST) and the bill date of the GG row.
async function loadCashBills(file) {
  const stat = await fs.stat(file);
  const hit = cashCache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.bills;
  let rows, mtime;
  try {
    ({ data: rows, mtime } = await readJsonStable(file));
  } catch (e) {
    if (hit) return hit.bills; // file mid-update: keep using the last good copy
    throw e;
  }
  const bills = new Map();
  for (const r of rows) {
    const bill = str(r.BILL).trim().toUpperCase();
    if (!bill || r._deleted) continue;
    let b = bills.get(bill);
    if (!b) { b = { bill, vr: '', val: 0, tx: 0, iamt: 0, camt: 0, date: null }; bills.set(bill, b); }
    const vr = str(r.VR);
    if (vr > b.vr) b.vr = vr;
    b.val += num(r.CR);
    const code = str(r.C_CODE).slice(0, 2);
    if (code === 'GG') { b.tx += num(r.DR); if (!b.date) b.date = toIst(r.DT_BILL); }
    else if (code === 'VI') b.iamt += num(r.DR);
    else if (code === 'VG') b.camt += num(r.DR);
  }
  cashCache.set(file, { mtime, bills });
  return bills;
}

// ---------------------------------------------------------------- purchase documents from CASH (for GSTR-2A matching)
// One entry per voucher that carries GST input:
//   PB / PD purchase bills: invoice no in BILL, date in DT_BILL, supplier GSTIN in PUR_GST / AC_GST
//   JB journal entries (expenses): invoice no only in the narration ("INV#…", "bill#…"), GSTIN on the creditor line (AC_GST)
const docsCache = new Map(); // file -> { mtime, docs }
const normInv = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
const INV_IN_REMARK = /(?:INV(?:OICE)?|BILL)\s*(?:NO\.?)?\s*[#:.]\s*([A-Z0-9][A-Z0-9\/-]*)/i;

async function loadPurchaseDocs(file) {
  const stat = await fs.stat(file);
  const hit = docsCache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.docs;
  let rows, mtime;
  try {
    ({ data: rows, mtime } = await readJsonStable(file));
  } catch (e) {
    if (hit) return hit.docs;
    throw e;
  }
  const byVr = new Map();
  for (const r of rows) {
    if (r._deleted) continue;
    const vr = str(r.VR);
    if (!/^(PB|PD|JB)-/.test(vr)) continue;
    if (!byVr.has(vr)) byVr.set(vr, []);
    byVr.get(vr).push(r);
  }
  const docs = [];
  byVr.forEach((lines, vr) => {
    const type = vr.slice(0, 2);
    let tax = 0, taxable = 0, value = 0, gstin = '', bill = '', billDate = null, party = '', partyCode = '', expenseCode = '', taxCode = '';
    for (const r of lines) {
      const code = str(r.C_CODE).slice(0, 2);
      const dr = num(r.DR), cr = num(r.CR);
      if (code === 'VI' || code === 'VG' || code === 'VC') { tax += dr - cr; if (!taxCode && dr > 0) taxCode = str(r.C_CODE).trim(); }
      else if (code === 'GG' || code === 'EE') { taxable += dr - cr; if (!expenseCode && dr > 0) expenseCode = str(r.C_CODE).trim(); }
      const g = str(r.PUR_GST || r.AC_GST).trim().toUpperCase();
      if (!gstin && /^\d{2}[A-Z0-9]{13}$/.test(g)) gstin = g;
      if (cr > 0 && str(r.AC_GST).trim()) { value = cr; party = str(r.AC_NAME || r.PUR_NAME); partyCode = str(r.C_CODE).trim(); }
      if (!bill && str(r.BILL).trim()) bill = str(r.BILL).trim();
      if (!billDate && r.DT_BILL) billDate = toIst(r.DT_BILL);
      if (!bill) { const m = INV_IN_REMARK.exec(str(r.REMARK)); if (m) bill = m[1]; }
    }
    if (Math.abs(tax) < 0.01 || !gstin) return; // only vouchers with GST input from a registered supplier
    const d = billDate || toIst(lines[0].DATE);
    docs.push({
      vr, type, bill, billNorm: normInv(bill), gstin, party: party.trim(),
      date: dmy(d), period: pOf(d), entryDate: dmy(toIst(lines[0].DATE)),
      taxable: r2(taxable), gst: r2(tax), value: r2(value), partyCode, expenseCode, taxCode,
    });
  });
  docsCache.set(file, { mtime, docs });
  return docs;
}

// purchase documents of the FY of the given period and the previous FY (quarterly filers report late)
async function purchaseDocsAround(per) {
  const prevYear = `${per.slice(0, 2)}${Number(per.slice(2)) - 1}`;
  const files = new Set();
  for (const p of [per, prevYear]) { const f = await findCashJson(p); if (f) files.add(f); }
  const out = [];
  for (const f of files) out.push(...(await loadPurchaseDocs(f)));
  return out;
}

async function matchGstr2b(data, periods) {
  const notes = [];
  const bills = new Map();
  const files = new Set();
  for (const per of periods) {
    const f = await findCashJson(per);
    if (f) files.add(f); else notes.push(`CASH.json for FY folder ${fyFolderOf(per)} not found (period ${per}).`);
  }
  for (const f of files) (await loadCashBills(f)).forEach((v, k) => { if (!bills.has(k)) bills.set(k, v); });
  if (!bills.size) { notes.push('No system data (CASH.json) available - nothing matched.'); return { data, notes }; }

  const evaluate = (row, pairs, reasons = '') => {
    for (const [label, p, sv] of pairs) if (Math.abs(p - sv) > MISMATCH_TOL) reasons += `${label} mis: P=${fmt(p)} S=${fmt(sv)} | `;
    if (!reasons) { row.MISMATCH = 'No mismatch'; row.REASON = 'Matched perfectly'; }
    else { row.MISMATCH = 'Value Mismatch'; row.REASON = reasons.slice(0, 200); }
  };

  for (const row of data.b2b) {
    const b = bills.get(row.INUM.trim().toUpperCase());
    if (!b) { row.MISMATCH = 'Sys Missing'; row.REASON = 'INVOICE NOT FOUND IN SYSTEM DATA'; continue; }
    const sysDate = dmy(b.date);
    const dateReason = sysDate && row.IDT !== sysDate ? `date mismatch portal date ${row.IDT} and system date ${sysDate} | ` : '';
    evaluate(row, [['Inv Val', row.VAL, b.val], ['TxVal', row.TXVAL, b.tx], ['IGST', row.IAMT, b.iamt], ['CGST', row.CAMT, r2(b.camt / 2)]], dateReason);
  }

  // system purchase bills (PB vouchers) that are missing from GSTR-2B
  const have = new Set(data.b2b.map((r) => r.INUM.trim().toUpperCase()));
  bills.forEach((b) => {
    if (!b.vr.includes('PB') || !b.date) return;
    const per = pOf(b.date);
    if (!periods.includes(per) || have.has(b.bill)) return;
    data.b2b.push({
      RET_PER: per, CTIN: '', CFS: '', INUM: b.bill, IDT: dmy(b.date), VAL: r2(b.val), POS: '', RCHRG: '', ETIN: '', INV_TYP: '', CFLAG: '', DIFF_PCT: 0,
      SRCTYP: '', IRN: '', IRNDATE: '', ITEM_NUM: 0, RT: 0, TXVAL: r2(b.tx), IAMT: r2(b.iamt), CAMT: r2(b.camt / 2), SAMT: r2(b.camt / 2), CSAMT: 0,
      MISMATCH: 'Missing Portal', REASON: 'INVOICE NOT FOUND IN GSTR2B',
    });
  });

  for (const row of data.cdnr) {
    const b = bills.get(row.NT_NUM.trim().toUpperCase());
    if (!b) { row.MISMATCH = 'Sys Missing'; row.REASON = 'NOTE NOT FOUND IN SYSTEM DATA'; continue; }
    evaluate(row, [['Val', row.VAL, b.val], ['TxVal', row.TXVAL, b.tx], ['IGST', row.IAMT, b.iamt], ['CGST', row.CAMT, r2(b.camt / 2)]]);
  }
  return { data, notes };
}

module.exports = {
  deepFind, num, str, r2, bad,
  parseGstr1B2B, parseGstr1B2CS, parseGstr1CDNR, parseGstr1DocIss, parseGstr1Hsn, parseGstr2bB2B, parseGstr2bCDNR,
  hasLocalGstr1, hasLocalGstr2b, loadGstr1Local, loadGstr2bLocal, gstr1Dir, gstr2bDir,
  readCsv, convertDate, matchGstr1, matchGstr2b, findCashJson, toIst, readJsonStable, purchaseDocsAround, normInv,
};
