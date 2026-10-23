// GSTR-3B form model, rules and calculations used by the GSTR-3B tab (mirrors server/utils/gstr3bForm.js)

export type Tax = { iamt: number; camt: number; samt: number; csamt: number };
export type Full = Tax & { txval: number };
export type InterRow = { pos: string; txval: number; iamt: number };
export type SupKey = 'osup_det' | 'osup_zero' | 'osup_nil_exmp' | 'isup_rev' | 'osup_nongst';
export type AvlTy = 'IMPG' | 'IMPS' | 'ISRC' | 'ISD' | 'OTH';
export type RevTy = 'RUL' | 'OTH';
export type InterKey = 'unreg_details' | 'comp_details' | 'uin_details';

export interface Gstr3bForm {
  sup: Record<SupKey, Full>;
  eco: { eco_sup: Full; eco_reg_sup: Full };
  inter: Record<InterKey, InterRow[]>;
  itc_avl: Record<AvlTy, Tax>;
  itc_rev: Record<RevTy, Tax>;
  itc_inelg: Record<RevTy, Tax>;
  inward: { GST: { inter: number; intra: number }; NONGST: { inter: number; intra: number } };
  intr: Tax;
  ltfee: Tax;
}

export interface LiabLedger {
  desc: string;
  liab_ldg_id: number;
  trans_typ: number;
  payable: Record<'igst' | 'cgst' | 'sgst' | 'cess', { tx: number; intr: number; fee: number }>;
}

export const TAX_KEYS: (keyof Tax)[] = ['iamt', 'camt', 'samt', 'csamt'];
export const FULL_KEYS: (keyof Full)[] = ['txval', 'iamt', 'camt', 'samt', 'csamt'];
export const HEAD_LABEL: Record<keyof Full, string> = { txval: 'Taxable Value', iamt: 'IGST', camt: 'CGST', samt: 'SGST', csamt: 'Cess' };

export const SUP_ROWS: { key: SupKey; label: string; keys: (keyof Full)[] }[] = [
  { key: 'osup_det', label: '(a) Outward taxable supplies (other than zero rated, nil rated and exempted)', keys: FULL_KEYS },
  { key: 'osup_zero', label: '(b) Outward taxable supplies (zero rated)', keys: ['txval', 'iamt', 'csamt'] },
  { key: 'osup_nil_exmp', label: '(c) Other outward supplies (nil rated, exempted)', keys: ['txval'] },
  { key: 'isup_rev', label: '(d) Inward supplies (liable to reverse charge)', keys: FULL_KEYS },
  { key: 'osup_nongst', label: '(e) Non-GST outward supplies', keys: ['txval'] },
];
export const ECO_ROWS: { key: 'eco_sup' | 'eco_reg_sup'; label: string; keys: (keyof Full)[] }[] = [
  { key: 'eco_sup', label: '(i) Supplies on which e-commerce operator pays tax u/s 9(5)', keys: FULL_KEYS },
  { key: 'eco_reg_sup', label: '(ii) Supplies made by registered person through e-commerce operator u/s 9(5)', keys: ['txval'] },
];
export const INTER_ROWS: { key: InterKey; label: string }[] = [
  { key: 'unreg_details', label: 'Supplies made to Unregistered Persons' },
  { key: 'comp_details', label: 'Supplies made to Composition Taxable Persons' },
  { key: 'uin_details', label: 'Supplies made to UIN holders' },
];
export const AVL_ROWS: { ty: AvlTy; label: string }[] = [
  { ty: 'IMPG', label: '(1) Import of goods' },
  { ty: 'IMPS', label: '(2) Import of services' },
  { ty: 'ISRC', label: '(3) Inward supplies liable to reverse charge (other than 1 & 2)' },
  { ty: 'ISD', label: '(4) Inward supplies from ISD' },
  { ty: 'OTH', label: '(5) All other ITC' },
];
export const REV_ROWS: { ty: RevTy; label: string }[] = [
  { ty: 'RUL', label: '(1) As per rules 38, 42 & 43 of CGST Rules and section 17(5)' },
  { ty: 'OTH', label: '(2) Others' },
];
export const INELG_ROWS: { ty: RevTy; label: string }[] = [
  { ty: 'RUL', label: '(1) ITC reclaimed which was reversed under Table 4(B)(2) in earlier tax period' },
  { ty: 'OTH', label: '(2) Ineligible ITC under section 16(4) & ITC restricted due to PoS rules' },
];

