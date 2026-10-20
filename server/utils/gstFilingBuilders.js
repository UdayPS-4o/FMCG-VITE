// Builds the GSTR-1 JSON (from the system CSV exports) and GSTR-3B payloads that are sent to the portal.
// Port of the BuildB2B / BuildB2CS / BuildCDNR / BuildDOC / BuildHSN procedures in GSTR1_PORTAL_UPLOAD.prg
// and of GeneratePayload / cmdLoadCSV in GSTR3B_PORTAL_UPLOAD.PRG.
const { readCsv, convertDate, num, str, r2 } = require('./gstReturnData');

const money = (n) => r2(num(n));
const taxSplit = (txval, rate, pos, ownState) => {
  if (String(pos) === String(ownState)) {
    const c = r2((txval * rate) / 200);
    return { iamt: 0, camt: c, samt: c, intra: true };
  }
  return { iamt: r2((txval * rate) / 100), camt: 0, samt: 0, intra: false };
};
const rchrgOf = (v) => {
  const c = str(v).trim().charAt(0).toUpperCase();
  return c === 'Y' || c === 'N' ? c : 'N';
};
const itmDet = (txval, rate, t, csamt) => {
  const det = { txval: money(txval), rt: money(rate) };
  if (t.iamt > 0) det.iamt = t.iamt;
  if (t.camt > 0) { det.camt = t.camt; det.samt = t.samt; }
  det.csamt = money(csamt);
  return det;
};

// stable sort by two string keys (the VFP SQL ORDER BY)
const sortBy = (rows, a, b) => rows
  .map((r, i) => [r, i])
  .sort((x, y) => (x[0][a] < y[0][a] ? -1 : x[0][a] > y[0][a] ? 1 : x[0][b] < y[0][b] ? -1 : x[0][b] > y[0][b] ? 1 : x[1] - y[1]))
  .map((x) => x[0]);

async function buildB2B(ownState) {
  const csv = await readCsv('B2B.CSV');
  if (!csv) return { items: [], gross: 0, missing: 'B2B.CSV' };
  // GSTIN, name, inum, idt, val, pos, rchrg, applrt, invtyp, egstin, rate, txval, csamt
  const rows = csv.filter((r) => r[0] && !/gstin/i.test(r[0])).map((r) => ({
    gstin: r[0].toUpperCase(), inum: r[2], idt: convertDate(r[3]), val: num(r[4]), pos: r[5].slice(0, 2), rchrg: rchrgOf(r[6]),
    invtyp: r[8] || '', rate: num(r[10]), txval: num(r[11]), csamt: num(r[12]),
  }));
  const out = [];
  let gross = 0;
  let curCtin = null, curInv = null, ctinObj = null, invObj = null;
  for (const r of sortBy(rows, 'gstin', 'inum')) {
    if (r.gstin !== curCtin) { ctinObj = { ctin: r.gstin, inv: [] }; out.push(ctinObj); curCtin = r.gstin; curInv = null; }
    if (r.inum !== curInv) {
      const t = (r.invtyp || '').toUpperCase();
      const typ = t.includes('DEEMED') || t === 'DE' ? 'DE' : t.includes('WITH PAYMENT') || t === 'SEWP' ? 'SEWP' : t.includes('WITHOUT PAYMENT') || t === 'SEWOP' ? 'SEWOP' : 'R';
      invObj = { inum: r.inum, idt: r.idt, val: money(r.val), pos: r.pos, rchrg: r.rchrg, inv_typ: typ, itms: [] };
      ctinObj.inv.push(invObj);
      curInv = r.inum;
      gross += r.val;
    }
    const tax = taxSplit(r.txval, r.rate, r.pos, ownState);
    invObj.itms.push({ num: invObj.itms.length + 1, itm_det: itmDet(r.txval, r.rate, tax, r.csamt) });
  }
  return { items: out, gross };
}

async function buildB2CS(ownState) {
  const csv = await readCsv('b2cs.csv');
  if (!csv) return { items: [], gross: 0, missing: 'b2cs.csv' };
  // Type, POS, rate, applicable %, txval, cess, e-commerce gstin
  const out = [];
  let gross = 0;
  for (const r of csv) {
    const typ = (r[0] || '').trim();
    if (!typ || /^type$/i.test(typ)) continue;
    const pos = r[1].slice(0, 2);
    const rate = num(r[2]);
    const txval = num(r[4]);
    const csamt = num(r[5]);
    gross += txval;
    const t = taxSplit(txval, rate, pos, ownState);
    const item = { sply_ty: t.intra ? 'INTRA' : 'INTER', rt: money(rate), typ, pos, txval: money(txval) };
    if (t.iamt > 0) item.iamt = t.iamt;
    if (t.camt > 0) { item.camt = t.camt; item.samt = t.samt; }
    if (csamt > 0) item.csamt = money(csamt);
    out.push(item);
  }
  return { items: out, gross };
}

