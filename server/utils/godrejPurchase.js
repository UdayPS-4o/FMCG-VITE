// Godrej purchase import — web port of the FoxPro GOD.PRG program.
// Reads GODPUR.CSV (Bizom report 11721 "Primary Sale and Grn Status") and
// GPRICE.CSV (Bizom report 5497 "Price Check Report") from the FMCG folder.
const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');

const SUPPLIER_CODE = 'CT229';
const NEW_ITEM_PREFIX = 'G1';
const GST_CODE_BY_RATE = { 0: 'GG009', 5: 'GG021', 12: 'GG022', 18: 'GG020', 28: 'GG017' };

const getCsvDir = () =>
  process.env.GODREJ_CSV_DIR || path.dirname(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../..', 'x'));

const PUR_CSV = 'GODPUR.CSV';
const PRICE_CSV = 'GPRICE.CSV';

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const round = (v, d = 2) => Math.round((v + Number.EPSILON) * 10 ** d) / 10 ** d;
const trim = (v) => String(v ?? '').trim();

// YYYY-MM-DD -> DD-MM-YYYY (format used across the purchases JSON store)
const toDDMMYYYY = (s) => {
  const m = trim(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : trim(s);
};

function parseCsv(text) {
  const res = Papa.parse(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  return res.data;
}

async function readCsvFile(name) {
  const dir = getCsvDir();
  // Windows file system is case-insensitive, but be explicit for other hosts
  const file = path.join(dir, name);
  const [text, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
  return { rows: parseCsv(text), file, modified: stat.mtime };
}

async function fileInfo(name) {
  const file = path.join(getCsvDir(), name);
  try {
    const st = await fs.stat(file);
    return { file, exists: true, size: st.size, modified: st.mtime };
  } catch {
    return { file, exists: false };
  }
}

// Sku Code -> outlet selling price (first match wins, like the FoxPro relation)
function buildPriceMap(priceRows) {
  const map = {};
  for (const r of priceRows) {
    const code = trim(r.Bizom_Sku_Code);
    if (!code || map[code] !== undefined) continue;
    map[code] = round(num(r.Sku_Price), 2);
  }
  return map;
}

/**
 * Build invoice-wise purchase lines.
 * @param purRows parsed GODPUR.CSV rows
 * @param priceMap Sku Code -> trade rate
 * @param pmplRecords PMPL.DBF records
 */
function buildInvoices(purRows, priceMap, pmplRecords) {
  const pmplByMap = {};
  for (const p of pmplRecords) {
    const k = trim(p.ITEM_MAP);
    if (k && !pmplByMap[k]) pmplByMap[k] = p;
  }

  const invoices = new Map();
  const skipped = [];
  for (const r of purRows) {
    const inv = trim(r['Bill No']);
    const qty = num(r['Billed Qty(Cases)']);
    const taxable = num(r.Taxable_Amount);
    if (!inv) continue;
    if (qty <= 0) {
      skipped.push({ invoice: inv, product: trim(r['Sku Name']), reason: 'Zero quantity' });
      continue;
    }
    const skuCode = trim(r['Sku Code']);
    const gst = num(r.Gst);
    const existing = pmplByMap[skuCode];
    const line = {
      skuCode,
      product: trim(r['Sku Name']).toUpperCase(),
      hsn: trim(r.HSN_Code),
      mrp: num(r.MRP),
      multF: num(r.UOM) || 1,
      qty,
      taxable: round(taxable, 2),
      tax: round(num(r.Total_Tax), 2),
      gst,
      rate: round(taxable / qty, 2),
      trade1: priceMap[skuCode] ?? 0,
      grnStatus: trim(r['Grn Status']),
      itemCode: existing ? trim(existing.CODE) : '',
      unit: existing ? (num(existing.MULT_F) > 1 ? trim(existing.UNIT_2 || 'BOX') : trim(existing.UNIT_1 || 'PCS')) : (num(r.UOM) > 1 ? 'BOX' : 'PCS'),
      gstCode: existing ? trim(existing.GST_CODE || existing.GR_CODE) : (GST_CODE_BY_RATE[gst] || ''),
      isNew: !existing,
    };
    if (!invoices.has(inv)) {
      invoices.set(inv, {
        invoice: inv,
        invoiceId: trim(r.Invoice_ID),
        saleDate: toDDMMYYYY(r['Sale Date']),
        grnDate: trim(r['Grn Date']).startsWith('0000') ? '' : toDDMMYYYY(r['Grn Date']),
        plant: trim(r['Plant/Depo From']),
        lines: [],
      });
    }
    invoices.get(inv).lines.push(line);
  }

  const list = [...invoices.values()].map((iv) => {
    const taxable = round(iv.lines.reduce((s, l) => s + l.taxable, 0), 2);
    const tax = round(iv.lines.reduce((s, l) => s + l.tax, 0), 2);
    const cases = round(iv.lines.reduce((s, l) => s + l.qty, 0), 3);
    return { ...iv, taxable, tax, total: round(taxable + tax, 2), cases, newItems: iv.lines.filter((l) => l.isNew).length };
  });
  list.sort((a, b) => a.invoice.localeCompare(b.invoice));
  return { invoices: list, skipped };
}

// Next G1xxx code, same rule as GOD.PRG: G1 + last 3 digits + 1
function nextItemCodeFactory(pmplRecords) {
  let max = 0;
  for (const p of pmplRecords) {
    const c = trim(p.CODE);
    if (c.startsWith(NEW_ITEM_PREFIX)) {
      const n = parseInt(c.slice(-3), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return () => {
    max += 1;
    if (max > 999) throw new Error('G1 item code series exhausted (G1999)');
    return NEW_ITEM_PREFIX + String(max).padStart(3, '0');
  };
}

function buildNewPmplRecord(line, code) {
  const gstCode = GST_CODE_BY_RATE[line.gst] || '';
  return {
    ITEM_MAP: line.skuCode,
    CODE: code,
    G_CODE: NEW_ITEM_PREFIX,
    PRODUCT: line.product.slice(0, 30),
    MRP1: line.mrp,
    MULT_F: line.multF,
    UNIT_1: 'PCS',
    UNIT_2: line.multF > 1 ? 'Box' : 'PCS',
    TAXPAID: 'Y',
    GST: line.gst,
    RATE1: line.trade1,
    TRADE1: line.trade1,
    H_CODE: line.hsn.slice(0, 8),
    GR_CODE: gstCode,
    GST_CODE: gstCode,
    C_CODE: gstCode,
    ADDEDON: new Date(),
  };
}

// Purchase JSON in the same shape NewPurchase.tsx posts to /purchases
function buildPurchasePayload(iv, { bill, entryDate, godown, supplier }) {
  const items = iv.lines.map((l) => ({
    description: l.product,
    hsn: l.hsn,
    qty: String(l.qty),
    rate: String(l.rate),
    mrp: String(l.mrp),
    itemCode: l.itemCode,
    discRs: '',
    discPercent: '',
    cdPercent: '',
    gstPercent: String(l.gst),
    godown,
    unit: (l.unit || 'BOX').toUpperCase(),
    taxable: l.taxable.toFixed(2),
    gstAmount: l.tax.toFixed(2),
    total: (l.taxable + l.tax).toFixed(2),
  }));

  const breakdown = {};
  for (const l of iv.lines) {
    const label = l.gstCode || `GST ${l.gst}%`;
    if (!breakdown[label]) breakdown[label] = { taxable: 0, rate: l.gst };
    breakdown[label].taxable += l.taxable;
  }
  const gstBreakdown = Object.entries(breakdown).map(([code, d]) => ({
    code,
    rate: d.rate,
    taxable: round(d.taxable, 2),
    tax: round(d.taxable * (d.rate / 100), 2),
    originalTaxable: round(d.taxable, 2),
  }));
  const totalTaxable = gstBreakdown.reduce((s, b) => s + b.taxable, 0);
  const totalTax = gstBreakdown.reduce((s, b) => s + b.tax, 0);
  const gross = totalTaxable + totalTax;
  const rounded = Math.round(gross);

  return {
    bill: String(bill),
    supplierCode: SUPPLIER_CODE,
    supplierName: trim(supplier?.C_NAME) || 'GODREJ CONSUMER P LTD  NAGPUR',
    gstin: trim(supplier?.C_CST),
    state: trim(supplier?.C_STATE) === '27' ? '27 - Maharashtra' : trim(supplier?.C_STATE),
    invoice: { number: iv.invoice, date: iv.saleDate || entryDate },
    entryDate,
    rateInclusiveOfGst: 'N',
    items,
    gstBreakdown,
    totals: {
      taxable: round(totalTaxable, 2),
      cgst: round(totalTax / 2, 2),
      sgst: round(totalTax / 2, 2),
      roundOff: round(rounded - gross, 2),
      cashDiscount: 0,
      total: round(rounded, 2),
      netTotal: round(rounded, 2),
    },
    source: 'godrej-import',
  };
}

module.exports = {
  SUPPLIER_CODE,
  PUR_CSV,
  PRICE_CSV,
  getCsvDir,
  readCsvFile,
  fileInfo,
  buildPriceMap,
  buildInvoices,
  nextItemCodeFactory,
  buildNewPmplRecord,
  buildPurchasePayload,
};
