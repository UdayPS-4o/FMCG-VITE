const express = require('express');
const router = express.Router();
const path = require('path');
const { DbfORM } = require('../../dbf-orm');
const fs = require('fs').promises;

const dbfFolder = process.env.DBF_FOLDER_PATH;
const dbfFilePath = path.join(dbfFolder, 'data', 'PMPL.DBF');
const pmplJsonPath = path.join(dbfFolder, 'data', 'json', 'PMPL.json');

function mapItemToDbf(record) {
  return {
    CODE_TYPE: record.CODE_TYPE || '',
    PAR_CODE: record.PAR_CODE || '',
    ISACTIVE: record.ISACTIVE || 'Y',
    ITEM_MAP: record.ITEM_MAP || '',
    G_CODE: record.G_CODE || '',
    C_CODE: record.C_CODE || record.GST_CODE || '',
    G1_CODE: record.G1_CODE || '',
    CODE: record.CODE || '',
    PRODUCT: record.PRODUCT || '',
    PACK: record.PACK || '',
    H_CODE: record.H_CODE || '',
    BRAND: record.BRAND || '',
    UNIT_1: record.UNIT_1 || '',
    PCBX: record.PCBX || '',
    UNIT_2: record.UNIT_2 || '',
    MRP1: record.MRP1 ?? null,
    RATE1: record.RATE1 ?? null,
    TRADE1: record.TRADE1 ?? record.RATE1 ?? null,
    GST_CODE: record.GST_CODE || '',
    GST: record.GST ?? null,
    SCH: record.SCH ?? null,
    SCH_RS_PC: record.SCH_RS_PC ?? null,
    CESS_RS_PC: record.CESS_RS_PC ?? null,
    CESS_RS: record.CESS_RS_PC ?? null,
    GRAIN_ITEM: record.GRAIN_ITEM || '',
    FILL: record.FILL ?? null,
    MIN_STOCK: record.MIN_STOCK ?? null,
    NOT_STOCK: record.NOT_STOCK || '',
    EXTRA_DESC: record.EXTRA_DESC || '',
    GR_CODE: record.GR_CODE || record.GST_CODE || '',
    ADDEDON: record.ADDEDON ? new Date(record.ADDEDON.replace(/[^0-9-]/g,'')) : new Date()
  };
}

router.post('/sync', async (req, res) => {
  const pmplDbf = new DbfORM(dbfFilePath);
  try {
    let { records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      try {
        const buffered = await fs.readFile(path.join(__dirname, '../../db/newitem.json'), 'utf8');
        records = JSON.parse(buffered);
      } catch (err) {
        return res.status(400).json({ success: false, message: 'No records provided and no newitem.json found' });
      }
    }
    // Open PMPL.DBF (create if missing)
    try {
      await pmplDbf.open();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ success: false, message: `PMPL.DBF not found at ${dbfFilePath}. Check DBF_FOLDER_PATH.` });
      }
      if (['EBUSY','EACCES','EPERM'].includes(error.code)) {
        return res.status(423).json({ success: false, message: `PMPL.DBF is locked or inaccessible at ${dbfFilePath}. Close other applications (e.g., FoxPro) and try again.` });
      }
      console.error('Error opening PMPL.DBF:', error);
      return res.status(500).json({ success: false, message: `Failed to open PMPL.DBF at ${dbfFilePath}`, error: error.message });
    }

    const existing = await pmplDbf.findAll();
    const existingCodes = new Set(existing.map(rec => rec.CODE));
    const valid = [];
    const duplicates = [];

    for (const r of records) {
      if (existingCodes.has(r.CODE)) {
        duplicates.push(r);
      } else {
        valid.push(r);
        existingCodes.add(r.CODE);
      }
    }

    if (valid.length > 0) {
      const dbfRecords = valid.map(mapItemToDbf);
      try {
        await pmplDbf.insertMany(dbfRecords);
      } catch (insErr) {
        console.error('DBF insert error (items):', insErr);
        return res.status(500).json({ success: false, message: 'Failed inserting into PMPL.DBF', error: insErr.message });
      }

      // Update PMPL.json
      let pmplJson = [];
      try {
        const content = await fs.readFile(pmplJsonPath, 'utf8');
        pmplJson = JSON.parse(content);
      } catch (err) {
        pmplJson = [];
      }
      pmplJson = pmplJson.concat(valid);
      await fs.writeFile(pmplJsonPath, JSON.stringify(pmplJson, null, 2));
    }

    await pmplDbf.close();
    return res.json({ success: true, synced: valid.length, duplicates: duplicates.length, dbfPath: dbfFilePath, jsonPath: pmplJsonPath, valid, duplicates });
  } catch (error) {
    console.error('Error syncing items:', error);
    return res.status(500).json({ success: false, message: 'Failed to sync items', error: error.message });
  } finally {
    try { await pmplDbf.close(); } catch {}
  }
});

module.exports = router;