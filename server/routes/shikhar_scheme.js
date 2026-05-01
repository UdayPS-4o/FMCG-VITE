const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { DBFFile } = require('../dbf-orm/dbffile.js');
const { exec } = require('child_process');

// Cache for SCHDTL database
let schdtlCache = null;
let schdtlCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getActiveSchemesFromDBF() {
    if (schdtlCache && Date.now() - schdtlCacheTime < CACHE_TTL) {
        return schdtlCache;
    }
    try {
        const dbfPath = path.join(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../d01-2324'), 'data', 'SCHDTL.DBF');
        const dbf = await DBFFile.open(dbfPath);
        const records = await dbf.readRecords();
        await dbf.close();

        const activeSchemesMap = {};
        for (const record of records) {
            const code = record.CODE?.trim();
            if (!code) continue;

            if (!activeSchemesMap[code]) {
                activeSchemesMap[code] = [];
            }
            activeSchemesMap[code].push({
                schFrom: record.SCH_FROM,
                schTo: record.SCH_TO,
                slab1: parseFloat(record.SLAB1) || 0,
                slab2: parseFloat(record.SLAB2) || 999999999,
                discount: parseFloat(record.DISCOUNT) || 0,
                activityCode: record.ACTIVITY_C
            });
        }

        schdtlCache = activeSchemesMap;
        schdtlCacheTime = Date.now();
        return schdtlCache;
    } catch (error) {
        console.error('Error caching SCHDTL.dbf:', error);
        return {};
    }
}

// Helper function to read PMPL.dbf and create a mapping
async function getPmplMapping() {
    const dbfPath = path.join(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../d01-2324'), 'data', 'PMPL.DBF');
    const dbf = await DBFFile.open(dbfPath);
    const records = await dbf.readRecords();
    await dbf.close();

    const mapping = {};
    for (const record of records) {
        if (record.IT_DESC2 && record.IT_DESC2.trim()) {
            const itDesc = record.IT_DESC2.trim();
            const code = record.CODE.trim();
            if (!mapping[itDesc]) {
                mapping[itDesc] = [];
            }
            if (!mapping[itDesc].includes(code)) {
                mapping[itDesc].push(code);
            }
        }
    }
    return mapping;
}

// GET /api/schemes/for-item
router.get('/schemes/for-item', async (req, res) => {
    try {
        const itemCode = req.query.itemCode?.trim();
        const dateStr = req.query.date?.trim();

        if (!itemCode || !dateStr) {
            return res.status(400).json({ success: false, message: 'itemCode and date are required' });
        }

        // Parse target date to YYYYMMDD integer
        let invoiceDateNum;
        if (dateStr.includes('-')) {
             const parts = dateStr.split('-');
             if (parts[0].length === 4) { // YYYY-MM-DD
                 invoiceDateNum = parseInt(parts[0] + parts[1] + parts[2], 10);
             } else { // DD-MM-YYYY
                 invoiceDateNum = parseInt(parts[2] + parts[1] + parts[0], 10);
             }
        } else {
             const d = new Date(dateStr);
             const y = d.getFullYear();
             const m = String(d.getMonth() + 1).padStart(2, '0');
             const day = String(d.getDate()).padStart(2, '0');
             invoiceDateNum = parseInt('' + y + m + day, 10);
        }

        const schemesMap = await getActiveSchemesFromDBF();
        const itemSchemes = schemesMap[itemCode] || [];
        
        console.log(`Checking schemes for ${itemCode} on ${invoiceDateNum}`);
        const validSchemes = itemSchemes.filter(sch => {
            if (!sch.schFrom || !sch.schTo) return false;
            
            // Helper to get YYYYMMDD int from a value (string or Date object)
            const getIntDate = (val) => {
                if (!val) return 0;
                if (typeof val === 'string' && val.length === 8) {
                    return parseInt(val, 10);
                }
                const d = new Date(val);
                if (isNaN(d.getTime())) return 0;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return parseInt('' + y + m + day, 10);
            };
            
            const fromDateNum = getIntDate(sch.schFrom);
            const toDateNum = getIntDate(sch.schTo);
            
            console.log(`Scheme: From ${fromDateNum} To ${toDateNum} | Target: ${invoiceDateNum} | Matches: ${invoiceDateNum >= fromDateNum && invoiceDateNum <= toDateNum}`);
            
            return invoiceDateNum >= fromDateNum && invoiceDateNum <= toDateNum;
        });

        console.log(`Found ${validSchemes.length} active schemes`);
        res.json({ success: true, schemes: validSchemes });
    } catch (error) {
        console.error('Error fetching scheme for item:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// GET /api/schemes/next-bill-no
router.get('/schemes/next-bill-no', async (req, res) => {
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

// GET /api/schemes/preview
router.get('/schemes/preview', async (req, res) => {
    try {
        const pmplMap = await getPmplMapping();
        const allJsonPath = path.join(__dirname, '../../public', 'all.json');

        const allJsonContent = await fs.readFile(allJsonPath, 'utf8');
        const shikharData = JSON.parse(allJsonContent);

        const matchedSchemes = [];
        let totalProcessed = 0;
        let totalMatched = 0;

        if (shikharData.brands && Array.isArray(shikharData.brands)) {
            for (const brand of shikharData.brands) {
                if (brand.products && Array.isArray(brand.products)) {
                    for (const product of brand.products) {
                        totalProcessed++;
                        const basepackCode = product.basepack_code;
                        if (!basepackCode) continue;

                        const pmplCodes = pmplMap[basepackCode];

                        if (pmplCodes && pmplCodes.length > 0 && product.new_schemes_info && Array.isArray(product.new_schemes_info)) {
                            totalMatched++;
                            for (const pmplCode of pmplCodes) {
                                for (const scheme of product.new_schemes_info) {
                                    matchedSchemes.push({
                                        id: `${basepackCode}_${pmplCode}_${scheme.activitycode}_${scheme.scheme_slab_start}`,
                                        basepack_code: basepackCode,
                                        pmpl_code: pmplCode,
                                        product_desc: product.itemvarient_desc || product.itemvarientdesc || '',
                                        discount: scheme.discount,
                                        activitycode: scheme.activitycode,
                                        scheme_desc: scheme.scheme_desc || '',
                                        slab_start: scheme.scheme_slab_start,
                                        slab_end: scheme.scheme_slab_end
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        res.json({
            success: true,
            total_products: totalProcessed,
            matched_products: totalMatched,
            schemes: matchedSchemes
        });

    } catch (error) {
        console.error('Error in /api/schemes/preview:', error);
        res.status(500).json({ success: false, message: 'Failed to preview schemes', error: error.message });
    }
});

// POST /api/schemes/import
router.post('/schemes/import', async (req, res) => {
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
                CUST_CAT: "A"
            };
        });

        await dbf.appendRecords(recordsToAppend);
        await dbf.close();

        // Invalidate the cache whenever we successfully import
        schdtlCache = null;

        res.json({ success: true, message: `Successfully imported ${recordsToAppend.length} schemes into SCHDTL.dbf` });

    } catch (error) {
        console.error('Error in /api/schemes/import:', error);
        res.status(500).json({ success: false, message: 'Failed to import schemes', error: error.message });
    }
});

// POST /api/schemes/scrape
router.post('/schemes/scrape', (req, res) => {
    try {
        const scraperPath = path.join(__dirname, '../../scraper_puppeteer.cjs');
        const cwdPath = path.join(__dirname, '../../');
        
        console.log(`Starting scraper process from: ${scraperPath}`);
        
        exec(`node "${scraperPath}"`, { cwd: cwdPath }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Scraper error: ${error.message}`);
                console.error(`Scraper stderr: ${stderr}`);
                return res.status(500).json({ success: false, message: 'Scraping failed', error: error.message });
            }
            
            console.log(`Scraper output: ${stdout}`);
            res.json({ success: true, message: 'Successfully scraped latest schemes and updated all.json' });
        });
    } catch (error) {
         console.error('Error triggering scrape:', error);
         res.status(500).json({ success: false, message: 'Server error during scrape initiation', error: error.message });
    }
});

router.getActiveSchemesFromDBF = getActiveSchemesFromDBF;
module.exports = router;
