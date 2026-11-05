const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { DBFFile } = require('../dbf-orm/dbffile.js');
const { downloadSchemes, sessionStatus, saveSession, OUTPUT_FILE: SHIKHAR_ALL_JSON } = require('../utils/shikharSchemes');

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Serve the cached value at once and refresh it in the background when stale, so billing
// never waits on a DBF read (on the busy server a cold read has taken 7-9 s).
// Concurrent misses share one read; a failed read is not cached.
function staleWhileRevalidate(name, loader) {
    let value = null;
    let loadedAt = 0;
    let inflight = null;
    let generation = 0;
    const refresh = () => {
        if (!inflight) {
            const gen = generation;
            const read = loader()
                .then(v => {
                    // Drop a read that started before invalidate(); it may predate the change
                    if (gen === generation) { value = v; loadedAt = Date.now(); }
                    return v;
                })
                .finally(() => { if (inflight === read) inflight = null; });
            inflight = read;
        }
        return inflight;
    };
    const get = async () => {
        if (value) {
            if (Date.now() - loadedAt >= CACHE_TTL) {
                refresh().catch(error => console.error(`Error refreshing ${name}:`, error));
            }
            return value;
        }
        return refresh();
    };
    // Next call reads the file again (use after writing it)
    get.invalidate = () => { value = null; loadedAt = 0; generation++; inflight = null; };
    return get;
}

const dataFile = (name) => path.join(process.env.DBF_FOLDER_PATH || path.join(__dirname, '../../d01-2324'), 'data', name);

const loadSchdtl = staleWhileRevalidate('SCHDTL.dbf', async () => {
    const dbf = await DBFFile.open(dataFile('SCHDTL.DBF'));
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
            activityCode: record.ACTIVITY_C,
            custCat: (record.CUST_CAT || '').trim().toUpperCase()
        });
    }
    return activeSchemesMap;
});

async function getActiveSchemesFromDBF() {
    try {
        return await loadSchdtl();
    } catch (error) {
        console.error('Error caching SCHDTL.dbf:', error);
        return {};
    }
}

// Party code -> 'W' (wholesale) or 'R' (retail), from CMPL.CUST_CAT. Only CUST_CAT "W" is wholesale.
const loadPartySides = staleWhileRevalidate('CMPL.dbf', async () => {
    const dbf = await DBFFile.open(dataFile('CMPL.DBF'));
    const records = await dbf.readRecords();
    await dbf.close();
    const sides = {};
    for (const record of records) {
        const code = record.C_CODE?.trim();
        if (code) sides[code] = (record.CUST_CAT || '').trim().toUpperCase() === 'W' ? 'W' : 'R';
    }
    return sides;
});

async function getPartySide(partyCode) {
    if (!partyCode) return 'R';
    try {
        return (await loadPartySides())[partyCode.trim()] || 'R';
    } catch (error) {
        console.error('Error reading CMPL.dbf for customer categories:', error);
        return 'R';
    }
}

// Warm both caches at startup so the first bill doesn't pay for the reads
setImmediate(() => {
    getActiveSchemesFromDBF();
    getPartySide('-');
});

