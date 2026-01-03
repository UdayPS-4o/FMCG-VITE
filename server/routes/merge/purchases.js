const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { DbfORM } = require('../../dbf-orm');

const dbfFolderPath = process.env.DBF_FOLDER_PATH;
const purDbfPath = path.join(dbfFolderPath, 'data', 'PUR.DBF');
const purDtlDbfPath = path.join(dbfFolderPath, 'data', 'PURDTL.DBF');
const pmplDbfPath = path.join(dbfFolderPath, 'data', 'PMPL.DBF');
const cmplDbfPath = path.join(dbfFolderPath, 'data', 'CMPL.DBF');

const toFloat = (v, d = 2) => parseFloat(parseFloat(v || 0).toFixed(d));
const toInt = (v) => parseInt(String(v || 0), 10) || 0;
const padBillNumber = (series, billNo) => `${series}-${' '.repeat(Math.max(0, 5 - String(billNo).length))}${billNo}`;
const formatBillBB = (series, billNo) => `${series}-${billNo}`;
const padBillVRNo = (billNo) => `PB-P${String(billNo).padStart(5, '0')}`;
const parseDDMMYYYYToUTC = (dateStr) => {
  if (!dateStr) return null;
  try {
    const parts = String(dateStr).split('-');
    let year, month, day;
    if (parts[0].length === 4) {
      year = toInt(parts[0]);
      month = toInt(parts[1]) - 1;
      day = toInt(parts[2]);
    } else {
      day = toInt(parts[0]);
      month = toInt(parts[1]) - 1;
      year = toInt(parts[2]);
    }
    return new Date(Date.UTC(year, month, day, 0, 0, 0));
  } catch {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }
};
const extractStateCode = (stateStr) => {
  if (!stateStr) return '';
  const m = String(stateStr).match(/^\s*(\d{2})/);
  return m ? m[1] : '';
};

function mapToPURRecord(purchase, supplier) {
  const series = 'P';
  const billNo = toInt(purchase.bill || purchase.BILL);
  const entryDate = parseDDMMYYYYToUTC(purchase.entryDate || purchase.date);
  const pBillNo = purchase.invoice?.number || '';
  const pBillDate = parseDDMMYYYYToUTC(purchase.invoice?.date || '');
  const n_b_amt = toFloat(purchase.totals?.total ?? purchase.totals?.grandTotal ?? 0, 2);
  const stateCode = extractStateCode(purchase.state) || supplier?.C_STATE || '';
  const gstin = purchase.gstin || supplier?.C_CST || '';

  return {
    SERIES: series,
    BILL: billNo,
    PBILL: pBillNo,
    PBILLDATE: pBillDate,
    CASH: 'N',
    DATE: entryDate,
    RECD: '',
    C_CODE: purchase.supplierCode || purchase.party || '',
    BR_CODE: '',
    C_NAME: purchase.supplierName || supplier?.C_NAME || '',
    C_ADD1: supplier?.C_ADD1 || '',
    C_ADD2: supplier?.C_ADD2 || '',
    C_PLACE: supplier?.C_PLACE || '',
    TRANSFER: 'Y',
    BILL_BB: formatBillBB(series, billNo),
    BILL_DD: '',
    BILL2: padBillNumber(series, billNo),
    BILL1: '',
    N_B_AMT: n_b_amt,
    DM_SER: '',
    DM_NO: null,
    CON_DATE: null,
    CON_BILL: '',
    AD_SERIES: '',
    AD_BILL: null,
    REF_NO: '',
    CASH_DIS: null,
    BILL_REM: '',
    PST9: stateCode,
    C_CST: gstin,
    VR_NO_B: padBillVRNo(billNo),
    GST_TYPE: '',
    USER_ID: null,
    USER_TIME: null,
    USER_ID2: null,
    USER_TIME2: null,
    CODE_ORG: '',
    SM_ORG: '',
    PURBILLAMT: null,
    PUREXP: null
  };
}