async function buildCDNR(ownState) {
  const csv = await readCsv('cdnr.csv');
  if (!csv) return { items: [], gross: 0, missing: 'cdnr.csv' };
  // GSTIN, name, ntno, ntdt, nttyp, pos, rchrg, ntsup, ntval, applrt, rate, txval, csamt
  const rows = csv.filter((r) => r[0] && !/gstin/i.test(r[0])).map((r) => ({
    gstin: r[0].toUpperCase(), ntno: r[2], ntdt: convertDate(r[3]), nttyp: r[4] || '', pos: r[5].slice(0, 2), rchrg: rchrgOf(r[6]),
    ntval: num(r[8]), rate: num(r[10]), txval: num(r[11]), csamt: num(r[12]),
  }));
  const out = [];
  let gross = 0;
  let curCtin = null, curNt = null, ctinObj = null, ntObj = null;
  for (const r of sortBy(rows, 'gstin', 'ntno')) {
    if (r.gstin !== curCtin) { ctinObj = { ctin: r.gstin, nt: [] }; out.push(ctinObj); curCtin = r.gstin; curNt = null; }
    if (r.ntno !== curNt) {
      let ty = r.nttyp.trim().charAt(0).toUpperCase();
      if (ty !== 'C' && ty !== 'D') ty = r.nttyp.toUpperCase().includes('CREDIT') ? 'C' : 'D';
      ntObj = { nt_num: r.ntno, nt_dt: r.ntdt, ntty: ty, val: money(r.ntval), pos: r.pos, rchrg: r.rchrg, inv_typ: 'R', itms: [] };
      ctinObj.nt.push(ntObj);
      curNt = r.ntno;
      gross += Math.abs(r.ntval);
    }
    const t = taxSplit(r.txval, r.rate, r.pos, ownState);
    ntObj.itms.push({ num: ntObj.itms.length + 1, itm_det: itmDet(r.txval, r.rate, t, r.csamt) });
  }
  return { items: out, gross };
}

const DOC_TYPES = [
  'Invoices for outward supply', 'Invoices for inward supply from unregistered person', 'Revised Invoice', 'Debit Note', 'Credit Note',
  'Receipt Voucher', 'Payment Voucher', 'Refund Voucher', 'Delivery Challan for job work', 'Delivery Challan for supply on approval',
  'Delivery Challan in case of liquid gas', 'Delivery Challan in case other than by way of supply (excluding at S no. 9 to 11)',
];

async function buildDoc() {
  const csv = await readCsv('DOC.CSV');
  if (!csv) return { items: [], missing: 'DOC.CSV' };
  // Nature of document, from, to, total, cancelled
  const docs = csv.filter((r) => r[0] && !/nature of document/i.test(r[0])).map((r) => {
    const idx = DOC_TYPES.findIndex((t) => t.toUpperCase() === r[0].trim().toUpperCase());
    return { nat: r[0].trim(), from: r[1], to: r[2], total: Math.trunc(num(r[3])), cancel: Math.trunc(num(r[4])), docNum: idx + 1 };
  });
  docs.sort((a, b) => a.docNum - b.docNum); // Array.sort is stable
  const out = [];
  let last = null, grp = null;
  for (const d of docs) {
    if (d.nat !== last) { grp = { doc_num: d.docNum, doc_typ: d.nat, docs: [] }; out.push(grp); last = d.nat; }
    grp.docs.push({ num: grp.docs.length + 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancel, net_issue: d.total - d.cancel });
  }
  return { items: out };
}

async function buildHsnFile(name) {
  const csv = await readCsv(name);
  if (!csv) return null;
  // HSN, description, UQC, qty, total value, taxable value, iamt, camt, samt, cess, rate
  const out = [];
  for (const r of csv) {
    const hsn = (r[0] || '').trim();
    if (!hsn || /^hsn(\/sac)?$/i.test(hsn)) continue;
    let uqc = (r[2] || '').trim();
    uqc = uqc.includes('-') ? uqc.slice(0, uqc.indexOf('-')).trim() : uqc.slice(0, 3);
    if (!uqc) uqc = 'PCS';
    const desc = (r[1] || '').trim();
    out.push({
      num: out.length + 1, hsn_sc: hsn, val: 0, txval: money(r[5]), iamt: money(r[6]), camt: money(r[7]), samt: money(r[8]), csamt: money(r[9]),
      desc, user_desc: desc, uqc, qty: money(r[3]), rt: money(r[10]),
    });
  }
  return out;
}

