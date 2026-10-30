const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { DBFFile } = require('../dbf-orm/dbffile.js');
const { downloadSchemes, SCHEMES_FILE } = require('../utils/bizomSchemes');

// Helper function to read PMPL.dbf and create a mapping for ITEM_MAP
async function getPmplMapping() {
    const dbfPath = path.join(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../d01-2324'), 'data', 'PMPL.DBF');
    const dbf = await DBFFile.open(dbfPath);
    const records = await dbf.readRecords();
    await dbf.close();

    const mapping = {};
    for (const record of records) {
        if (record.ITEM_MAP && record.ITEM_MAP.trim()) {
            const itemMap = record.ITEM_MAP.trim();
            if (!mapping[itemMap]) {
                mapping[itemMap] = [];
            }
            mapping[itemMap].push({
                code: record.CODE ? record.CODE.trim() : '',
                product: record.PRODUCT ? record.PRODUCT.trim() : ''
            });
        }
    }
    return mapping;
}

// Bizom scheme dump: written by POST /download, else an older scraper output. GODREJ_SCHEMES_JSON overrides.
const SCHEME_JSON_CANDIDATES = [
    process.env.GODREJ_SCHEMES_JSON,
    SCHEMES_FILE,
    path.join(__dirname, '../../../src/Bizom/new_scraper/all_schemes.json'),
    'F:\\FMCG\\src\\Bizom\\new_scraper\\all_schemes.json'
].filter(Boolean);

async function findSchemesJson() {
    for (const p of SCHEME_JSON_CANDIDATES) {
        try {
            await fs.access(p);
            return p;
        } catch { /* try next */ }
    }
    return null;
}

// Fallback for scheme files downloaded before outlet_segment existed: read the _RT / _WS tags in the name
function segmentFromName(name = '') {
    const tags = new Set(name.toUpperCase().split(/[_\s-]+/));
    const rt = tags.has('RT'), ws = tags.has('WS');
    if (rt && !ws) return 'RT';
    if (ws && !rt) return 'WS';
    return 'BOTH';
}

// Returns why a scheme can't go into SCHDTL (quantity slab + % discount), or null if it can
function notImportableReason(scheme) {
    const qty = parseFloat(scheme.forquantity) || 0;
    const amount = parseFloat(scheme.foramount) || 0;
    const discount = parseFloat(scheme.discountpercent) || 0;
    if (scheme.type && scheme.type !== 'sku') {
        return scheme.type.includes('qps') ? 'QPS (monthly purchase value)' : 'Invoice value slab';
    }
    if (qty <= 0 && amount > 0) return 'Invoice value slab';
    if (discount <= 0) {
        if (Array.isArray(scheme.free_skus) && scheme.free_skus.length) return 'Free goods';
        if (parseFloat(scheme.saverupee) > 0) return 'Fixed rupee saving';
        return '0% discount';
    }
    return null;
}

// SCHDTL.CUST_CAT: R = retail parties only, W = wholesale only, blank = everyone
const CUST_CAT_FOR_SEGMENT = { RT: 'R', WS: 'W', BOTH: '' };

// GET /api/godrej-schemes/next-bill-no
router.get('/next-bill-no', async (req, res) => {
    try {
        const dbfPath = path.join(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../d01-2324'), 'data', 'SCHDTL.DBF');
        const dbf = await DBFFile.open(dbfPath);
        const records = await dbf.readRecords();
        await dbf.close();

        let maxBill = 0;
        for (const record of records) {
            if (record.BILL && !isNaN(record.BILL)) {
                const billVal = Number(record.BILL);
                if (billVal > maxBill) {
                    maxBill = billVal;
                }
            }
        }

        res.json({ success: true, nextBillNo: maxBill + 1 });
    } catch (error) {
        console.error('Error fetching next bill no:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch next bill no', error: error.message });
    }
});

// GET /api/godrej-schemes/preview
router.get('/preview', async (req, res) => {
    try {
        const allJsonPath = await findSchemesJson();
        if (!allJsonPath) {
            return res.status(404).json({
                success: false,
                message: 'No Bizom scheme data yet. Click "Download from Bizom" first.'
            });
        }
        const pmplMap = await getPmplMapping();

        const { mtime } = await fs.stat(allJsonPath);
        const allJsonContent = await fs.readFile(allJsonPath, 'utf8');
        const godrejData = JSON.parse(allJsonContent);

        const activeSchemes = Array.isArray(godrejData) ? godrejData.filter(s => s.active === "1") : [];
        for (const scheme of activeSchemes) {
            scheme.outlet_segment = scheme.outlet_segment || segmentFromName(scheme.name);
        }

        // SCHDTL only holds quantity slabs with a % discount. Anything else is listed, not imported.
        const valueSchemes = [];
        const slabSchemes = [];
        for (const scheme of activeSchemes) {
            const reason = notImportableReason(scheme);
            if (reason) valueSchemes.push({ scheme, reason });
            else slabSchemes.push(scheme);
        }

        // Calculate dynamic slab ends based on schemegroup_id and forquantity
        if (Array.isArray(godrejData)) {
            const groups = {};
            for (const scheme of slabSchemes) {
                const groupId = scheme.schemegroup_id;
                if (groupId) {
                    if (!groups[groupId]) groups[groupId] = [];
                    groups[groupId].push(scheme);
                }
            }

            for (const groupId in groups) {
                const groupSchemes = groups[groupId];
                // Sort ascending by forquantity
                groupSchemes.sort((a, b) => {
                    return (parseFloat(a.forquantity) || 0) - (parseFloat(b.forquantity) || 0);
                });
                
                for (let i = 0; i < groupSchemes.length; i++) {
                    const scheme = groupSchemes[i];
                    if (i < groupSchemes.length - 1) {
                        const nextScheme = groupSchemes[i + 1];
                        const currentStart = parseFloat(scheme.forquantity) || 0;
                        const nextStart = parseFloat(nextScheme.forquantity) || 0;
                        if (nextStart > currentStart) {
                            scheme.calculated_slab_end = nextStart - 1;
                        } else {
                            scheme.calculated_slab_end = 999999999; 
                        }
                    } else {
                        // Last scheme in the group always gets No Limit, ignoring endrange
                        scheme.calculated_slab_end = 999999999;
                    }
                }
            }
        }

        const matchedSchemes = [];
        let totalProcessed = 0;
        let totalMatched = 0;

        if (Array.isArray(godrejData)) {
            totalProcessed = godrejData.length;
            for (const scheme of slabSchemes) {
                if (scheme.for_skucode && Array.isArray(scheme.for_skucode)) {
                    let hasMatch = false;
                    for (const skuCode of scheme.for_skucode) {
                        const pmplRecords = pmplMap[skuCode];

                        if (pmplRecords && pmplRecords.length > 0) {
                            hasMatch = true;
                            for (const rec of pmplRecords) {
                                matchedSchemes.push({
                                    id: `${skuCode}_${rec.code}_${scheme.id}`,
                                    basepack_code: skuCode,
                                    pmpl_code: rec.code,
                                    product_desc: rec.product || '',
                                    discount: parseFloat(scheme.discountpercent) || 0,
                                    activitycode: scheme.id || '',
                                    scheme_desc: scheme.name || '',
                                    slab_start: parseFloat(scheme.forquantity) || 1,
                                    slab_end: scheme.calculated_slab_end,
                                    segment: scheme.outlet_segment,
                                    scheme_group: scheme.schemegroup_id || ''
                                });
                            }
                        }
                    }
                    if (hasMatch) totalMatched++;
                }
            }
        }

        const notImported = valueSchemes.map(({ scheme, reason }) => ({
            activitycode: scheme.id || '',
            scheme_desc: scheme.name || '',
            segment: scheme.outlet_segment,
            reason,
            min_amount: parseFloat(scheme.foramount) || 0,
            discount: parseFloat(scheme.discountpercent) || 0,
            save_rupees: parseFloat(scheme.saverupee) || 0,
            matched_products: (scheme.for_skucode || []).filter(c => pmplMap[c]).length
        }));

        res.json({
            success: true,
            total_products: totalProcessed,
            matched_products: totalMatched,
            data_as_of: mtime,
            schemes: matchedSchemes,
            not_imported: notImported
        });

    } catch (error) {
        console.error('Error in /api/godrej-schemes/preview:', error);
        res.status(500).json({ success: false, message: 'Failed to preview schemes', error: error.message });
    }
});

// POST /api/godrej-schemes/download - refresh all_schemes.json from Bizom
router.post('/download', async (req, res) => {
    try {
        const result = await downloadSchemes();
        res.json({ success: true, message: `Downloaded ${result.schemes} schemes (${result.active} active) from Bizom`, ...result });
    } catch (error) {
        console.error('Error in /api/godrej-schemes/download:', error);
        res.status(502).json({ success: false, message: error.message });
    }
});

// POST /api/godrej-schemes/import
router.post('/import', async (req, res) => {
    try {
        const { schemes, series, billNo, date, validFrom, validTo } = req.body;

        if (!schemes || !Array.isArray(schemes) || schemes.length === 0) {
            return res.status(400).json({ success: false, message: 'No schemes provided for import.' });
        }
        if (!series || !billNo || !date || !validFrom || !validTo) {
            return res.status(400).json({ success: false, message: 'Missing Master Header Information (Series, Bill No, Dates).' });
        }

        const dbfPath = path.join(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../d01-2324'), 'data', 'SCHDTL.DBF');
        const dbf = await DBFFile.open(dbfPath);

        const recordsToAppend = schemes.map(scheme => {
            const billStr = String(billNo);
            const paddedBillStr = billStr.padStart(5, ' ');

            return {
                SERIES: series,
                BILL: Number(billNo),
                DATE: new Date(date),
                CODE: scheme.pmpl_code,
                GDN_CODE: "",
                UNIT: "",
                MULT_F: 1,
                R_OPT: "",
                DISCOUNT: Number(scheme.discount),
                SCHEME: 0,
                C_DIS: 0,
                CASH_DIS: 0,
                EXT_DESC: "",
                BATCH_NO: "",
                IMEI_NO: "",
                BILL_BB: `-${billStr}`,
                BILL2: `${series}-${paddedBillStr}`,
                DM_SERIES: "",
                CON_BILL: "",
                AD_SERIES: "",
                GR_CODE9: "",
                PRODUCT: "",
                PRODUCT_L: "",
                PACK: "",
                OK: "Y",
                PST9: "",
                C_CODE: "",
                BR_CODE: "",
                C_CST: "",
                VR_NO_B: "",
                VR_NO_D: "",
                HSN_CODE: "",
                OLDCODE: "",
                SLAB1: Number(scheme.slab_start),
                SLAB2: Number(scheme.slab_end),
                SCH_FROM: new Date(validFrom),
                SCH_TO: new Date(validTo),
                CUST_CAT: CUST_CAT_FOR_SEGMENT[scheme.segment] ?? ''
            };
        });

        await dbf.appendRecords(recordsToAppend);
        await dbf.close();

        // Note: Cache invalidation theoretically needed in shikhar_scheme.js,
        // but it auto-expires nicely via its TTL. For perfect sync, we'd export it, 
        // but practically the cache TTL handles it cleanly.

        res.json({ success: true, message: `Successfully imported ${recordsToAppend.length} schemes into SCHDTL.dbf` });

    } catch (error) {
        console.error('Error in /api/godrej-schemes/import:', error);
        res.status(500).json({ success: false, message: 'Failed to import schemes', error: error.message });
    }
});

module.exports = router;