// Scheme rows tagged R / W apply to that side only; blank or anything else (e.g. legacy "A") applies to all
function schemeAppliesToSide(custCat, side) {
    if (custCat === 'R' || custCat === 'W') return custCat === side;
    return true;
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
        const partySide = await getPartySide(req.query.partyCode);
        const itemSchemes = (schemesMap[itemCode] || []).filter(sch => schemeAppliesToSide(sch.custCat, partySide));
        
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

// Shikhar slab types: discount_type 2 / "%" = percent, 1 = rupees per unit; discount_cat 3 = rupee value range.
// SCHDTL only understands "% off when quantity is in SLAB1..SLAB2", so anything else is listed, not imported.
function shikharNotImportableReason(s) {
    const type = String(s.discount_type ?? '');
    const cat = String(s.discount_cat ?? s.new_discount_cat ?? '');
    if (type === '1' || /rs|flat/i.test(type)) return 'Flat rupees off per unit';
    if (cat === '3') return 'Order value slab (Rs range)';
    return null;
}

// SCHDTL.CUST_CAT for the Party Type picked on the page: R = retail only, W = wholesale only, A = everyone
const SHIKHAR_CUST_CAT = { RT: 'R', WS: 'W', BOTH: 'A' };

// GET /api/schemes/preview
router.get('/schemes/preview', async (req, res) => {
    try {
        const pmplMap = await getPmplMapping();
        const allJsonPath = SHIKHAR_ALL_JSON;

        const allJsonContent = await fs.readFile(allJsonPath, 'utf8');
        const shikharData = JSON.parse(allJsonContent);

        const matchedSchemes = [];
        const seenIds = new Set();
        let totalProcessed = 0;
        let totalMatched = 0;

        // Helper: normalise a raw scheme entry from any Shikhar field into our format
        const normaliseScheme = (s) => ({
            discount:    parseFloat(s.discount ?? s.scheme_discount ?? s.slab_discount ?? 0),
            activitycode: s.activitycode ?? s.activity_code ?? s.activityCode ?? 0,
            scheme_desc: s.scheme_desc ?? s.schemename ?? s.scheme_name ?? '',
            slab_start:  parseFloat(s.scheme_slab_start ?? s.slab_start ?? s.slabstart ?? s.min_qty ?? 1),
            slab_end:    parseFloat(s.scheme_slab_end   ?? s.slab_end   ?? s.slabend   ?? s.max_qty ?? 99999),
            reason:      shikharNotImportableReason(s),
        });
        const notImported = new Map();

        if (shikharData.brands && Array.isArray(shikharData.brands)) {
            for (const brand of shikharData.brands) {
                if (!brand.products || !Array.isArray(brand.products)) continue;

                for (const product of brand.products) {
                    totalProcessed++;
                    const basepackCode = product.basepack_code;
                    if (!basepackCode) continue;

                    const pmplCodes = pmplMap[basepackCode];
                    if (!pmplCodes || pmplCodes.length === 0) continue;

                    // Collect schemes from ALL possible fields
                    const rawSchemes = [
                        ...(Array.isArray(product.new_schemes_info)   ? product.new_schemes_info   : []),
                        ...(Array.isArray(product.groupscheme_info)    ? product.groupscheme_info    : []),
                        ...(Array.isArray(product.scheme_info)         ? product.scheme_info         : []),
                        ...(Array.isArray(product.schemes_info)        ? product.schemes_info        : []),
                        ...(Array.isArray(product.bulk_offers)         ? product.bulk_offers         : []),
                    ];

                    if (rawSchemes.length === 0) continue;
                    totalMatched++;

                    for (const pmplCode of pmplCodes) {
                        for (const raw of rawSchemes) {
                            const s = normaliseScheme(raw);
                            // Skip entries with no actual discount
                            if (!s.discount || s.discount <= 0) continue;
                            // Rupee-based schemes would be read as % / unit slabs by SCHDTL: list them instead
                            if (s.reason) {
                                const key = `${s.activitycode}_${s.slab_start}`;
                                const entry = notImported.get(key) || {
                                    activitycode: s.activitycode,
                                    scheme_desc: s.scheme_desc,
                                    reason: s.reason,
                                    discount: s.discount,
                                    products: new Set()
                                };
                                entry.products.add(pmplCode);
                                notImported.set(key, entry);
                                continue;
                            }
                            const id = `${basepackCode}_${pmplCode}_${s.activitycode}_${s.slab_start}_${s.slab_end}`;
                            if (seenIds.has(id)) continue;
                            seenIds.add(id);

                            matchedSchemes.push({
                                id,
                                basepack_code: basepackCode,
                                pmpl_code: pmplCode,
                                product_desc: product.itemvarient_desc || product.itemvarientdesc || '',
                                discount:     s.discount,
                                activitycode: s.activitycode,
                                scheme_desc:  s.scheme_desc,
                                slab_start:   s.slab_start,
                                slab_end:     s.slab_end,
                                // Tagged by the two-outlet download; older single-outlet files were retail only
                                segment:      raw.outlet_segment || 'RT',
                            });
                        }
                    }
                }
            }
        }

        res.json({
            success: true,
            total_products: totalProcessed,
            matched_products: totalMatched,
            scraped_at: shikharData.scraped_at || null,
            outlets: shikharData.outlets || null,
            schemes: matchedSchemes,
            not_imported: [...notImported.values()].map(({ products, ...rest }) => ({ ...rest, matched_products: products.size }))
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
                CUST_CAT: SHIKHAR_CUST_CAT[scheme.segment] ?? 'A'
            };
        });

        await dbf.appendRecords(recordsToAppend);
        await dbf.close();

        // Invalidate the cache whenever we successfully import
        loadSchdtl.invalidate();

        res.json({ success: true, message: `Successfully imported ${recordsToAppend.length} schemes into SCHDTL.dbf` });

    } catch (error) {
        console.error('Error in /api/schemes/import:', error);
        res.status(500).json({ success: false, message: 'Failed to import schemes', error: error.message });
    }
});

// POST /api/schemes/scrape - download from the retail and wholesale Shikhar outlets, tag each slab RT / WS / BOTH
router.post('/schemes/scrape', async (req, res) => {
    try {
        const result = await downloadSchemes();
        const names = Object.entries(result.outlets).map(([side, o]) => `${side}: ${o.name}`).join(', ');
        const warning = result.missing.length
            ? ` No ${result.missing.join(' / ')} cookie saved, so those schemes are missing.`
            : '';
        res.json({
            success: true,
            message: `Downloaded ${result.products} products (${names}). Slabs: ${result.slabs.RT} retail, ${result.slabs.WS} wholesale, ${result.slabs.BOTH} both.${warning}`,
            ...result
        });
    } catch (error) {
        console.error('Error downloading Shikhar schemes:', error);
        res.status(502).json({ success: false, message: error.message });
    }
});

// GET /api/schemes/sessions - which outlet each saved cookie logs in as (never returns the cookie)
router.get('/schemes/sessions', async (req, res) => {
    try {
        res.json({ success: true, sessions: await sessionStatus() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/schemes/update-cookies
// Body: { side: "retail" | "wholesale", cookieValue: "<'data' cookie value from shikhar.hulcd.com>" }
router.post('/schemes/update-cookies', async (req, res) => {
    try {
        const { side = 'retail', cookieValue } = req.body || {};
        if (!cookieValue || typeof cookieValue !== 'string' || cookieValue.trim().length < 20) {
            return res.status(400).json({ success: false, message: 'Paste the "data" cookie value.' });
        }
        const saved = await saveSession(side, cookieValue);
        res.json({
            success: true,
            message: `${side === 'wholesale' ? 'Wholesale' : 'Retail'} cookie saved: logged in as ${saved.outlet} (${saved.hulid}).`,
            ...saved
        });
    } catch (error) {
        console.error('Error saving Shikhar cookie:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

router.getActiveSchemesFromDBF = getActiveSchemesFromDBF;
// Same retail / wholesale filtering as billing, for the customer app
router.getPartySide = getPartySide;
router.schemeAppliesToSide = schemeAppliesToSide;
router.invalidateSchemesCache = () => loadSchdtl.invalidate();
module.exports = router;