export const STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const zTax = (): Tax => ({ iamt: 0, camt: 0, samt: 0, csamt: 0 });
export const zFull = (): Full => ({ txval: 0, ...zTax() });

export function emptyForm(): Gstr3bForm {
  return {
    sup: { osup_det: zFull(), osup_zero: zFull(), osup_nil_exmp: zFull(), isup_rev: zFull(), osup_nongst: zFull() },
    eco: { eco_sup: zFull(), eco_reg_sup: zFull() },
    inter: { unreg_details: [], comp_details: [], uin_details: [] },
    itc_avl: { IMPG: zTax(), IMPS: zTax(), ISRC: zTax(), ISD: zTax(), OTH: zTax() },
    itc_rev: { RUL: zTax(), OTH: zTax() },
    itc_inelg: { RUL: zTax(), OTH: zTax() },
    inward: { GST: { inter: 0, intra: 0 }, NONGST: { inter: 0, intra: 0 } },
    intr: zTax(),
    ltfee: zTax(),
  };
}

export const sumTax = (rows: Tax[]): Tax => {
  const t = zTax();
  rows.forEach((r) => TAX_KEYS.forEach((k) => (t[k] = r2(t[k] + (r[k] || 0)))));
  return t;
};
export const itcNet = (f: Gstr3bForm): Tax => {
  const a = sumTax(Object.values(f.itc_avl));
  const b = sumTax(Object.values(f.itc_rev));
  return { iamt: r2(a.iamt - b.iamt), camt: r2(a.camt - b.camt), samt: r2(a.samt - b.samt), csamt: r2(a.csamt - b.csamt) };
};

// ---------------------------------------------------------------- period rules
const periodNum = (fp: string) => Number(fp.slice(2)) * 100 + Number(fp.slice(0, 2));
// GSTN advisories: liability auto-populated from GSTR-1/1A/IFF is non-editable from the July-2025 tax period;
// Table 3.2 from the November-2025 tax period. Corrections go through GSTR-1A before GSTR-3B is filed.
export const liabilityLocked = (fp: string) => periodNum(fp) >= 202507;
export const table32Locked = (fp: string) => periodNum(fp) >= 202511;
export const LOCKED_SUP: SupKey[] = ['osup_det', 'osup_zero', 'osup_nil_exmp', 'osup_nongst'];

// returns cannot be filed after three years from the due date (20th of the following month); enforced from July 2025
export function timeBar(fp: string) {
  const m = Number(fp.slice(0, 2));
  const y = Number(fp.slice(2));
  const due = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 20);
  const bar = new Date(due);
  bar.setFullYear(bar.getFullYear() + 3);
  return { due, bar, barred: new Date() > bar };
}

// copy the hard-locked parts of the auto-populated return into the form
export function applyLocked(form: Gstr3bForm, auto: Gstr3bForm, fp: string): Gstr3bForm {
  const f: Gstr3bForm = JSON.parse(JSON.stringify(form));
  if (liabilityLocked(fp)) {
    LOCKED_SUP.forEach((k) => (f.sup[k] = { ...auto.sup[k] }));
    f.eco = JSON.parse(JSON.stringify(auto.eco));
  }
  if (table32Locked(fp)) f.inter = JSON.parse(JSON.stringify(auto.inter));
  return f;
}

// ---------------------------------------------------------------- payment / offset
export type Heads = { igst: number; cgst: number; sgst: number; cess: number };
export interface LedgerBal { cash: Heads; itc: Heads; blocked: Heads }
export interface PdItc { liab_ldg_id: number; trans_typ: number; i_pdi: number; i_pdc: number; i_pds: number; c_pdi: number; c_pdc: number; s_pdi: number; s_pds: number; cs_pdcs: number }
export interface PdCash {
  liab_ldg_id: number; trans_typ: number; label: string;
  ipd: number; cpd: number; spd: number; cspd: number;
  i_intrpd: number; c_intrpd: number; s_intrpd: number; cs_intrpd: number;
  i_lfeepd: number; c_lfeepd: number; s_lfeepd: number; cs_lfeepd: number;
}
export const zHeads = (): Heads => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
const toHeads = (t: Tax): Heads => ({ igst: t.iamt, cgst: t.camt, sgst: t.samt, cess: t.csamt });