async function buildHsn() {
  const b2b = await buildHsnFile('hsn(b2b).csv');
  const b2c = await buildHsnFile('hsn(b2c).csv');
  const hsn = {};
  if (b2b && b2b.length) hsn.hsn_b2b = b2b;
  if (b2c && b2c.length) hsn.hsn_b2c = b2c;
  return { items: hsn, missing: !b2b && !b2c ? 'hsn(b2b).csv / hsn(b2c).csv' : undefined };
}

async function buildGstr1Payload({ gstin, fp, modules }) {
  const own = gstin.slice(0, 2);
  const payload = { gstin, fp };
  const counts = {};
  const missing = [];
  let gross = 0;
  const take = (key, res, field = 'items') => {
    if (res.missing) missing.push(res.missing);
    const v = res[field];
    const n = Array.isArray(v) ? v.length : Object.keys(v || {}).length;
    counts[key] = n;
    if (n) payload[key] = v;
    gross += res.gross || 0;
  };
  if (modules.b2b) take('b2b', await buildB2B(own));
  if (modules.b2cs) take('b2cs', await buildB2CS(own));
  if (modules.cdnr) take('cdnr', await buildCDNR(own));
  if (modules.hsn) take('hsn', await buildHsn());
  if (modules.doc) {
    const d = await buildDoc();
    if (d.missing) missing.push(d.missing);
    counts.doc_issue = d.items.length;
    if (d.items.length) payload.doc_issue = { doc_det: d.items };
  }
  return { payload, counts, missing, gross: r2(gross) };
}

