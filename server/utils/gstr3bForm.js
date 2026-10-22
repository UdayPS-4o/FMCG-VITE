// GSTR-3B form model shared by the routes and the browser.
// Uses GSTN field names throughout (iamt / camt / samt / csamt) so it maps 1:1 onto the RETSAVE payload,
// AUTOLIAB (auto-populated liability / ITC) and RETSUM (saved return summary).
const fs = require('fs').promises;
const { num, r2, readCsv, findCashJson, toIst } = require('./gstReturnData');

const TAX = ['iamt', 'camt', 'samt', 'csamt'];
const FULL = ['txval', ...TAX];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, r2(num(o && o[k]))]));
const full = (o) => pick(o, FULL);
const tax = (o) => pick(o, TAX);

const SUP_KEYS = ['osup_det', 'osup_zero', 'osup_nil_exmp', 'isup_rev', 'osup_nongst'];
const AVL_TY = ['IMPG', 'IMPS', 'ISRC', 'ISD', 'OTH'];
const REV_TY = ['RUL', 'OTH'];
const INELG_TY = ['RUL', 'OTH'];

function emptyForm() {
  return {
    sup: Object.fromEntries(SUP_KEYS.map((k) => [k, full()])),
    eco: { eco_sup: full(), eco_reg_sup: full() },
    inter: { unreg_details: [], comp_details: [], uin_details: [] },
    itc_avl: Object.fromEntries(AVL_TY.map((t) => [t, tax()])),
    itc_rev: Object.fromEntries(REV_TY.map((t) => [t, tax()])),
    itc_inelg: Object.fromEntries(INELG_TY.map((t) => [t, tax()])),
    inward: { GST: { inter: 0, intra: 0 }, NONGST: { inter: 0, intra: 0 } },
    intr: tax(),
    ltfee: tax(),
  };
}

// fill any missing parts of a form coming from the browser
function normalizeForm(f = {}) {
  const e = emptyForm();
  const out = emptyForm();
  for (const k of SUP_KEYS) out.sup[k] = full(f.sup && f.sup[k]);
  out.eco.eco_sup = full(f.eco && f.eco.eco_sup);
  out.eco.eco_reg_sup = full(f.eco && f.eco.eco_reg_sup);
  for (const k of Object.keys(e.inter)) {
    out.inter[k] = (Array.isArray(f.inter && f.inter[k]) ? f.inter[k] : [])
      .map((x) => ({ pos: String(x.pos || '').padStart(2, '0').slice(-2), txval: r2(num(x.txval)), iamt: r2(num(x.iamt)) }))
      .filter((x) => x.pos !== '00' && (x.txval || x.iamt));
  }
  for (const t of AVL_TY) out.itc_avl[t] = tax(f.itc_avl && f.itc_avl[t]);
  for (const t of REV_TY) out.itc_rev[t] = tax(f.itc_rev && f.itc_rev[t]);
  for (const t of INELG_TY) out.itc_inelg[t] = tax(f.itc_inelg && f.itc_inelg[t]);
  for (const t of ['GST', 'NONGST']) {
    const w = (f.inward && f.inward[t]) || {};
    out.inward[t] = { inter: r2(num(w.inter)), intra: r2(num(w.intra)) };
  }
  out.intr = tax(f.intr);
  out.ltfee = tax(f.ltfee);
  return out;
}

const sumTax = (rows) => {
  const t = tax();
  for (const r of rows) for (const k of TAX) t[k] = r2(t[k] + num(r[k]));
  return t;
};
const itcNet = (form) => {
  const avl = sumTax(Object.values(form.itc_avl));
  const rev = sumTax(Object.values(form.itc_rev));
  return Object.fromEntries(TAX.map((k) => [k, r2(avl[k] - rev[k])]));
};

// ---------------------------------------------------------------- RETSAVE payload
function buildPayload({ gstin, fp, form }) {
  const f = normalizeForm(form);
  const s = f.sup;
  return {
    gstin,
    ret_period: fp,
    sup_details: {
      osup_det: full(s.osup_det),
      osup_zero: pick(s.osup_zero, ['txval', 'iamt', 'csamt']),
      osup_nil_exmp: pick(s.osup_nil_exmp, ['txval']),
      isup_rev: full(s.isup_rev),
      osup_nongst: pick(s.osup_nongst, ['txval']),
    },
    eco_dtls: { eco_sup: full(f.eco.eco_sup), eco_reg_sup: pick(f.eco.eco_reg_sup, ['txval']) },
    inter_sup: f.inter,
    itc_elg: {
      itc_avl: AVL_TY.map((ty) => ({ ty, ...f.itc_avl[ty] })),
      itc_rev: REV_TY.map((ty) => ({ ty, ...f.itc_rev[ty] })),
      itc_net: itcNet(f),
      itc_inelg: INELG_TY.map((ty) => ({ ty, ...f.itc_inelg[ty] })),
    },
    inward_sup: {
      isup_details: ['GST', 'NONGST'].map((ty) => ({ ty, inter: f.inward[ty].inter, intra: f.inward[ty].intra })),
    },
    intr_ltfee: { intr_details: f.intr, ltfee_details: f.ltfee },
  };
}