export function emptyPdItc(ldg = 0): PdItc {
  return { liab_ldg_id: ldg, trans_typ: 30002, i_pdi: 0, i_pdc: 0, i_pds: 0, c_pdi: 0, c_pdc: 0, s_pdi: 0, s_pds: 0, cs_pdcs: 0 };
}
export function emptyPdCash(ldg = 0, typ = 30002, label = ''): PdCash {
  return {
    liab_ldg_id: ldg, trans_typ: typ, label, ipd: 0, cpd: 0, spd: 0, cspd: 0,
    i_intrpd: 0, c_intrpd: 0, s_intrpd: 0, cs_intrpd: 0, i_lfeepd: 0, c_lfeepd: 0, s_lfeepd: 0, cs_lfeepd: 0,
  };
}

// liability by ledger, as the portal splits it
export function liabilities(f: Gstr3bForm) {
  const normal = toHeads(sumTax([f.sup.osup_det, f.sup.osup_zero]));
  const rc = toHeads(sumTax([f.sup.isup_rev, f.eco.eco_sup])); // reverse charge + 9(5) - payable in cash only
  return { normal, rc, interest: toHeads(f.intr), fee: toHeads(f.ltfee) };
}

// Rule 88A set-off: IGST credit first against IGST, then CGST / SGST; CGST & SGST credit never cross-utilised.
// Credit available = ITC balance in the credit ledger + net ITC of this return (4C). Whatever is left is paid in cash.
// includeLedger: also use the ITC balance already in the electronic credit ledger (carried forward from earlier periods).
export function computeOffset(f: Gstr3bForm, bal: LedgerBal | null, normalLdg: LiabLedger | null, rcLdg: LiabLedger | null, includeLedger = true) {
  const L = liabilities(f);
  const net = toHeads(itcNet(f));
  const ledger = includeLedger && bal ? bal.itc : zHeads();
  const credit: Heads = {
    igst: Math.max(0, ledger.igst + net.igst), cgst: Math.max(0, ledger.cgst + net.cgst),
    sgst: Math.max(0, ledger.sgst + net.sgst), cess: Math.max(0, ledger.cess + net.cess),
  };
  let iL = L.normal.igst, cL = L.normal.cgst, sL = L.normal.sgst, csL = L.normal.cess;
  let iI = credit.igst, cI = credit.cgst, sI = credit.sgst, csI = credit.cess;
  const take = (liab: number, cr: number) => (liab > 0 && cr > 0 ? Math.min(liab, cr) : 0);
  const p = emptyPdItc(normalLdg?.liab_ldg_id || 0);
  let x: number;
  // 1. IGST credit against IGST liability
  x = take(iL, iI); p.i_pdi = x; iL -= x; iI -= x;
  // 2. remaining IGST credit against CGST / SGST "in any order and in any proportion" (Rule 88A). Split it so that
  //    it first covers what the CGST / SGST credit itself cannot pay - this minimises cash. IGST credit must be
  //    exhausted before CGST / SGST credit is used, so whatever is still left goes to the remaining liability.
  const sShort = Math.max(0, sL - sI);
  const cShort = Math.max(0, cL - cI);
  x = take(sShort, iI); p.s_pdi = x; sL -= x; iI -= x;
  x = take(cShort, iI); p.c_pdi = x; cL -= x; iI -= x;
  x = take(cL, iI); p.c_pdi += x; cL -= x; iI -= x;
  x = take(sL, iI); p.s_pdi += x; sL -= x; iI -= x;
  // 3. CGST credit -> CGST, SGST credit -> SGST (CGST and SGST credit are never cross-utilised)
  x = take(cL, cI); p.c_pdc = x; cL -= x; cI -= x;
  x = take(sL, sI); p.s_pds = x; sL -= x; sI -= x;
  // 4. CGST / SGST credit left over may pay any IGST still due
  x = take(iL, cI); p.i_pdc = x; iL -= x; cI -= x;
  x = take(iL, sI); p.i_pds = x; iL -= x; sI -= x;
  // 5. cess only by cess
  x = take(csL, csI); p.cs_pdcs = x; csL -= x; csI -= x;
  (Object.keys(p) as (keyof PdItc)[]).forEach((k) => { if (k !== 'liab_ldg_id' && k !== 'trans_typ') p[k] = r2(p[k]); });

  const normalCash = emptyPdCash(normalLdg?.liab_ldg_id || 0, normalLdg?.trans_typ || 30002, normalLdg?.desc || 'Other than reverse charge');
  normalCash.ipd = r2(Math.max(0, iL)); normalCash.cpd = r2(Math.max(0, cL)); normalCash.spd = r2(Math.max(0, sL)); normalCash.cspd = r2(Math.max(0, csL));
  normalCash.i_intrpd = L.interest.igst; normalCash.c_intrpd = L.interest.cgst; normalCash.s_intrpd = L.interest.sgst; normalCash.cs_intrpd = L.interest.cess;
  normalCash.i_lfeepd = L.fee.igst; normalCash.c_lfeepd = L.fee.cgst; normalCash.s_lfeepd = L.fee.sgst; normalCash.cs_lfeepd = L.fee.cess;
  const rcCash = emptyPdCash(rcLdg?.liab_ldg_id || 0, rcLdg?.trans_typ || 30003, rcLdg?.desc || 'Reverse charge and supplies u/s 9(5)');
  rcCash.ipd = L.rc.igst; rcCash.cpd = L.rc.cgst; rcCash.spd = L.rc.sgst; rcCash.cspd = L.rc.cess;
  return { pditc: p, pdcash: [normalCash, rcCash], credit, liab: L, leftCredit: { igst: r2(iI), cgst: r2(cI), sgst: r2(sI), cess: r2(csI) } };
}