function mapToPURDTLRecords(purchase, supplier, productMap) {
  const series = 'P';
  const billNo = toInt(purchase.bill || purchase.BILL);
  const entryDate = parseDDMMYYYYToUTC(purchase.entryDate || purchase.date);
  const pBillNo = purchase.invoice?.number || '';
  const pBillDate = parseDDMMYYYYToUTC(purchase.invoice?.date || '');
  const stateCode = extractStateCode(purchase.state) || supplier?.C_STATE || '';

  const records = [];
  let sno = 1;
  for (const it of purchase.items || []) {
    const code = it.itemCode || it.CODE || it.code || '';
    const product = productMap[code] || {};
    const qty = toFloat(it.qty, 3);
    const rate = toFloat(it.rate, 2);
    const schRs = toFloat(it.discRs, 2);
    const schPerc = toFloat(it.discPercent, 2);
    const cdPerc = toFloat(it.cdPercent, 2);
    const gstPerc = toFloat(it.gstPercent, 2);
    const amt10 = toFloat(qty * rate, 2);
    const afterSchRs = toFloat(amt10 - schRs, 2);
    const dis10 = toFloat(afterSchRs * (schPerc / 100), 2);
    const afterSchDisc = toFloat(afterSchRs - dis10, 2);
    const cd10 = toFloat(afterSchDisc * (cdPerc / 100), 2);
    const net10 = toFloat(afterSchDisc - cd10, 2);
    const gstFactor = 1 + (gstPerc / 100);
    const gd10 = toFloat(net10 / gstFactor, 2);
    const gst10 = toFloat(net10 - gd10, 2);
    const bas10 = toFloat(rate / gstFactor, 2);

    const unit = (it.unit || product.UNIT_1 || '').toString();
    const multF = toFloat(product.MULT_F || 1, 0);
    const isUnit2 = unit.toUpperCase() === (product.UNIT_2 || '').toUpperCase();
    const trade = toFloat(product.TRADE1 || rate, 2);
    const adjustedTrade = isUnit2 ? toFloat(trade * multF, 2) : trade;
    let unitNo = 1;
    if (unit.toUpperCase() === (product.UNIT_2 || '').toUpperCase()) unitNo = 2;
    if (unit.toUpperCase() === (product.UNIT_1 || '').toUpperCase()) unitNo = 1;

    records.push({
      SERIES: series,
      BILL: billNo,
      DATE: entryDate,
      PBILL: pBillNo,
      PBILLDATE: pBillDate,
      CODE: code,
      GDN_CODE: it.godown || '',
      UNIT: unit,
      MULT_F: isUnit2 ? multF : 1,
      TRADE: adjustedTrade,
      R_OPT: '',
      MRP: toFloat(product.MRP1 || it.mrp || 0, 2),
      RATE: rate,
      FILL: null,
      BAGS: null,
      QTY: qty,
      DAMAGE: null,
      FREE: null,
      FREE_SH: null,
      DISCOUNT: schPerc,
      SCHEME: schRs,
      C_DIS: null,
      CASH_DIS: cdPerc,
      EXT_DESC: '',
      BATCH_NO: '',
      EXPIRY: null,
      LST: null,
      GST: gstPerc,
      SNO: sno,
      BILL_BB: formatBillBB(series, billNo),
      BILL2: padBillNumber(series, billNo),
      DM_SERIES: '',
      DM_NO: null,
      CON_BILL: '',
      AD_SERIES: '',
      AD_BILL: null,
      BAS10: bas10,
      AMT10: amt10,
      SCH10: schRs,
      DIS10: dis10,
      CD10: cd10,
      CESS10: 0,
      NET10: net10,
      GD10: gd10,
      GST10: gst10,
      GR_CODE9: product.GR_CODE || '',
      PRODUCT: product.PRODUCT || (it.description || ''),
      PACK: product.PACK || '',
      PRODUCT_L: '',
      BR_CODE: '',
      OK: 'Y',
      UNIT_NO: unitNo,
      C_CODE: purchase.supplierCode || purchase.party || '',
      C_CST: purchase.gstin || supplier?.C_CST || '',
      VR_NO_B: padBillVRNo(billNo),
      HSN_CODE: product.H_CODE || it.hsn || '',
      WEIGHT: toFloat(product.WEIGHT || 0, 3),
      WT_UNIT: product.WT_UNIT || '',
      QTY_MAIN: '',
      QDR: null,
      NETAMT10: net10,
      EXP_MY: '',
      EXP_C: '',
      PTR: null,
      S_RATE: null,
      PPID: `${code} ${billNo}`,
      SPID: '',
      GD00: null,
      GD03: null,
      GD05: null,
      GD12: null,
      GD18: null,
      GD28: null,
      TAX00: null,
      TAX03: null,
      TAX05: null,
      TAX12: null,
      TAX18: null,
      TAX28: null,
      CESS: null,
      PST9: stateCode,
      MST9: '',
      B_IGST: '',
      EXPENSE: null,
      BARCODE: '',
      C_NAME: '',
      C_PLACE: '',
      PL_RATE: net10,
      SPL_RATE: null,
      BPL_RATE: null
    });
    sno++;
  }
  return records;
}