// ---------------------------------------------------------------- AUTOLIAB -> form
function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const v of Object.values(obj)) {
    const hit = findKey(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
const sub = (node) => (node && typeof node === 'object' && node.subtotal !== undefined ? node.subtotal : node);

function formFromAutoLiab(json) {
  const f = emptyForm();
  const map = { osup_det: 'osup_3_1a', osup_zero: 'osup_3_1b', osup_nil_exmp: 'osup_3_1c', isup_rev: 'isup_3_1d', osup_nongst: 'osup_3_1e' };
  for (const [k, src] of Object.entries(map)) f.sup[k] = full(sub(findKey(json, src)));
  f.eco.eco_sup = full(sub(findKey(json, 'esup_3_1_1a')));
  f.eco.eco_reg_sup = full(sub(findKey(json, 'esup_3_1_1b')));
  const interMap = { unreg_details: 'osup_unreg_3_2', comp_details: 'osup_comp_3_2', uin_details: 'osup_uin_3_2' };
  for (const [k, src] of Object.entries(interMap)) {
    const rows = sub(findKey(json, src));
    f.inter[k] = (Array.isArray(rows) ? rows : [])
      .filter((x) => x && x.pos)
      .map((x) => ({ pos: String(x.pos), txval: r2(num(x.txval)), iamt: r2(num(x.iamt)) }));
  }
  const itcMap = [
    ['itc_avl', 'IMPG', 'itc4a1'], ['itc_avl', 'IMPS', 'itc4a2'], ['itc_avl', 'ISRC', 'itc4a3'], ['itc_avl', 'ISD', 'itc4a4'], ['itc_avl', 'OTH', 'itc4a5'],
    ['itc_rev', 'RUL', 'itc4b1'], ['itc_rev', 'OTH', 'itc4b2'],
    ['itc_inelg', 'RUL', 'itc4d1'], ['itc_inelg', 'OTH', 'itc4d2'],
  ];
  for (const [grp, ty, src] of itcMap) f[grp][ty] = tax(sub(findKey(json, src)));
  const errs = findKey(json, 'error');
  return {
    form: f,
    meta: {
      r1fildt: findKey(json, 'r1fildt') || '',
      r2bgendt: findKey(json, 'r2bgendt') || '',
      r3bgendt: findKey(json, 'r3bgendt') || '',
      errors: Array.isArray(errs) ? errs.map((e) => (typeof e === 'string' ? e : e.message || JSON.stringify(e))) : [],
    },
  };
}

// ---------------------------------------------------------------- RETSUM -> form + payment details
function formFromRetsum(json) {
  const f = emptyForm();
  const sd = findKey(json, 'sup_details') || {};
  for (const k of SUP_KEYS) f.sup[k] = full(sd[k]);
  const eco = findKey(json, 'eco_dtls') || {};
  f.eco.eco_sup = full(eco.eco_sup);
  f.eco.eco_reg_sup = full(eco.eco_reg_sup);
  const inter = findKey(json, 'inter_sup') || {};
  for (const k of Object.keys(f.inter)) {
    f.inter[k] = (Array.isArray(inter[k]) ? inter[k] : []).map((x) => ({ pos: String(x.pos || ''), txval: r2(num(x.txval)), iamt: r2(num(x.iamt)) }));
  }
  const itc = findKey(json, 'itc_elg') || {};
  const byTy = (arr, tys) => Object.fromEntries(tys.map((t) => [t, tax((Array.isArray(arr) ? arr : []).find((x) => x.ty === t))]));
  f.itc_avl = byTy(itc.itc_avl, AVL_TY);
  f.itc_rev = byTy(itc.itc_rev, REV_TY);
  f.itc_inelg = byTy(itc.itc_inelg, INELG_TY);
  const inw = (findKey(json, 'inward_sup') || {}).isup_details;
  for (const t of ['GST', 'NONGST']) {
    const row = (Array.isArray(inw) ? inw : []).find((x) => x.ty === t) || {};
    f.inward[t] = { inter: r2(num(row.inter)), intra: r2(num(row.intra)) };
  }
  const il = findKey(json, 'intr_ltfee') || {};
  f.intr = tax(il.intr_details);
  f.ltfee = tax(il.ltfee_details);

  // liability ledgers (needed for RETOFFSET) and what the portal says is payable
  const tp = findKey(json, 'tx_pmt') || {};
  const heads = (x) => ({
    igst: x && x.igst ? { tx: num(x.igst.tx), intr: num(x.igst.intr), fee: num(x.igst.fee) } : { tx: 0, intr: 0, fee: 0 },
    cgst: x && x.cgst ? { tx: num(x.cgst.tx), intr: num(x.cgst.intr), fee: num(x.cgst.fee) } : { tx: 0, intr: 0, fee: 0 },
    sgst: x && x.sgst ? { tx: num(x.sgst.tx), intr: num(x.sgst.intr), fee: num(x.sgst.fee) } : { tx: 0, intr: 0, fee: 0 },
    cess: x && x.cess ? { tx: num(x.cess.tx), intr: num(x.cess.intr), fee: num(x.cess.fee) } : { tx: 0, intr: 0, fee: 0 },
  });
  const ledgers = (Array.isArray(tp.tx_py) ? tp.tx_py : []).map((x) => ({
    desc: x.tran_desc || '', liab_ldg_id: num(x.liab_ldg_id), trans_typ: num(x.trans_typ), payable: heads(x),
  }));
  return { form: f, ledgers, paid: { pditc: tp.pditc || null, pdcash: tp.pdcash || [] } };
}

// ---------------------------------------------------------------- system figures
// GSTR-3.csv (VFP export): SALE / SALE RETURN -> 3.1(a); PURCHASE / PURCHASE DIRECT / OTHER PURCHASE JB / PURCHASE RETURN -> 4A(5)
async function systemFromCsv() {
  const csv = await readCsv('GSTR-3.csv');
  if (!csv) return null;
  const sale = full();
  const itc = tax();
  for (const r of csv.slice(1)) {
    if (r.length < 10) continue;
    const rem = String(r[2]).toUpperCase();
    const v = { txval: num(r[5]), samt: num(r[6]), camt: num(r[7]), iamt: num(r[8]), csamt: num(r[9]) };
    const add = (t, sign, keys) => keys.forEach((k) => { t[k] = r2(t[k] + sign * v[k]); });
    if (rem === 'SALE') add(sale, 1, FULL);
    else if (rem === 'SALE RETURN') add(sale, -1, FULL);
    else if (['PURCHASE', 'PURCHASE DIRECT', 'OTHER PURCHASE JB'].includes(rem)) add(itc, 1, TAX);
    else if (rem === 'PURCHASE RETURN') add(itc, -1, TAX);
  }
  return { sale, itc, source: 'GSTR-3.csv' };
}

// CASH ledger, same rules as the VFP GSTR-3 export:
//   SB vouchers: credits = sales, debits = sale returns          (GG goods, VG CGST+SGST, VI IGST, VC cess)
//   PB / PD vouchers: debits = purchases, credits = returns;  JB: debit - credit (other purchases / reversals)
const cashMonthly = new Map(); // file -> { mtime, periods: Map<MMYYYY, {sale, itc}> }

async function cashSummaries(file) {
  const stat = await fs.stat(file);
  const hit = cashMonthly.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.periods;
  const rows = JSON.parse(await fs.readFile(file, 'utf8'));
  const periods = new Map();
  const get = (p) => {
    if (!periods.has(p)) periods.set(p, { goods: { s: 0, sr: 0 }, vg: { s: 0, sr: 0, p: 0 }, vi: { s: 0, sr: 0, p: 0 }, vc: { s: 0, sr: 0, p: 0 } });
    return periods.get(p);
  };
  for (const r of rows) {
    if (r._deleted || !r.DATE) continue;
    const code = String(r.C_CODE || '').slice(0, 2);
    if (!['GG', 'VG', 'VI', 'VC'].includes(code)) continue;
    const vt = String(r.VR || '').slice(0, 2);
    const d = toIst(r.DATE);
    if (!d) continue;
    const p = get(`${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`);
    const dr = num(r.DR), cr = num(r.CR);
    const k = code === 'GG' ? 'goods' : code.toLowerCase();
    if (vt === 'SB') { p[k].s += cr; p[k].sr += dr; }
    else if (vt === 'PB' || vt === 'PD' || vt === 'JB') { if (k !== 'goods') p[k].p += dr - cr; }
  }
  cashMonthly.set(file, { mtime: stat.mtimeMs, periods });
  return periods;
}

async function systemFromCash(fp) {
  const file = await findCashJson(fp);
  if (!file) return null;
  const m = (await cashSummaries(file)).get(fp);
  if (!m) return { sale: full(), itc: tax(), source: `CASH (${fp}: no entries)` };
  const half = (v) => r2(v / 2);
  const vgS = m.vg.s - m.vg.sr;
  const sale = { txval: r2(m.goods.s - m.goods.sr), iamt: r2(m.vi.s - m.vi.sr), camt: half(vgS), samt: half(vgS), csamt: r2(m.vc.s - m.vc.sr) };
  const itc = { iamt: r2(m.vi.p), camt: half(m.vg.p), samt: half(m.vg.p), csamt: r2(m.vc.p) };
  return { sale, itc, source: 'CASH' };
}

// ---------------------------------------------------------------- diff (preview before save)
function flatten(obj, prefix = '', out = {}) {
  if (Array.isArray(obj)) {
    obj.forEach((x, i) => flatten(x, `${prefix}[${x && (x.ty || x.pos) ? x.ty || x.pos : i}]`, out));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = obj;
  return out;
}
function diffPayload(oldPayload, newPayload) {
  const a = flatten(oldPayload || {});
  const b = flatten(newPayload);
  const changes = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'gstin' || k === 'ret_period' || k.startsWith('tx_pmt') || k.startsWith('itc_elg.itc_net')) continue;
    if (!(k in b)) continue; // fields the payload does not send
    const x = num(a[k]), y = num(b[k]);
    if (typeof b[k] === 'number' && Math.abs(x - y) > 0.004) changes.push({ field: k, saved: x, now: y });
  }
  return changes;
}

// ---------------------------------------------------------------- RETOFFSET payload
// pditc: ITC set-off for the normal liability ledger; pdcash: one entry per liability ledger (normal + reverse charge)
function buildOffsetPayload({ gstin, fp, pditc, pdcash }) {
  const n = (v) => r2(num(v));
  const pi = pditc || {};
  const cashRows = (Array.isArray(pdcash) ? pdcash : [pdcash || {}]).filter(Boolean);
  return {
    gstin,
    ret_period: fp,
    pditc: {
      liab_ldg_id: Math.trunc(num(pi.liab_ldg_id)), trans_typ: Math.trunc(num(pi.trans_typ)) || 30002,
      i_pdi: n(pi.i_pdi), i_pdc: n(pi.i_pdc), i_pds: n(pi.i_pds), c_pdi: n(pi.c_pdi), c_pdc: n(pi.c_pdc),
      s_pdi: n(pi.s_pdi), s_pds: n(pi.s_pds), cs_pdcs: n(pi.cs_pdcs),
    },
    pdcash: cashRows.map((c) => ({
      liab_ldg_id: Math.trunc(num(c.liab_ldg_id)), trans_typ: Math.trunc(num(c.trans_typ)) || 30002,
      ipd: n(c.ipd), cpd: n(c.cpd), spd: n(c.spd), cspd: n(c.cspd),
      i_intrpd: n(c.i_intrpd), c_intrpd: n(c.c_intrpd), s_intrpd: n(c.s_intrpd), cs_intrpd: n(c.cs_intrpd),
      i_lfeepd: n(c.i_lfeepd), c_lfeepd: n(c.c_lfeepd), s_lfeepd: n(c.s_lfeepd), cs_lfeepd: n(c.cs_lfeepd),
    })),
  };
}

// ---------------------------------------------------------------- ledger balance (Get Cash & ITC Balance)
function parseLedgerBal(json) {
  const cb = (json && json.cash_bal) || {};
  const ib = (json && json.itc_bal) || {};
  const blk = (json && json.itc_blck_bal) || {};
  return {
    cash: { igst: num(cb.igst_tot_bal), cgst: num(cb.cgst_tot_bal), sgst: num(cb.sgst_tot_bal), cess: num(cb.cess_tot_bal) },
    itc: { igst: num(ib.igst_bal), cgst: num(ib.cgst_bal), sgst: num(ib.sgst_bal), cess: num(ib.cess_bal) },
    blocked: { igst: num(blk.igst_blck_bal), cgst: num(blk.cgst_blck_bal), sgst: num(blk.sgst_blck_bal), cess: num(blk.cess_blck_bal) },
  };
}

module.exports = {
  emptyForm, normalizeForm, buildPayload, formFromAutoLiab, formFromRetsum, systemFromCsv, systemFromCash,
  diffPayload, buildOffsetPayload, parseLedgerBal, itcNet,
};
