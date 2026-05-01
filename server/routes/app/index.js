/**
 * server/routes/app/index.js
 *
 * All routes for the user-facing ordering app.
 * Mounted at /api/app in server/app.js
 *
 * Auth strategy:
 *   - DBF (CMPL.json) is the source of truth for party identity.
 *   - SQLite (appDb) stores ONLY password hash + mustChangePassword flag.
 *   - On first login of a party code that isn't in SQLite yet → auto-register
 *     with temp password "1234" and mustChangePassword = true.
 *   - A session token (random hex) is issued and stored in app_sessions table.
 *   - Token must be sent in Authorization header as "Bearer <token>" for
 *     protected routes.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { getDbfData, ensureDirectoryExistence } = require('../utilities');
const appDb = require('../../db/app/appDb');

const BCRYPT_ROUNDS = 10;
const TEMP_PASSWORD = '1234';
const SESSION_DAYS = 30;

// Initialise SQLite tables on startup
appDb.initDb().then(() => {
    console.log('[app] appDb initialised');
    // Clean up stale sessions periodically
    appDb.deleteExpiredSessions().catch(console.error);
    setInterval(() => appDb.deleteExpiredSessions().catch(console.error), 60 * 60 * 1000);
}).catch(console.error);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load CMPL parties from cached JSON (DBF is source of truth).
 * Returns an array of party objects.
 */
const getCmplParties = async () => {
    const jsonPath = path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'CMPL.json');
    try {
        const data = await fs.readFile(jsonPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('[app] Failed to load CMPL.json, falling back to DBF');
        const dbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'CMPL.DBF');
        return getDbfData(dbfPath);
    }
};

/**
 * Find a party in CMPL by code, mobile, or phone.
 * Returns the party object or null.
 */
const findPartyByLoginId = (parties, loginId) => {
    const id = loginId.trim().toUpperCase();
    return parties.find(p =>
        (p.C_CODE && p.C_CODE.toUpperCase() === id) ||
        (p.C_MOBILE && p.C_MOBILE.trim() === loginId.trim()) ||
        (p.C_PHONE && p.C_PHONE.trim() === loginId.trim())
    ) || null;
};

/**
 * Generate a secure random session token.
 */
const generateToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Auth middleware — validates Bearer token from Authorization header.
 * Attaches `req.appPartyCode` and `req.appParty` (from CMPL) on success.
 */
const requireAppAuth = async (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const session = await appDb.getSession(token);
        if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

        req.appPartyCode = session.party_code;

        // Attach party info from CMPL
        const parties = await getCmplParties();
        req.appParty = parties.find(p => p.C_CODE === session.party_code) || null;

        next();
    } catch (err) {
        console.error('[app] Auth error:', err);
        res.status(500).json({ error: 'Auth check failed' });
    }
};

// ── Auth Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/app/login
 * Body: { loginId, password }
 *   loginId can be party code (C_CODE), mobile (C_MOBILE), or phone (C_PHONE)
 *
 * Flow:
 *   1. Look up party in CMPL (DBF) — reject if not found
 *   2. Look up in SQLite — if not found, auto-register with temp password "1234"
 *   3. Verify password hash
 *   4. Issue session token
 *   5. Return { success, token, user, mustChangePassword }
 */