router.post('/sync', async (req, res) => {
  const purDbf = new DbfORM(purDbfPath, { autoCreate: true });
  const purDtlDbf = new DbfORM(purDtlDbfPath, { autoCreate: true });
  const pmplDbf = new DbfORM(pmplDbfPath);
  const cmplDbf = new DbfORM(cmplDbfPath);

  try {
    const { records } = req.body || {};
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'No purchase records provided' });
    }

    await Promise.all([
      purDbf.open(),
      purDtlDbf.open(),
      pmplDbf.open(),
      cmplDbf.open()
    ]);

    const pmplRecords = await pmplDbf.findAll();
    const productMap = pmplRecords.reduce((acc, rec) => {
      if (rec.CODE) acc[rec.CODE] = rec;
      return acc;
    }, {});
    const cmplRecords = await cmplDbf.findAll();
    const partyMap = cmplRecords.reduce((acc, rec) => {
      if (rec.C_CODE) acc[rec.C_CODE] = rec;
      return acc;
    }, {});

    const existingPur = await purDbf.findAll();
    const existingKeys = new Set(existingPur.map(r => `${r.SERIES}-${r.BILL}`));

    const purToInsert = [];
    const purDtlToInsert = [];
    const processed = [];
    const skipped = [];

    for (const purchase of records) {
      const key = `P-${toInt(purchase.bill || purchase.BILL)}`;
      if (existingKeys.has(key)) {
        skipped.push({ key, reason: 'Duplicate' });
        continue;
      }
      const supplier = partyMap[purchase.supplierCode || purchase.party || ''] || null;
      const purRecord = mapToPURRecord(purchase, supplier);
      const purDtlRecords = mapToPURDTLRecords(purchase, supplier, productMap);

      purToInsert.push(purRecord);
      purDtlToInsert.push(...purDtlRecords);
      processed.push(key);
      existingKeys.add(key);
    }

    if (purToInsert.length > 0) {
      await purDbf.insertMany(purToInsert);
    }
    if (purDtlToInsert.length > 0) {
      await purDtlDbf.insertMany(purDtlToInsert);
    }

    return res.json({
      success: true,
      message: `Purchases sync completed. Processed: ${processed.length}, Skipped: ${skipped.length}`,
      processed,
      skipped
    });
  } catch (error) {
    console.error('Error during purchases sync:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync purchases to DBF files',
      error: error.message
    });
  } finally {
    try {
      await Promise.allSettled([
        purDbf.close(),
        purDtlDbf.close(),
        pmplDbf.close(),
        cmplDbf.close()
      ]);
    } catch (e) {
    }
  }
});

module.exports = router;