// ---------------------------------------------------------------- GSTR-3B
async function parseGstr3Csv() {
  const csv = await readCsv('GSTR-3.csv');
  if (!csv) return null;
  const z = () => ({ txval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
  const osup = { osup_det: z(), osup_zero: z(), osup_nil_exmp: z(), isup_rev: z(), osup_nongst: z() };
  const itc = { itc_avl_oth: z(), itc_rev_oth: z(), itc_inelg_oth: z() };
  // c_code,c_name,rem,gst_tax,cess_tax,goods,sgst,cgst,igst,cess
  for (const r of csv.slice(1)) {
    if (r.length < 10) continue;
    const rem = r[2].toUpperCase();
    const goods = num(r[5]), sgst = num(r[6]), cgst = num(r[7]), igst = num(r[8]), cess = num(r[9]);
    const add = (t, sign) => { t.txval += sign * goods; t.igst += sign * igst; t.cgst += sign * cgst; t.sgst += sign * sgst; t.cess += sign * cess; };
    if (rem === 'SALE') add(osup.osup_det, 1);
    else if (rem === 'SALE RETURN') add(osup.osup_det, -1);
    else if (rem === 'PURCHASE' || rem === 'PURCHASE DIRECT' || rem === 'OTHER PURCHASE JB') add(itc.itc_avl_oth, 1);
    else if (rem === 'PURCHASE RETURN') add(itc.itc_avl_oth, -1);
  }
  for (const t of [...Object.values(osup), ...Object.values(itc)]) for (const k of Object.keys(t)) t[k] = r2(t[k]);
  return { osup, itc };
}

// osup / itc: { <row_id>: {txval, igst, cgst, sgst, cess} } as edited in the browser
function buildGstr3bPayload({ gstin, fp, osup, itc }) {
  const n = (v) => r2(num(v));
  const o = (id) => osup[id] || {};
  const c = (id) => itc[id] || {};
  const full = (t) => ({ txval: n(t.txval), iamt: n(t.igst), camt: n(t.cgst), samt: n(t.sgst), csamt: n(t.cess) });
  const tax4 = (t) => ({ ty: 'OTH', iamt: n(t.igst), camt: n(t.cgst), samt: n(t.sgst), csamt: n(t.cess) });
  const avl = c('itc_avl_oth'), rev = c('itc_rev_oth');
  return {
    gstin,
    ret_period: fp,
    sup_details: {
      osup_det: full(o('osup_det')),
      osup_zero: { txval: n(o('osup_zero').txval), iamt: n(o('osup_zero').igst), csamt: n(o('osup_zero').cess) },
      osup_nil_exmp: { txval: n(o('osup_nil_exmp').txval) },
      isup_rev: full(o('isup_rev')),
      osup_nongst: { txval: n(o('osup_nongst').txval) },
    },
    itc_elg: {
      itc_avl: [tax4(avl)],
      itc_rev: [tax4(rev)],
      itc_net: { camt: n(num(avl.cgst) - num(rev.cgst)), samt: n(num(avl.sgst) - num(rev.sgst)), iamt: n(num(avl.igst) - num(rev.igst)), csamt: n(num(avl.cess) - num(rev.cess)) },
      itc_inelg: [tax4(c('itc_inelg_oth'))],
    },
  };
}

// GSTN auto-populated liabilities (AUTOLIAB). Nodes carry a "subtotal" object (or are the figures themselves).
function figuresOf(node) {
  if (!node || typeof node !== 'object') return null;
  const f = node.subtotal && typeof node.subtotal === 'object' ? node.subtotal : node;
  return { txval: num(f.txval), igst: num(f.iamt), cgst: num(f.camt), sgst: num(f.samt), cess: num(f.csamt) };
}
function findKeyed(obj, test, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach((x) => findKeyed(x, test, out)); return out; }
  for (const [k, v] of Object.entries(obj)) {
    if (test(k)) out.push([k, v]);
    findKeyed(v, test, out);
  }
  return out;
}
function parseAutoLiab(json) {
  const z = () => ({ txval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
  const pickOne = (key) => {
    const hit = findKeyed(json, (k) => k === key)[0];
    return (hit && figuresOf(hit[1])) || z();
  };
  const sumItc = (prefix) => {
    const t = z();
    const re = new RegExp(`^${prefix}[1-5]?$`);
    for (const [, v] of findKeyed(json, (k) => re.test(k))) {
      const f = figuresOf(v);
      if (!f) continue;
      t.igst += f.igst; t.cgst += f.cgst; t.sgst += f.sgst; t.cess += f.cess;
    }
    for (const k of Object.keys(t)) t[k] = r2(t[k]);
    return t;
  };
  const osup = { osup_3_1a: pickOne('osup_3_1a'), osup_3_1b: pickOne('osup_3_1b'), osup_3_1c: pickOne('osup_3_1c'), isup_3_1d: pickOne('isup_3_1d'), osup_3_1e: pickOne('osup_3_1e') };
  const itc = { itc_avl: sumItc('itc4a'), itc_rev: sumItc('itc4b'), itc_inelg: sumItc('itc4d') };
  itc.itc_net = {
    txval: 0,
    igst: r2(itc.itc_avl.igst - itc.itc_rev.igst), cgst: r2(itc.itc_avl.cgst - itc.itc_rev.cgst),
    sgst: r2(itc.itc_avl.sgst - itc.itc_rev.sgst), cess: r2(itc.itc_avl.cess - itc.itc_rev.cess),
  };
  return { osup, itc };
}

function buildOffsetPayload({ gstin, fp, pditc, pdcash }) {
  const n = (v) => r2(num(v));
  const pi = pditc || {}, pc = pdcash || {};
  return {
    gstin,
    ret_period: fp,
    pditc: {
      liab_ldg_id: Math.trunc(num(pi.liab_id)), trans_typ: 30002, i_pdi: n(pi.i_pdi), i_pdc: n(pi.i_pdc), i_pds: n(pi.i_pds),
      c_pdi: n(pi.c_pdi), c_pdc: n(pi.c_pdc), s_pdi: n(pi.s_pdi), s_pds: n(pi.s_pds), cs_pdcs: n(pi.cs_pdcs),
    },
    pdcash: [{
      liab_ldg_id: Math.trunc(num(pc.liab_id)), trans_typ: 30002, ipd: n(pc.ipd), cpd: n(pc.cpd), spd: n(pc.spd), cspd: n(pc.cspd),
      i_intrpd: n(pc.i_intr), c_intrpd: n(pc.c_intr), s_intrpd: n(pc.s_intr), cs_intrpd: n(pc.cs_intr), c_lfeepd: n(pc.c_fee), s_lfeepd: n(pc.s_fee),
    }],
  };
}

module.exports = { buildGstr1Payload, parseGstr3Csv, buildGstr3bPayload, parseAutoLiab, buildOffsetPayload };