router.post('/login', async (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ error: 'loginId and password are required' });
    }

    try {
        // Step 1: Verify party exists in DBF
        const parties = await getCmplParties();
        const party = findPartyByLoginId(parties, loginId);
        if (!party) {
            return res.status(401).json({ error: 'Party not found. Please contact your administrator.' });
        }

        const partyCode = party.C_CODE;

        // Step 2: Look up in SQLite
        let dbUser = await appDb.getUserByPartyCode(partyCode);

        if (!dbUser) {
            // Auto-register with temp password
            const tempHash = await bcrypt.hash(TEMP_PASSWORD, BCRYPT_ROUNDS);
            dbUser = await appDb.createUser(partyCode, tempHash, 1);
            dbUser = await appDb.getUserByPartyCode(partyCode); // re-fetch full row
        }

        // Step 3: Verify password
        const valid = await bcrypt.compare(password, dbUser.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Step 4: Create session
        const token = generateToken();
        const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
            .toISOString()
            .replace('T', ' ')
            .split('.')[0];
        await appDb.createSession(partyCode, token, expiresAt);

        // Step 5: Return response
        return res.json({
            success: true,
            token,
            mustChangePassword: dbUser.must_change_pass === 1,
            user: {
                partyCode,
                name: party.C_NAME,
                mobile: party.C_MOBILE || party.C_PHONE || '',
                address: [party.C_ADD1, party.C_ADD2, party.C_PLACE].filter(Boolean).join(', '),
                gst: party.C_GST || party.GSTNO || '',
            }
        });
    } catch (err) {
        console.error('[app/login]', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * PATCH /api/app/change-password
 * Headers: Authorization: Bearer <token>
 * Body: { currentPassword, newPassword }
 */
router.patch('/change-password', requireAppAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }

    try {
        const dbUser = await appDb.getUserByPartyCode(req.appPartyCode);
        if (!dbUser) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(currentPassword, dbUser.password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await appDb.updatePassword(req.appPartyCode, newHash);

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        console.error('[app/change-password]', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

/**
 * POST /api/app/logout
 * Headers: Authorization: Bearer <token>
 */
router.post('/logout', async (req, res) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
        await appDb.deleteSession(token).catch(console.error);
    }
    res.json({ success: true });
});

/**
 * GET /api/app/me
 * Returns current user info from CMPL (validates session).
 */
router.get('/me', requireAppAuth, async (req, res) => {
    const dbUser = await appDb.getUserByPartyCode(req.appPartyCode);
    const party = req.appParty;
    
    // Balance
    let currentBalance = '';
    try {
        const balancePath = require('path').resolve(process.cwd(), 'db', 'balance.json');
        const balanceData = require('fs').readFileSync(balancePath, 'utf8');
        const parsed = JSON.parse(balanceData);
        if (parsed.data && Array.isArray(parsed.data)) {
            const partyBal = parsed.data.find(b => b.partycode === req.appPartyCode);
            if (partyBal && partyBal.result) {
                // partyBal.result might be "123.45678 CR"
                const parts = partyBal.result.toString().trim().split(' ');
                if (parts.length >= 1) {
                    const num = parseFloat(parts[0]);
                    const suffix = parts.slice(1).join(' ');
                    currentBalance = `₹${isNaN(num) ? parts[0] : num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${suffix}`.trim();
                } else {
                    currentBalance = partyBal.result;
                }
            }
        }
    } catch (e) {
        console.error('Failed to read balance for user', e);
    }

    // Identify mobile number, falling back carefully
    let mobileStr = party?.WA_MOB || party?.C_PHONE || party?.C_MOBILE || '';
    if (mobileStr && isNaN(parseInt(mobileStr.replace(/\D/g, '')))) {
        mobileStr = party?.C_PHONE || '';
    }

    res.json({
        partyCode: req.appPartyCode,
        name: party?.C_NAME || '',
        mobile: mobileStr,
        address: party ? [party.C_ADD1, party.C_ADD2, party.C_PLACE].filter(Boolean).join(', ') : '',
        gst: party?.C_GST || party?.GSTNO || '',
        balance: currentBalance,
        mustChangePassword: dbUser ? dbUser.must_change_pass === 1 : false,
    });
});

// ── Ledger Route ──────────────────────────────────────────────────────────────

/**
 * GET /api/app/ledger
 * Returns the latest 10 ledger transactions for the logged-in user.
 */
router.get('/ledger', requireAppAuth, async (req, res) => {
    try {
        const partyCode = req.appPartyCode;
        
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        const cashPath = require('path').join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');
        
        let cashData = [];
        try {
            const cashFileContents = await require('fs').promises.readFile(cashPath, 'utf-8');
            cashData = JSON.parse(cashFileContents);
        } catch (error) {
            console.error('Error reading CASH.json:', error);
            return res.status(500).json({ message: 'Error loading ledger data.' });
        }

        // Filter cash data for the selected party
        let filteredData = cashData.filter(item => item.C_CODE === partyCode && item.DATE);

        // Sort by date descending (latest first)
        filteredData.sort((a, b) => new Date(b.DATE) - new Date(a.DATE));

        // Format the top 100 entries (we'll send 100 in case they want more, or just send them all and let frontend slice)
        const processedData = filteredData.map(item => {
            const cr = parseFloat(item.CR) || 0;
            const dr = parseFloat(item.DR) || 0;
            const itemDate = new Date(item.DATE);
            const day = String(itemDate.getDate()).padStart(2, '0');
            const month = String(itemDate.getMonth() + 1).padStart(2, '0');
            const year = itemDate.getFullYear();
            
            return {
                date: `${day}-${month}-${year}`,
                originalDate: item.DATE,
                narration: item.REMARK || '',
                book: item.VR || '',
                cr: cr,
                dr: dr,
                amount: cr > 0 ? cr : dr,
                type: cr > 0 ? 'CR' : 'DR'
            };
        });

        res.json({ success: true, data: processedData });
    } catch (error) {
        console.error('Error generating app ledger:', error);
        res.status(500).json({ message: 'Failed to generate ledger' });
    }
});

// ── Products Route ────────────────────────────────────────────────────────────

/**
 * GET /api/app/products
 * Query params: page, limit, q (search)
 * Returns paginated in-stock product list.
 */
router.get('/products', async (req, res) => {
    try {
        const jsonPath = path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'PMPL.json');
        let jsonData;
        try {
            const data = await fs.readFile(jsonPath, 'utf8');
            jsonData = JSON.parse(data);
        } catch (e) {
            const dbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'PMPL.DBF');
            jsonData = await getDbfData(dbfPath);
        }

        // Fetch current stock
        const stockRouter = require('../stock');
        const stockData = await stockRouter.calculateCurrentStock();

        // Calculate total stock per product
        jsonData = jsonData.map(p => {
            const itemStock = stockData[p.CODE] || {};
            const totalStock = Object.values(itemStock).reduce((sum, qty) => sum + (qty || 0), 0);
            return { ...p, stock: totalStock };
        });

        // Only in-stock, non-empty products
        jsonData = jsonData.filter(p => p.stock > 0 && p.PRODUCT && p.PRODUCT.trim() !== '');

        // Get product brands mapping
        const productBrandsList = await appDb.getProductBrands().catch(() => []);
        const productBrandMap = {};
        productBrandsList.forEach(pb => {
            if (pb.basepack_code && pb.brand_code) {
                productBrandMap[String(pb.basepack_code).trim()] = String(pb.brand_code).trim();
            }
        });

        // Search filter
        const query = req.query.q;
        if (query) {
            const lowerQuery = query.toLowerCase();
            jsonData = jsonData.filter(p =>
                (p.PRODUCT && p.PRODUCT.toLowerCase().includes(lowerQuery)) ||
                (p.CODE && p.CODE.toLowerCase().includes(lowerQuery))
            );
        }

        // Brand filter
        const brand = req.query.brand;
        if (brand) {
            jsonData = jsonData.filter(p => {
                const basepack = p.IT_DESC2 ? String(p.IT_DESC2).trim() : null;
                if (!basepack) return false;
                return productBrandMap[basepack] === brand;
            });
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const startIndex = (page - 1) * limit;

        const productImages = await appDb.getAllProductImages().catch(() => []);
        
        const findImage = (productName, code, basepack) => {
            if (!productName) return null;
            const name = productName.toUpperCase().trim();
            for (const img of productImages) {
                if (basepack && img.basepack_code && String(img.basepack_code).trim() === String(basepack).trim()) {
                    return img.image_url;
                }
                if (img.basepack_code && code && String(img.basepack_code).trim() === String(code).trim()) {
                    return img.image_url;
                }
                if (!img.itemvarient_desc) continue;
                const desc = img.itemvarient_desc.toUpperCase().trim();
                const matchLen = Math.min(12, name.length, desc.length);
                if (matchLen >= 8 && name.substring(0, matchLen) === desc.substring(0, matchLen)) {
                    return img.image_url;
                }
            }
            return null;
        };

        const schemeRouter = require('../shikhar_scheme');
        const schemesMap = typeof schemeRouter.getActiveSchemesFromDBF === 'function' ? await schemeRouter.getActiveSchemesFromDBF().catch(() => ({})) : {};
        
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const todayNum = parseInt('' + y + m + day, 10);

        const getIntDate = (val) => {
            if (!val) return 0;
            if (typeof val === 'string' && val.length === 8) return parseInt(val, 10);
            const d2 = new Date(val);
            if (isNaN(d2.getTime())) return 0;
            const y2 = d2.getFullYear();
            const m2 = String(d2.getMonth() + 1).padStart(2, '0');
            const day2 = String(d2.getDate()).padStart(2, '0');
            return parseInt('' + y2 + m2 + day2, 10);
        };

        const results = jsonData.slice(startIndex, startIndex + limit).map(p => {
            let productSchemes = [];
            if (schemesMap[p.CODE]) {
                productSchemes = schemesMap[p.CODE].filter(sch => {
                    const fromDateNum = getIntDate(sch.schFrom);
                    const toDateNum = getIntDate(sch.schTo);
                    return todayNum >= fromDateNum && todayNum <= toDateNum;
                }).map(sch => ({
                    slab1: sch.slab1,
                    slab2: sch.slab2,
                    discount: sch.discount
                }));
            }

            return {
                CODE: p.CODE,
                PRODUCT: p.PRODUCT,
                UNIT_1: p.UNIT_1,
                UNIT_2: p.UNIT_2,
                MULT_F: p.MULT_F,
                RATE1: p.RATE1,
                MRP1: p.MRP1,
                PACK: p.PACK,
                stock: p.stock,
                image_url: findImage(p.PRODUCT, p.CODE, p.IT_DESC2),
                schemes: productSchemes
            };
        });

        res.json({ data: results, total: jsonData.length, page, limit });
    } catch (error) {
        console.error('[app/products]', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// ── Orders Routes ─────────────────────────────────────────────────────────────

const ordersPath = path.join(__dirname, '../../db/app/orders.json');

const readOrders = async () => {
    await ensureDirectoryExistence(ordersPath);
    try {
        const data = await fs.readFile(ordersPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
};

const writeOrders = (orders) =>
    fs.writeFile(ordersPath, JSON.stringify(orders, null, 2));

/**
 * GET /api/app/orders
 * Headers: Authorization: Bearer <token>
 * Returns orders for the authenticated party.
 */
router.get('/orders', requireAppAuth, async (req, res) => {
    try {
        const orders = await readOrders();
        const userOrders = orders
            .filter(o => o.partyCode === req.appPartyCode)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(userOrders);
    } catch (err) {
        console.error('[app/orders GET]', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * GET /api/app/past-invoices
 * Headers: Authorization: Bearer <token>
 * Returns past invoices (from DBF) for the authenticated party.
 */
router.get('/past-invoices', requireAppAuth, async (req, res) => {
    try {
        const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
        if (!DBF_FOLDER_PATH) {
            return res.status(500).json({ error: 'DBF_FOLDER_PATH not configured on server' });
        }
        
        // Load bill.json (invoice headers)
        const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'bill.json');
        let bills = [];
        try {
            const data = await fs.readFile(billPath, 'utf8');
            bills = JSON.parse(data);
        } catch (e) {
            console.error('[app/past-invoices] Error reading bill.json:', e.message);
            // Fallback or empty if not found
        }

        // Filter bills by the user's party code
        const userCode = String(req.appPartyCode).trim().toUpperCase();
        let userInvoices = bills.filter(b => String(b.C_CODE || '').trim().toUpperCase() === userCode);

        // Sort by date (newest first)
        userInvoices.sort((a, b) => {
            const dateA = new Date(a.DATE || a.date || a.DT_BILL);
            const dateB = new Date(b.DATE || b.date || b.DT_BILL);
            return dateB.getTime() - dateA.getTime();
        });

        // Limit to recent ones if needed, or send all. Let's send the last 100 max.
        res.json(userInvoices.slice(0, 100));
    } catch (err) {
        console.error('[app/past-invoices GET]', err);
        res.status(500).json({ error: 'Failed to fetch past invoices' });
    }
});

/**
 * POST /api/app/orders
 * Headers: Authorization: Bearer <token>
 * Body: { items: [...], totalAmount, notes? }
 * partyCode is taken from the session — not trusted from client.
 */
router.post('/orders', requireAppAuth, async (req, res) => {
    const { items, totalAmount, notes } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
    }

    try {
        const orders = await readOrders();
        const party = req.appParty;

        // Calculate Custom Schemes Discount
        let customDiscount = 0;
        try {
            const schemes = await appDb.getAllSchemes();
            const activeSchemes = schemes.filter(s => s.is_active === 1);
            const now = new Date();
            
            for (const scheme of activeSchemes) {
                if (scheme.start_date && new Date(scheme.start_date) > now) continue;
                if (scheme.end_date && new Date(scheme.end_date) < now) continue;

                if (scheme.scheme_type === 'first_purchase') {
                    const userOrders = orders.filter(o => o.partyCode === req.appPartyCode);
                    if (userOrders.length === 0) {
                        customDiscount += scheme.discount_amount;
                    }
                } else if (scheme.scheme_type === 'overall_bill_amount') {
                    if (totalAmount >= (scheme.condition_qty || 0)) {
                        customDiscount += scheme.discount_amount;
                    }
                } else if (scheme.scheme_type === 'item_quantity') {
                    const targetItem = items.find(i => String(i.productCode).trim().toUpperCase() === String(scheme.condition_code).trim().toUpperCase());
                    if (targetItem && (targetItem.qtyBoxes >= (scheme.condition_qty || 0) || (targetItem.qtyPcs + (targetItem.qtyBoxes * 10)) >= (scheme.condition_qty || 0))) {
                        // Just checking if they have at least that many boxes (or equivalent if just qty)
                        customDiscount += scheme.discount_amount;
                    }
                }
            }
        } catch (err) {
            console.error('[app/orders POST] error calculating schemes', err);
        }

        const newOrder = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            status: 'Pending',
            partyCode: req.appPartyCode,
            partyName: party?.C_NAME || req.appPartyCode,
            items,
            totalAmount: totalAmount || 0,
            customDiscount: customDiscount,
            notes: notes || '',
        };

        orders.push(newOrder);
        await writeOrders(orders);

        res.json({ success: true, order: newOrder });
    } catch (err) {
        console.error('[app/orders POST]', err);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

// ── Admin-facing Routes ───────────────────────────────────────────────────────
// These require the main CMS JWT auth (middleware), not app session auth.
// They are prefixed with /admin/ and called by the CMS frontend.

/**
 * GET /api/app/admin/orders
 * Returns all app orders (admin only — protected by main CMS middleware above).
 * Query: status (optional filter: Pending|Approved|Rejected)
 */
router.get('/admin/orders', async (req, res) => {
    try {
        const orders = await readOrders();
        const { status } = req.query;
        const filtered = status
            ? orders.filter(o => o.status === status)
            : orders;
        // Sort newest first
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(filtered);
    } catch (err) {
        console.error('[app/admin/orders]', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * PATCH /api/app/admin/orders/:id/status
 * Body: { status: 'Approved' | 'Rejected', note?: string }
 */
router.patch('/admin/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;

    const validStatuses = ['Approved', 'Rejected', 'Pending'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        const orders = await readOrders();
        const idx = orders.findIndex(o => o.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Order not found' });

        orders[idx].status = status;
        orders[idx].adminNote = note || '';
        orders[idx].updatedAt = new Date().toISOString();

        await writeOrders(orders);
        res.json({ success: true, order: orders[idx] });
    } catch (err) {
        console.error('[app/admin/orders PATCH]', err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

/**
 * GET /api/app/admin/stats
 * Returns count of pending/approved/rejected orders.
 */
router.get('/admin/stats', async (req, res) => {
    try {
        const orders = await readOrders();
        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'Pending').length,
            approved: orders.filter(o => o.status === 'Approved').length,
            rejected: orders.filter(o => o.status === 'Rejected').length,
        };
        res.json(stats);
    } catch (err) {
        console.error('[app/admin/stats]', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * PATCH /api/app/admin/users/:partyCode/reset-password
 * Resets a user's app password to 1234 and requires change on next login.
 */
router.patch('/admin/users/:partyCode/reset-password', async (req, res) => {
    const { partyCode } = req.params;
    try {
        const dbUser = await appDb.getUserByPartyCode(partyCode);
        if (!dbUser) {
            return res.status(404).json({ error: 'User has not registered in the app yet' });
        }
        
        const tempHash = await bcrypt.hash(TEMP_PASSWORD, BCRYPT_ROUNDS);
        await appDb.resetPassword(partyCode, tempHash);
        
        res.json({ success: true, message: `Password for ${partyCode} reset to 1234` });
    } catch (err) {
        console.error('[app/admin/users/reset-password]', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

/**
 * GET /api/app/brands
 * Returns all brands for the frontend.
 */
router.get('/brands', async (req, res) => {
    try {
        const brands = await appDb.getAllBrands();
        res.json(brands);
    } catch (err) {
        console.error('[app/brands]', err);
        res.status(500).json({ error: 'Failed to fetch brands' });
    }
});

/**
 * GET /api/app/schemes/active
 * Returns active banner schemes.
 */
router.get('/schemes/active', async (req, res) => {
    try {
        const schemes = await appDb.getActiveBannerSchemes();
        res.json(schemes);
    } catch (err) {
        console.error('[app/schemes/active]', err);
        res.status(500).json({ error: 'Failed to fetch active schemes' });
    }
});

/**
 * GET /api/app/admin/schemes
 */
router.get('/admin/schemes', async (req, res) => {
    try {
        const schemes = await appDb.getAllSchemes();
        res.json(schemes);
    } catch (err) {
        console.error('[app/admin/schemes]', err);
        res.status(500).json({ error: 'Failed to fetch schemes' });
    }
});

/**
 * POST /api/app/admin/schemes
 */
router.post('/admin/schemes', async (req, res) => {
    try {
        const result = await appDb.createScheme(req.body);
        res.json({ success: true, id: result.id });
    } catch (err) {
        console.error('[app/admin/schemes POST]', err);
        res.status(500).json({ error: 'Failed to create scheme' });
    }
});

/**
 * PUT /api/app/admin/schemes/:id
 */
router.put('/admin/schemes/:id', async (req, res) => {
    try {
        const success = await appDb.updateScheme(req.params.id, req.body);
        if (!success) return res.status(404).json({ error: 'Scheme not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[app/admin/schemes PUT]', err);
        res.status(500).json({ error: 'Failed to update scheme' });
    }
});

/**
 * DELETE /api/app/admin/schemes/:id
 */
router.delete('/admin/schemes/:id', async (req, res) => {
    try {
        const success = await appDb.deleteScheme(req.params.id);
        if (!success) return res.status(404).json({ error: 'Scheme not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[app/admin/schemes DELETE]', err);
        res.status(500).json({ error: 'Failed to delete scheme' });
    }
});

module.exports = router;
