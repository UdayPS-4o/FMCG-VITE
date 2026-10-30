// Godrej Purchase Import (web port of GOD.PRG)
//   GET  /api/godrej-import/files            -> status of GODPUR.CSV / GPRICE.CSV
//   POST /api/godrej-import/upload           -> save CSV text uploaded from the browser
//   GET  /api/godrej-import/preview          -> invoice-wise preview of GODPUR.CSV
//   POST /api/godrej-import/import           -> create new PMPL items + pending purchases
//   POST /api/godrej-import/download         -> start Bizom auto-download
//   GET  /api/godrej-import/download/status  -> progress log of the auto-download
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM } = require('../dbf-orm');
const gp = require('../utils/godrejPurchase');
const bizom = require('../utils/bizomDownloader');

const dataDir = () => path.join(process.env.DBF_FOLDER_PATH, 'data');
const purchasesJsonPath = path.join(__dirname, '..', 'db', 'purchases.json');
const trim = (v) => String(v ?? '').trim();

async function readDbf(file) {
  const orm = new DbfORM(path.join(dataDir(), file));
  await orm.open();
  try {
    return await orm.findAll();
  } finally {
    try { await orm.close(); } catch { /* ignore */ }
  }
}

async function readPendingPurchases() {
  try {
    return JSON.parse(await fs.readFile(purchasesJsonPath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

// Invoices already in PUR.DBF or waiting in purchases.json for Godrej
async function getExistingInvoices() {
  const [pur, pending] = await Promise.all([readDbf('PUR.DBF'), readPendingPurchases()]);
  const inDbf = new Map();
  for (const p of pur) {
    if (trim(p.C_CODE) === gp.SUPPLIER_CODE && trim(p.PBILL)) inDbf.set(trim(p.PBILL), trim(p.BILL_BB) || String(p.BILL));
  }
  const inPending = new Map();
  for (const p of pending) {
    if (trim(p.supplierCode) === gp.SUPPLIER_CODE && trim(p.invoice?.number)) inPending.set(trim(p.invoice.number), `P-${p.bill}`);
  }
  return { pur, pending, inDbf, inPending };
}

async function loadPreview() {
  const [purCsv, priceCsv, pmpl, existing] = await Promise.all([
    gp.readCsvFile(gp.PUR_CSV),
    gp.readCsvFile(gp.PRICE_CSV).catch(() => null),
    readDbf('PMPL.DBF'),
    getExistingInvoices(),
  ]);
  const priceMap = priceCsv ? gp.buildPriceMap(priceCsv.rows) : {};
  const { invoices, skipped } = gp.buildInvoices(purCsv.rows, priceMap, pmpl);
  for (const iv of invoices) {
    iv.existingBill = existing.inDbf.get(iv.invoice) || existing.inPending.get(iv.invoice) || '';
    iv.existingIn = existing.inDbf.has(iv.invoice) ? 'database' : existing.inPending.has(iv.invoice) ? 'pending' : '';
  }
  return { invoices, skipped, pmpl, existing, priceLoaded: !!priceCsv, purFile: purCsv };
}

router.get('/files', async (req, res) => {
  try {
    const [pur, price] = await Promise.all([gp.fileInfo(gp.PUR_CSV), gp.fileInfo(gp.PRICE_CSV)]);
    res.json({ dir: gp.getCsvDir(), godpur: pur, gprice: price });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const { type, content } = req.body || {};
    const name = type === 'gprice' ? gp.PRICE_CSV : type === 'godpur' ? gp.PUR_CSV : null;
    if (!name || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ message: 'type (godpur|gprice) and CSV content are required' });
    }
    await fs.writeFile(path.join(gp.getCsvDir(), name), content, 'utf8');
    res.json({ message: `${name} saved`, info: await gp.fileInfo(name) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/preview', async (req, res) => {
  try {
    const { invoices, skipped, priceLoaded, purFile } = await loadPreview();
    // invoices already in PUR.DBF (or waiting for approval) are skipped so they can't be imported twice
    const alreadyImported = invoices
      .filter((iv) => iv.existingIn)
      .map((iv) => ({ invoice: iv.invoice, bill: iv.existingBill, existingIn: iv.existingIn }));
    res.json({
      invoices: invoices.filter((iv) => !iv.existingIn),
      alreadyImported,
      skipped,
      priceLoaded,
      file: purFile.file,
      modified: purFile.modified,
    });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ message: `File not found: ${e.path}` });
    console.error('Godrej preview error:', e);
    res.status(500).json({ message: e.message });
  }
});

router.post('/import', async (req, res) => {
  const { invoices: selected, entryDate, godown = '02', saleRates = {} } = req.body || {};
  if (!Array.isArray(selected) || selected.length === 0) {
    return res.status(400).json({ message: 'Select at least one invoice' });
  }
  if (!/^\d{2}-\d{2}-\d{4}$/.test(String(entryDate || ''))) {
    return res.status(400).json({ message: 'entryDate must be DD-MM-YYYY' });
  }
  try {
    const { invoices, pmpl, existing } = await loadPreview();
    const wanted = new Set(selected.map(trim));
    const toImport = invoices.filter((iv) => wanted.has(iv.invoice));
    const duplicates = toImport.filter((iv) => iv.existingIn).map((iv) => ({ invoice: iv.invoice, bill: iv.existingBill }));
    const fresh = toImport.filter((iv) => !iv.existingIn);
    if (fresh.length === 0) {
      return res.status(409).json({ message: 'All selected invoices are already imported', duplicates });
    }

    // 1. Create missing items in PMPL (one per Sku Code)
    const nextCode = gp.nextItemCodeFactory(pmpl);
    const newBySku = new Map(); // keeps first-seen order (numeric-looking keys would reorder in an object)
    for (const iv of fresh) {
      for (const l of iv.lines) {
        if (!l.isNew) continue;
        if (!newBySku.has(l.skuCode)) {
          // sale rate typed on the page wins over GPRICE.CSV
          const typed = parseFloat(saleRates[l.skuCode]);
          if (!isNaN(typed) && typed > 0) l.trade1 = Math.round(typed * 100) / 100;
          newBySku.set(l.skuCode, gp.buildNewPmplRecord(l, nextCode()));
        }
        l.itemCode = newBySku.get(l.skuCode).CODE;
        l.gstCode = newBySku.get(l.skuCode).GST_CODE;
        l.unit = l.multF > 1 ? 'BOX' : 'PCS';
      }
    }
    const newItems = [...newBySku.values()];
    if (newItems.length) {
      const pmplDbf = new DbfORM(path.join(dataDir(), 'PMPL.DBF'));
      try {
        await pmplDbf.open();
        await pmplDbf.insertMany(newItems);
      } finally {
        try { await pmplDbf.close(); } catch { /* ignore */ }
      }
      // keep the PMPL json cache (used by /api/dbf/PMPL.json) in step
      const pmplJsonPath = path.join(dataDir(), 'json', 'PMPL.json');
      try {
        const cache = JSON.parse(await fs.readFile(pmplJsonPath, 'utf8'));
        await fs.writeFile(pmplJsonPath, JSON.stringify(cache.concat(newItems), null, 2));
      } catch (e) {
        console.warn('PMPL.json cache not updated:', e.message);
      }
    }

    // 2. Save purchases to the pending store (approve them from Database > Purchases)
    const cmpl = await readDbf('CMPL.DBF');
    const supplier = cmpl.find((c) => trim(c.C_CODE) === gp.SUPPLIER_CODE);
    let maxBill = 0;
    for (const p of existing.pur) if (trim(p.SERIES) === 'P' && Number(p.BILL) > maxBill) maxBill = Number(p.BILL);
    for (const p of existing.pending) if (Number(p.bill) > maxBill) maxBill = Number(p.bill);

    const pending = await readPendingPurchases();
    const created = [];
    for (const iv of fresh) {
      maxBill += 1;
      const payload = gp.buildPurchasePayload(iv, { bill: maxBill, entryDate, godown: String(godown).slice(0, 2), supplier });
      payload.createdAt = new Date().toISOString();
      pending.push(payload);
      created.push({ invoice: iv.invoice, bill: `P-${maxBill}`, total: payload.totals.total, cases: iv.cases });
    }
    await fs.writeFile(purchasesJsonPath, JSON.stringify(pending, null, 2), 'utf8');

    res.json({
      message: `Imported ${created.length} invoice(s); ${newItems.length} new item(s) added to PMPL`,
      created,
      newItems: newItems.map((i) => ({ code: i.CODE, product: i.PRODUCT, skuCode: i.ITEM_MAP, gst: i.GST, mrp: i.MRP1, trade1: i.TRADE1 })),
      duplicates,
    });
  } catch (e) {
    console.error('Godrej import error:', e);
    if (['EBUSY', 'EACCES', 'EPERM'].includes(e.code)) {
      return res.status(423).json({ message: 'A DBF file is locked. Close FoxPro and try again.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.post('/download', (req, res) => {
  const { reports = ['purchase', 'price'], headless } = req.body || {};
  const started = bizom.startDownload({ reports, headless, outDir: gp.getCsvDir() });
  if (!started) return res.status(409).json({ message: 'A download is already running', status: bizom.getStatus() });
  res.json({ message: 'Download started', status: bizom.getStatus() });
});

router.get('/download/status', (req, res) => {
  res.json(bizom.getStatus());
});

module.exports = router;
