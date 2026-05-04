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
const axios = require('axios');
const cheerio = require('cheerio');
const { transliterate } = require('transliteration');

const jwt = require('jsonwebtoken');
const { getDbfData, ensureDirectoryExistence } = require('../utilities');
const appDb = require('../../db/app/appDb');

const BCRYPT_ROUNDS = 10;
const TEMP_PASSWORD = '1234';
const SESSION_DAYS = 30;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

/**
 * Admin middleware — validates the main CMS JWT token (sent by the admin dashboard).
 * The /api/app routes are mounted BEFORE the global middleware, so admin routes
 * need their own JWT check.
 */
const requireAdminJwtAuth = async (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        jwt.verify(token, JWT_SECRET); // throws if invalid/expired
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired admin token' });
    }
};

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
        let party = findPartyByLoginId(parties, loginId);
        
        // Admin bypass
        if (!party && loginId.toUpperCase() === 'ADMIN') {
             party = {
                 C_CODE: 'ADMIN',
                 C_NAME: 'Administrator',
                 C_MOBILE: '9999999999',
                 C_PHONE: '',
                 C_ADD1: 'Admin System',
                 C_ADD2: '',
                 C_PLACE: '',
                 C_GST: '',
                 GSTNO: ''
             };
        }

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

        // ── Fuzzy search helpers (pure JS, no extra deps) ──────────────────────

        /**
         * Levenshtein edit distance between two strings.
         * Returns integer number of single-char edits needed.
         */
        const levenshtein = (a, b) => {
            if (a === b) return 0;
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            const dp = Array.from({ length: a.length + 1 }, (_, i) =>
                Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
            );
            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    dp[i][j] = a[i - 1] === b[j - 1]
                        ? dp[i - 1][j - 1]
                        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
            return dp[a.length][b.length];
        };

        /**
         * Returns a similarity score 0–1 (1 = identical).
         * Uses Levenshtein normalised by max length.
         */
        const strSimilarity = (a, b) => {
            const maxLen = Math.max(a.length, b.length);
            if (maxLen === 0) return 1;
            return 1 - levenshtein(a, b) / maxLen;
        };

        /**
         * Best fuzzy score of `needle` against any word-token in `haystack`.
         * haystack is a lowercase product name string.
         */
        const bestTokenSimilarity = (needle, haystack) => {
            if (!needle || !haystack) return 0;
            // Check if needle is a prefix/substring of any token
            const tokens = haystack.split(/[\s\-\/]+/).filter(Boolean);
            let best = 0;
            for (const tok of tokens) {
                if (tok.startsWith(needle) || tok.includes(needle)) return 1; // exact hit
                const sim = strSimilarity(needle, tok.substring(0, needle.length + 2));
                if (sim > best) best = sim;
            }
            return best;
        };

        // ── Search filter ───────────────────────────────────────────────────────
        const query = req.query.q;
        let isFuzzyResult = false;
        if (query) {
            let queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
            
            // Smart translation dictionary for FMCG
            const hindiDict = {
                'साबुन': ['soap', 'bar', 'bathing'],
                'तेल': ['oil', 'hair'],
                'सर्फ': ['surf', 'detergent', 'powder', 'washing', 'excel'],
                'शैम्पू': ['shampoo', 'sachet'],
                'क्रीम': ['cream'],
                'चाय': ['tea', 'chai', 'dust', 'leaf'],
                'चायपत्ती': ['tea', 'chai', 'dust', 'leaf'],
                'बिस्किट': ['biscuit', 'marie', 'parle'],
                'नमकीन': ['namkeen', 'bhujia', 'mixture'],
                'लीटर': ['ltr', 'litre', 'l'],
                'किलो': ['kg', 'kilo'],
                'ग्राम': ['g', 'gm', 'gram'],
                'एमएल': ['ml'],
                'महाकोष': ['mk', 'mahakosh'],
                'महाकोश': ['mk', 'mahakosh'],
                'नंबर': ['no', 'number'],
                'वन': ['1', 'one'],
                'वाला': [], 'का': [], 'की': [], 'और': [], 'पैक': ['pack', 'pkt']
            };

            const expandedWords = [];
            const numbers = [];

            for (const word of queryWords) {
                // If it's a number, save it for MRP/Rate matching
                if (!isNaN(parseFloat(word))) {
                    numbers.push(parseFloat(word));
                    expandedWords.push(word);
                    continue;
                }

                if (hindiDict[word]) {
                    expandedWords.push(...hindiDict[word]);
                } else {
                    // Transliterate and simplify (riin -> rin, mhaakosh -> mahakosh)
                    let trans = transliterate(word).toLowerCase();
                    trans = trans.replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/uu/g, 'u').replace(/ee/g, 'i').replace(/oo/g, 'u');
                    if (trans.startsWith('mh')) trans = trans.replace('mh', 'mah');
                    if (trans.startsWith('lh')) trans = trans.replace('lh', 'lah');
                    expandedWords.push(trans);
                    
                    // Add the original word just in case
                    expandedWords.push(word);
                }
            }
            
            const scoredData = jsonData.map(p => {
                let score = 0;
                const prodLower = (p.PRODUCT || '').toLowerCase();
                const codeLower = (p.CODE || '').toLowerCase();
                
                // Exact matches get a huge boost
                const fullQuery = query.toLowerCase();
                if (prodLower === fullQuery || codeLower === fullQuery) score += 1000;
                else if (prodLower.includes(fullQuery) || codeLower.includes(fullQuery)) score += 100;
                
                // Check individual words
                for (const word of expandedWords) {
                    if (word.length === 0) continue;
                    if (new RegExp(`\\b${word}\\b`).test(prodLower)) score += 10;
                    else if (prodLower.includes(word)) score += 1;
                    
                    if (codeLower.includes(word)) score += 10;
                }

                // Smart Number Matching (if user says "10 wala")
                for (const num of numbers) {
                    const mrp = parseFloat(p.MRP1 || '0');
                    const rate = parseFloat(p.RATE1 || '0');
                    if (mrp === num || rate === num) {
                        score += 50; // High boost for matching price
                    } else if (prodLower.includes(num.toString())) {
                        score += 20; // Boost if number is in product name (e.g. 100G)
                    }
                }

                return { ...p, _searchScore: score };
            });
            
            // ── Primary filter: exact/substring/transliteration matches ─────────
            const exactMatches = scoredData
                .filter(p => p._searchScore > 0)
                .sort((a, b) => b._searchScore - a._searchScore);

            if (exactMatches.length > 0) {
                // We have good matches — use them
                jsonData = exactMatches;
            } else {
                // ── Fuzzy fallback: tolerate typos via Levenshtein ─────────────
                isFuzzyResult = true;

                // Only non-number query words participate in fuzzy matching
                const fuzzyWords = expandedWords.filter(w => w.length >= 3 && isNaN(parseFloat(w)));

                const fuzzyScored = jsonData.map(p => {
                    const prodLower = (p.PRODUCT || '').toLowerCase();
                    const codeLower = (p.CODE || '').toLowerCase();
                    let fuzzyScore = 0;

                    for (const word of fuzzyWords) {
                        // Best similarity of this word token vs product name tokens
                        const sim = bestTokenSimilarity(word, prodLower);
                        // Threshold: at least 0.6 similarity (tolerates ~40% edits)
                        if (sim >= 0.6) {
                            fuzzyScore += Math.round(sim * 50);
                        }
                        // Also fuzzy match against product CODE
                        const codeSim = strSimilarity(word, codeLower.substring(0, word.length + 2));
                        if (codeSim >= 0.7) {
                            fuzzyScore += Math.round(codeSim * 30);
                        }
                    }

                    // Number matching still applies
                    for (const num of numbers) {
                        const mrp = parseFloat(p.MRP1 || '0');
                        const rate = parseFloat(p.RATE1 || '0');
                        if (mrp === num || rate === num) fuzzyScore += 50;
                        else if (prodLower.includes(num.toString())) fuzzyScore += 20;
                    }

                    return { ...p, _searchScore: fuzzyScore, _fuzzy: fuzzyScore > 0 };
                });

                jsonData = fuzzyScored
                    .filter(p => p._searchScore > 0)
                    .sort((a, b) => b._searchScore - a._searchScore)
                    .slice(0, 40); // cap fuzzy results to top 40
            }
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

        // Evaluate schemes before sorting and pagination
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

        // Attach boolean _hasScheme for sorting
        jsonData.forEach(p => {
            let hasScheme = false;
            if (schemesMap[p.CODE]) {
                hasScheme = schemesMap[p.CODE].some(sch => {
                    const fromDateNum = getIntDate(sch.schFrom);
                    const toDateNum = getIntDate(sch.schTo);
                    return todayNum >= fromDateNum && todayNum <= toDateNum;
                });
            }
            p._hasScheme = hasScheme;
        });

        // Apply sorting based on req.query.sort (only if search score wasn't applied or user explicitly sorted)
        const sort = req.query.sort;
        if (sort === 'az') {
            jsonData.sort((a, b) => (a.PRODUCT || '').localeCompare(b.PRODUCT || ''));
        } else if (sort === 'mrp') {
            jsonData.sort((a, b) => {
                const diff = (parseFloat(a.MRP1) || 0) - (parseFloat(b.MRP1) || 0);
                return diff !== 0 ? diff : (a.PRODUCT || '').localeCompare(b.PRODUCT || '');
            });
        } else if (sort === 'mrp-desc') {
            jsonData.sort((a, b) => {
                const diff = (parseFloat(b.MRP1) || 0) - (parseFloat(a.MRP1) || 0);
                return diff !== 0 ? diff : (a.PRODUCT || '').localeCompare(b.PRODUCT || '');
            });
        } else if (sort === 'scheme') {
            jsonData.sort((a, b) => {
                if (a._hasScheme && !b._hasScheme) return -1;
                if (!a._hasScheme && b._hasScheme) return 1;
                return (a.PRODUCT || '').localeCompare(b.PRODUCT || '');
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

        const productMeta = await appDb.getAllProductMeta().catch(() => []);
        const metaMap = {};
        productMeta.forEach(m => metaMap[m.product_code] = m);

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

            const meta = metaMap[p.CODE] || {};
            const img = meta.image_url || findImage(p.PRODUCT, p.CODE, p.IT_DESC2);

            return {
                CODE: p.CODE,
                PRODUCT: meta.nickname || p.PRODUCT, // override product name with nickname if present
                UNIT_1: p.UNIT_1,
                UNIT_2: p.UNIT_2,
                MULT_F: p.MULT_F,
                RATE1: p.RATE1,
                MRP1: p.MRP1,
                PACK: p.PACK,
                stock: p.stock,
                image_url: img,
                schemes: productSchemes,
                brand_code: meta.brand_code || productBrandMap[p.IT_DESC2 ? String(p.IT_DESC2).trim() : ''] || ''
            };
        });

        res.json({ data: results, total: jsonData.length, page, limit, isFuzzy: isFuzzyResult });
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
        let userInvoices = bills.filter(b => b && String(b.C_CODE || '').trim().toUpperCase() === userCode);

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

        // Calculate the next T series bill number to assign a unique ID
        let maxTBill = 0;
        
        const checkMax = (data, getSeries, getBillNo) => {
            if (!Array.isArray(data)) return;
            data.forEach(entry => {
                const s = getSeries(entry)?.toUpperCase();
                const b = Number(getBillNo(entry));
                if (s === 'T' && !isNaN(b)) {
                    if (b > maxTBill) maxTBill = b;
                }
            });
        };

        try {
            const invData = await fs.readFile(path.join(__dirname, '../../db/invoicing.json'), 'utf8').then(JSON.parse);
            checkMax(invData, e => e.series, e => e.billNo);
        } catch (e) {}
        
        try {
            const appInvData = await fs.readFile(path.join(__dirname, '../../db/approved/invoicing.json'), 'utf8').then(JSON.parse);
            checkMax(appInvData, e => e.series, e => e.billNo);
        } catch (e) {}
        
        try {
            const billdtlData = await fs.readFile(path.join(process.env.DBF_FOLDER_PATH, 'data/json/billdtl.json'), 'utf8').then(JSON.parse);
            checkMax(billdtlData, e => e.SERIES, e => e.BILL);
        } catch (e) {}

        checkMax(orders, e => e.series, e => e.billNo);

        const nextTBillNo = maxTBill + 1;

        const newOrder = {
            id: `T${nextTBillNo}`,
            series: 'T',
            billNo: nextTBillNo,
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

    const validStatuses = ['Approved', 'Rejected', 'Pending', 'Invoiced'];
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
 * PATCH /api/app/admin/orders/:id/mark-invoiced
 * Body: { billNo: string, series: string }
 * Marks an app order as Invoiced and stores the bill reference.
 */
router.patch('/admin/orders/:id/mark-invoiced', async (req, res) => {
    const { id } = req.params;
    const { billNo, series } = req.body;

    if (!billNo || !series) {
        return res.status(400).json({ error: 'billNo and series are required' });
    }

    try {
        const orders = await readOrders();
        const idx = orders.findIndex(o => o.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Order not found' });

        orders[idx].status = 'Invoiced';
        orders[idx].invoiceBillNo = billNo;
        orders[idx].invoiceSeries = series;
        orders[idx].invoiceRef = `${series}-${billNo}`;
        orders[idx].updatedAt = new Date().toISOString();

        await writeOrders(orders);
        res.json({ success: true, order: orders[idx] });
    } catch (err) {
        console.error('[app/admin/orders/mark-invoiced PATCH]', err);
        res.status(500).json({ error: 'Failed to mark order as invoiced' });
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
            invoiced: orders.filter(o => o.status === 'Invoiced').length,
        };
        res.json(stats);
    } catch (err) {
        console.error('[app/admin/stats]', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * POST /api/app/admin/product-image
 * Headers: Authorization: Bearer <token>
 * Body: { productCode, imageUrl }
 */
router.post('/admin/product-image', requireAdminJwtAuth, async (req, res) => {
    const { productCode, imageUrl } = req.body;
    if (!productCode || !imageUrl) return res.status(400).json({ error: 'productCode and imageUrl required' });
    
    let finalUrl = imageUrl;
    if (imageUrl.startsWith('data:image')) {
        const matches = imageUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const data = Buffer.from(matches[2], 'base64');
            const filename = `prod_${productCode.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}.${ext}`;
            const uploadDir = path.join(__dirname, '../../../public/uploads');
            await ensureDirectoryExistence(path.join(uploadDir, filename));
            await fs.writeFile(path.join(uploadDir, filename), data);
            finalUrl = `/uploads/${filename}`;
        }
    }

    try {
        await appDb.updateProductMetaImage(productCode, finalUrl);
        res.json({ success: true, imageUrl: finalUrl });
    } catch(err) {
        console.error('[app/admin/product-image POST]', err);
        res.status(500).json({ error: 'Failed to update image' });
    }
});

/**
 * GET /api/app/admin/amazon-search
 * Query: q=search_term
 */
router.get('/admin/amazon-search', requireAdminJwtAuth, async (req, res) => {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Query parameter q required' });

    try {
        const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(q)}`;
        const response = await axios.get(amazonUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });
        const $ = cheerio.load(response.data);
        const images = [];
        $('.s-image').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.startsWith('https://m.media-amazon.com/images/I/')) {
                // remove resize parameters to get high res image
                const highRes = src.replace(/\._AC_[a-zA-Z0-9_,]*_\./, '.');
                images.push(highRes);
            }
        });
        
        const uniqueImages = [...new Set(images)].slice(0, 10);
        res.json({ images: uniqueImages });
    } catch (err) {
        console.error('[app/admin/amazon-search]', err);
        res.status(500).json({ error: 'Failed to search amazon' });
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
 * Returns merged brands (brands_custom overrides brands table) for the frontend.
 */
router.get('/brands', async (req, res) => {
    try {
        const [baseBrands, customBrands, productBrandsList, productMeta] = await Promise.all([
            appDb.getAllBrands(),
            appDb.getAllCustomBrands(),
            appDb.getProductBrands().catch(() => []),
            appDb.getAllProductMeta().catch(() => [])
        ]);

        // Build basepack -> brand_code map
        const bpBrandMap = {};
        productBrandsList.forEach(pb => {
            if (pb.basepack_code && pb.brand_code)
                bpBrandMap[String(pb.basepack_code).trim()] = String(pb.brand_code).trim();
        });

        // Build product_code -> brand_code map from meta overrides
        const metaBrandMap = {};
        productMeta.forEach(m => { if (m.brand_code) metaBrandMap[m.product_code] = m.brand_code; });

        // Count in-stock products per brand (same stock check as /products endpoint)
        const countMap = {};
        try {
            const jsonPath = path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'PMPL.json');
            const raw = await fs.readFile(jsonPath, 'utf8');
            const pmpl = JSON.parse(raw);

            const stockRouter = require('../stock');
            const stockData = await stockRouter.calculateCurrentStock();

            pmpl.forEach(p => {
                if (!p.PRODUCT || !p.PRODUCT.trim()) return;
                // Stock check — same logic as /products
                const itemStock = stockData[p.CODE] || {};
                const totalStock = Object.values(itemStock).reduce((sum, qty) => sum + (qty || 0), 0);
                if (totalStock <= 0) return;

                const brandCode = metaBrandMap[p.CODE] || bpBrandMap[p.IT_DESC2 ? String(p.IT_DESC2).trim() : ''] || '';
                if (brandCode) countMap[brandCode] = (countMap[brandCode] || 0) + 1;
            });
        } catch (e) { /* PMPL/stock unavailable — skip count filtering */ }

        // Custom brands override base brands by brand_code
        const customMap = {};
        customBrands.forEach(b => { customMap[b.brand_code] = b; });

        // Start with base brands, map to unified structure
        const merged = baseBrands.map(b => {
            const custom = customMap[b.brand_code];
            return {
                brand_code: b.brand_code,
                brand_desc: custom ? custom.brand_name : b.brand_desc,
                image_url: custom ? (custom.image_url || b.image_url) : b.image_url,
                is_custom: !!custom,
                product_count: countMap[b.brand_code] || 0
            };
        });

        // Add custom-only brands that have no base counterpart
        customBrands.forEach(b => {
            if (!merged.find(m => m.brand_code === b.brand_code)) {
                merged.push({
                    brand_code: b.brand_code,
                    brand_desc: b.brand_name,
                    image_url: b.image_url,
                    is_custom: true,
                    product_count: countMap[b.brand_code] || 0
                });
            }
        });

        // Filter out brands with no in-stock products, then sort
        const active = merged.filter(b => b.product_count > 0);
        active.sort((a, b) => (a.brand_desc || '').localeCompare(b.brand_desc || ''));
        res.json(active);
    } catch (err) {
        console.error('[app/brands]', err);
        res.status(500).json({ error: 'Failed to fetch brands' });
    }
});

/**
 * GET /api/app/admin/brands
 * Returns all brands with product counts from product_meta and base mappings.
 */
router.get('/admin/brands', async (req, res) => {
    try {
        const [baseBrands, customBrands, productsBase, productMeta] = await Promise.all([
            appDb.getAllBrands(),
            appDb.getAllCustomBrands(),
            appDb.getProductBrands().catch(() => []),
            appDb.getAllProductMeta().catch(() => [])
        ]);

        // 1. Get all products to count correctly
        const jsonPath = path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'PMPL.json');
        let jsonData;
        try {
            const data = await fs.readFile(jsonPath, 'utf8');
            jsonData = JSON.parse(data);
        } catch (e) {
            const dbfPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'PMPL.DBF');
            jsonData = await getDbfData(dbfPath);
        }

        // 2. Maps for quick lookup
        const metaMap = {};
        productMeta.forEach(m => metaMap[m.product_code] = m);

        const baseMap = {};
        productsBase.forEach(pb => {
            if (pb.basepack_code) baseMap[String(pb.basepack_code).trim()] = String(pb.brand_code).trim();
        });

        // 3. Count products per brand
        const brandProductCount = {};
        jsonData.forEach(p => {
            if (!p.CODE) return;
            const meta = metaMap[p.CODE];
            const basepack = p.IT_DESC2 ? String(p.IT_DESC2).trim() : null;
            
            // Custom brand code from meta overrides base brand code
            const brandCode = (meta && meta.brand_code) || (basepack ? baseMap[basepack] : null);
            
            if (brandCode) {
                brandProductCount[brandCode] = (brandProductCount[brandCode] || 0) + 1;
            }
        });

        const customMap = {};
        customBrands.forEach(b => { customMap[b.brand_code] = b; });

        const merged = baseBrands.map(b => {
            const custom = customMap[b.brand_code];
            return {
                brand_code: b.brand_code,
                brand_name: custom ? custom.brand_name : b.brand_desc,
                image_url: custom ? (custom.image_url || b.image_url) : b.image_url,
                is_custom: !!custom,
                custom_id: custom ? custom.id : null,
                product_count: brandProductCount[b.brand_code] || 0
            };
        });

        customBrands.forEach(b => {
            if (!merged.find(m => m.brand_code === b.brand_code)) {
                merged.push({
                    brand_code: b.brand_code,
                    brand_name: b.brand_name,
                    image_url: b.image_url,
                    is_custom: true,
                    custom_id: b.id,
                    product_count: brandProductCount[b.brand_code] || 0
                });
            }
        });

        merged.sort((a, b) => (a.brand_name || '').localeCompare(b.brand_name || ''));
        res.json(merged);
    } catch (err) {
        console.error('[app/admin/brands]', err);
        res.status(500).json({ error: 'Failed to fetch brands' });
    }
});

/**
 * POST /api/app/admin/brands
 * Upsert a brand into brands_custom (by brand_code).
 */
router.post('/admin/brands', async (req, res) => {
    try {
        const { brand_code, brand_name, image_url } = req.body;
        if (!brand_code || !brand_name) return res.status(400).json({ error: 'brand_code and brand_name required' });

        const existing = await appDb.getAllCustomBrands();
        const found = existing.find(b => b.brand_code === brand_code);

        if (found) {
            await appDb.updateCustomBrand(found.id, { brand_name, image_url });
        } else {
            await appDb.createCustomBrand({ brand_code, brand_name, image_url });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[app/admin/brands POST]', err);
        res.status(500).json({ error: 'Failed to upsert brand' });
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

// ── App Listings / Products Admin ─────────────────────────────────────────────

/**
 * GET /api/app/admin/products
 */
router.get('/admin/products', async (req, res) => {
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

        // Get product brands mapping
        const productBrandsList = await appDb.getProductBrands().catch(() => []);
        const productBrandMap = {};
        productBrandsList.forEach(pb => {
            if (pb.basepack_code && pb.brand_code) {
                productBrandMap[String(pb.basepack_code).trim()] = String(pb.brand_code).trim();
            }
        });

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

        const productMeta = await appDb.getAllProductMeta().catch(() => []);
        const metaMap = {};
        productMeta.forEach(m => {
            metaMap[m.product_code] = m;
        });

        // We only show active products usually, but admin should see all
        // Let's filter out products with empty CODE or PRODUCT just to be safe
        jsonData = jsonData.filter(p => p.PRODUCT && p.CODE && p.PRODUCT.trim() !== '');

        const results = jsonData.map(p => {
            const meta = metaMap[p.CODE] || {};
            const img = meta.image_url || findImage(p.PRODUCT, p.CODE, p.IT_DESC2);
            return {
                CODE: p.CODE,
                PRODUCT: p.PRODUCT,
                UNIT_1: p.UNIT_1,
                UNIT_2: p.UNIT_2,
                MULT_F: p.MULT_F,
                RATE1: p.RATE1,
                MRP1: p.MRP1,
                PACK: p.PACK,
                nickname: meta.nickname || '',
                brand_code: meta.brand_code || productBrandMap[p.IT_DESC2 ? String(p.IT_DESC2).trim() : ''] || '',
                image_url: img || ''
            };
        });

        res.json(results);
    } catch (err) {
        console.error('[app/admin/products]', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

/**
 * PUT /api/app/admin/products/:code/meta
 */
router.put('/admin/products/:code/meta', async (req, res) => {
    try {
        const product_code = req.params.code;
        await appDb.upsertProductMeta(product_code, req.body);
        res.json({ success: true });
    } catch (err) {
        console.error('[app/admin/products/:code/meta]', err);
        res.status(500).json({ error: 'Failed to update product meta' });
    }
});

// ── Custom Brands Admin ───────────────────────────────────────────────────────

/**
 * GET /api/app/admin/brands_custom
 */
router.get('/admin/brands_custom', async (req, res) => {
    try {
        const brands = await appDb.getAllCustomBrands();
        res.json(brands);
    } catch (err) {
        console.error('[app/admin/brands_custom]', err);
        res.status(500).json({ error: 'Failed to fetch custom brands' });
    }
});

/**
 * POST /api/app/admin/brands_custom
 */
router.post('/admin/brands_custom', async (req, res) => {
    try {
        const result = await appDb.createCustomBrand(req.body);
        res.json({ success: true, id: result.id });
    } catch (err) {
        console.error('[app/admin/brands_custom POST]', err);
        res.status(500).json({ error: 'Failed to create custom brand' });
    }
});

/**
 * PUT /api/app/admin/brands_custom/:id
 */
router.put('/admin/brands_custom/:id', async (req, res) => {
    try {
        const success = await appDb.updateCustomBrand(req.params.id, req.body);
        if (!success) return res.status(404).json({ error: 'Brand not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[app/admin/brands_custom PUT]', err);
        res.status(500).json({ error: 'Failed to update custom brand' });
    }
});

/**
 * DELETE /api/app/admin/brands_custom/:id
 */
router.delete('/admin/brands_custom/:id', async (req, res) => {
    try {
        const success = await appDb.deleteCustomBrand(req.params.id);
        if (!success) return res.status(404).json({ error: 'Brand not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[app/admin/brands_custom DELETE]', err);
        res.status(500).json({ error: 'Failed to delete custom brand' });
    }
});

module.exports = router;