// cash required per head across all pdcash rows vs the cash ledger
export function cashNeed(pdcash: PdCash[], bal: LedgerBal | null) {
  const need = zHeads();
  for (const c of pdcash) {
    need.igst += c.ipd + c.i_intrpd + c.i_lfeepd;
    need.cgst += c.cpd + c.c_intrpd + c.c_lfeepd;
    need.sgst += c.spd + c.s_intrpd + c.s_lfeepd;
    need.cess += c.cspd + c.cs_intrpd + c.cs_lfeepd;
  }
  const short = zHeads();
  (Object.keys(need) as (keyof Heads)[]).forEach((k) => {
    need[k] = r2(need[k]);
    short[k] = r2(Math.max(0, need[k] - (bal?.cash[k] || 0)));
  });
  return { need, short, total: r2(Object.values(short).reduce((a, b) => a + b, 0)) };
}

// ---------------------------------------------------------------- validations (GSTN advisory 643)
// 4D(1) reclaimed ITC <= reclaim ledger (ECRS) closing balance + this period's 4B(2) reversal
// RCM ITC claimed in 4A(2) + 4A(3) <= RCM tax paid in 3.1(d) + RCM ledger closing balance
export function advisoryChecks(f: Gstr3bForm, reclaimBal: Tax, rcmBal: Tax) {
  const out: { ok: boolean; text: string }[] = [];
  TAX_KEYS.forEach((k) => {
    const claim = f.itc_inelg.RUL[k];
    const limit = r2(reclaimBal[k] + f.itc_rev.OTH[k]);
    if (claim > 0) out.push({ ok: claim <= limit + 0.5, text: `4D(1) ${HEAD_LABEL[k]} reclaim ${claim.toFixed(2)} vs limit ${limit.toFixed(2)} (reclaim ledger + 4B(2))` });
    const rcmClaim = r2(f.itc_avl.IMPS[k] + f.itc_avl.ISRC[k]);
    const rcmLimit = r2(f.sup.isup_rev[k] + rcmBal[k]);
    if (rcmClaim > 0) out.push({ ok: rcmClaim <= rcmLimit + 0.5, text: `RCM ITC 4A(2)+4A(3) ${HEAD_LABEL[k]} ${rcmClaim.toFixed(2)} vs limit ${rcmLimit.toFixed(2)} (3.1(d) + RCM ledger)` });
  });
  return out;
}
