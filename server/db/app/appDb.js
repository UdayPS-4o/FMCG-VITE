/**
 * appDb.js — SQLite helper for app user auth & sessions
 *
 * Philosophy:
 *   - DBF (CMPL.json) is the source of truth for party identity.
 *   - This DB only stores: password hash, mustChangePassword flag, and sessions.
 *   - A "user" here is always a party from CMPL.
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'data.sqlite');

let db;

function getDb() {
    if (!db) {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) console.error('[appDb] Failed to open SQLite:', err);
            else console.log('[appDb] SQLite connected');
        });
        db.run('PRAGMA journal_mode=WAL;');
    }
    return db;
}

/**
 * Initialise app_users and app_sessions tables if they don't exist.
 */
function initDb() {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS app_users (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    party_code       TEXT    NOT NULL UNIQUE,  -- matches C_CODE in CMPL
                    password_hash    TEXT    NOT NULL,         -- bcrypt hash
                    must_change_pass INTEGER NOT NULL DEFAULT 1, -- 1 = yes, 0 = no
                    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
                    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
                )
            `, (err) => { if (err) return reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS app_sessions (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    party_code TEXT    NOT NULL,
                    token      TEXT    NOT NULL UNIQUE,
                    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                    expires_at TEXT    NOT NULL
                )
            `, (err) => {
                if (err) return reject(err);
                
                db.run(`
                    CREATE TABLE IF NOT EXISTS app_schemes (
                        id               INTEGER PRIMARY KEY AUTOINCREMENT,
                        name             TEXT    NOT NULL,
                        discount_amount  REAL    NOT NULL,
                        scheme_type      TEXT    NOT NULL,
                        condition_code   TEXT,
                        condition_qty    INTEGER,
                        sub_group        TEXT,
                        start_date       TEXT,
                        end_date         TEXT,
                        is_active        INTEGER NOT NULL DEFAULT 1,
                        show_as_banner   INTEGER NOT NULL DEFAULT 1,
                        banner_text      TEXT    NOT NULL,
                        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
                        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
                    )
                `, (err2) => {
                    if (err2) return reject(err2);

                    db.run(`
                        CREATE TABLE IF NOT EXISTS brands_custom (
                            id         INTEGER PRIMARY KEY AUTOINCREMENT,
                            brand_code TEXT    NOT NULL UNIQUE,
                            brand_name TEXT    NOT NULL,
                            image_url  TEXT,
                            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                            updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
                        )
                    `, (err3) => {
                        if (err3) return reject(err3);

                        db.run(`
                            CREATE TABLE IF NOT EXISTS product_meta (
                                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                                product_code TEXT    NOT NULL UNIQUE,
                                nickname     TEXT,
                                brand_code   TEXT,
                                image_url    TEXT,
                                created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
                                updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
                            )
                        `, (err4) => {
                            if (err4) return reject(err4);

                            // wa_carts: store WhatsApp Commerce order items until customer opens app
                            db.run(`
                                CREATE TABLE IF NOT EXISTS wa_carts (
                                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                                    phone      TEXT    NOT NULL UNIQUE,
                                    items_json TEXT    NOT NULL,
                                    saved_at   TEXT    NOT NULL DEFAULT (datetime('now'))
                                )
                            `, (err5) => {
                                if (err5) return reject(err5);
                                resolve();
                            });
                        });
                    });
                });
            });
        });
    });
}

// ── Queries ─────────────────────────────────────────────────────────────────

function getUserByPartyCode(partyCode) {
    return new Promise((resolve, reject) => {
        getDb().get(
            'SELECT * FROM app_users WHERE party_code = ?',
            [partyCode],
            (err, row) => err ? reject(err) : resolve(row)
        );
    });
}

function createUser(partyCode, passwordHash, mustChangePass = 1) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `INSERT INTO app_users (party_code, password_hash, must_change_pass)
             VALUES (?, ?, ?)`,
            [partyCode, passwordHash, mustChangePass],
            function (err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, partyCode, mustChangePass });
            }
        );
    });
}

function updatePassword(partyCode, newHash) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `UPDATE app_users
             SET password_hash = ?, must_change_pass = 0, updated_at = datetime('now')
             WHERE party_code = ?`,
            [newHash, partyCode],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
}

function createSession(partyCode, token, expiresAt) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `INSERT INTO app_sessions (party_code, token, expires_at) VALUES (?, ?, ?)`,
            [partyCode, token, expiresAt],
            function (err) {
                if (err) return reject(err);
                resolve({ id: this.lastID });
            }
        );
    });
}

function getSession(token) {
    return new Promise((resolve, reject) => {
        getDb().get(
            `SELECT * FROM app_sessions WHERE token = ? AND expires_at > datetime('now')`,
            [token],
            (err, row) => err ? reject(err) : resolve(row)
        );
    });
}

function deleteSession(token) {
    return new Promise((resolve, reject) => {
        getDb().run(
            'DELETE FROM app_sessions WHERE token = ?',
            [token],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
}

function deleteExpiredSessions() {
    return new Promise((resolve, reject) => {
        getDb().run(
            `DELETE FROM app_sessions WHERE expires_at <= datetime('now')`,
            [],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

/**
 * Returns all products with images as an array of
 * { basepack_code, itemvarient_desc, image_url }.
 * Cached in-process after first call.
 */
let _imageCache = null;
function getAllProductImages() {
    if (_imageCache) return Promise.resolve(_imageCache);
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT basepack_code, itemvarient_desc, image_url
             FROM products
             WHERE image_url IS NOT NULL AND image_url != ''`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                _imageCache = rows;
                resolve(rows);
            }
        );
    });
}

function updateProductImage(basepack_code, image_url) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `UPDATE products SET image_url = ? WHERE basepack_code = ?`,
            [image_url, basepack_code],
            function (err) {
                if (err) return reject(err);
                if (this.changes > 0) {
                    _imageCache = null;
                    resolve(true);
                } else {
                    getDb().run(
                        `INSERT INTO products (basepack_code, image_url) VALUES (?, ?)`,
                        [basepack_code, image_url],
                        function (err2) {
                            if (err2) return reject(err2);
                            _imageCache = null;
                            resolve(true);
                        }
                    );
                }
            }
        );
    });
}

function resetPassword(partyCode, newHash) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `UPDATE app_users
             SET password_hash = ?, must_change_pass = 1, updated_at = datetime('now')
             WHERE party_code = ?`,
            [newHash, partyCode],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
}

let _brandsCache = null;
function getAllBrands() {
    if (_brandsCache) return Promise.resolve(_brandsCache);
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT brand_id as brand_code, brand_desc, image_url FROM brands`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                _brandsCache = rows;
                resolve(rows);
            }
        );
    });
}

let _productBrandsCache = null;
function getProductBrands() {
    if (_productBrandsCache) return Promise.resolve(_productBrandsCache);
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT basepack_code, brand_id as brand_code FROM products`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                _productBrandsCache = rows;
                resolve(rows);
            }
        );
    });
}

// ── Custom Brands ────────────────────────────────────────────────────────────

let _customBrandsCache = null;
function getAllCustomBrands() {
    if (_customBrandsCache) return Promise.resolve(_customBrandsCache);
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT * FROM brands_custom ORDER BY brand_name`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                _customBrandsCache = rows;
                resolve(rows);
            }
        );
    });
}

function createCustomBrand(data) {
    const { brand_code, brand_name, image_url } = data;
    return new Promise((resolve, reject) => {
        getDb().run(
            `INSERT INTO brands_custom (brand_code, brand_name, image_url) VALUES (?, ?, ?)`,
            [brand_code, brand_name, image_url || null],
            function (err) {
                if (err) return reject(err);
                _customBrandsCache = null;
                _brandsCache = null;
                resolve({ id: this.lastID });
            }
        );
    });
}

function updateCustomBrand(id, data) {
    const { brand_name, image_url } = data;
    return new Promise((resolve, reject) => {
        getDb().run(
            `UPDATE brands_custom SET brand_name = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?`,
            [brand_name, image_url || null, id],
            function (err) {
                if (err) return reject(err);
                _customBrandsCache = null;
                _brandsCache = null;
                resolve(this.changes > 0);
            }
        );
    });
}

function deleteCustomBrand(id) {
    return new Promise((resolve, reject) => {
        getDb().run(`DELETE FROM brands_custom WHERE id = ?`, [id], function (err) {
            if (err) return reject(err);
            _customBrandsCache = null;
            _brandsCache = null;
            resolve(this.changes > 0);
        });
    });
}

// ── Product Meta ─────────────────────────────────────────────────────────────

let _productMetaCache = null;
function getAllProductMeta() {
    if (_productMetaCache) return Promise.resolve(_productMetaCache);
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT * FROM product_meta`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                _productMetaCache = rows;
                resolve(rows);
            }
        );
    });
}

function upsertProductMeta(product_code, data) {
    const { nickname, brand_code, image_url } = data;
    return new Promise((resolve, reject) => {
        getDb().run(
            `INSERT INTO product_meta (product_code, nickname, brand_code, image_url)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(product_code) DO UPDATE SET
                 nickname   = COALESCE(excluded.nickname,   nickname),
                 brand_code = COALESCE(excluded.brand_code, brand_code),
                 image_url  = COALESCE(excluded.image_url,  image_url),
                 updated_at = datetime('now')`,
            [product_code, nickname || null, brand_code || null, image_url || null],
            function (err) {
                if (err) return reject(err);
                _productMetaCache = null;
                _imageCache = null;
                resolve({ id: this.lastID || product_code });
            }
        );
    });
}

function updateProductMetaImage(product_code, image_url) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `INSERT INTO product_meta (product_code, image_url)
             VALUES (?, ?)
             ON CONFLICT(product_code) DO UPDATE SET
                 image_url  = excluded.image_url,
                 updated_at = datetime('now')`,
            [product_code, image_url],
            function (err) {
                if (err) return reject(err);
                _productMetaCache = null;
                _imageCache = null;
                resolve(true);
            }
        );
    });
}

// ── Schemes ─────────────────────────────────────────────────────────────────

function getAllSchemes() {
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT * FROM app_schemes ORDER BY id DESC`,
            [],
            (err, rows) => err ? reject(err) : resolve(rows)
        );
    });
}

function getActiveBannerSchemes() {
    return new Promise((resolve, reject) => {
        getDb().all(
            `SELECT * FROM app_schemes WHERE is_active = 1 AND show_as_banner = 1`,
            [],
            (err, rows) => err ? reject(err) : resolve(rows)
        );
    });
}

function createScheme(data) {
    return new Promise((resolve, reject) => {
        const { name, discount_amount, scheme_type, condition_code, condition_qty, sub_group, start_date, end_date, is_active, show_as_banner, banner_text } = data;
        getDb().run(
            `INSERT INTO app_schemes (name, discount_amount, scheme_type, condition_code, condition_qty, sub_group, start_date, end_date, is_active, show_as_banner, banner_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, discount_amount, scheme_type, condition_code, condition_qty, sub_group, start_date, end_date, is_active, show_as_banner, banner_text],
            function (err) {
                if (err) return reject(err);
                resolve({ id: this.lastID });
            }
        );
    });
}

function updateScheme(id, data) {
    return new Promise((resolve, reject) => {
        const { name, discount_amount, scheme_type, condition_code, condition_qty, sub_group, start_date, end_date, is_active, show_as_banner, banner_text } = data;
        getDb().run(
            `UPDATE app_schemes
             SET name = ?, discount_amount = ?, scheme_type = ?, condition_code = ?, condition_qty = ?, sub_group = ?, start_date = ?, end_date = ?, is_active = ?, show_as_banner = ?, banner_text = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [name, discount_amount, scheme_type, condition_code, condition_qty, sub_group, start_date, end_date, is_active, show_as_banner, banner_text, id],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
}

function deleteScheme(id) {
    return new Promise((resolve, reject) => {
        getDb().run(`DELETE FROM app_schemes WHERE id = ?`, [id], function (err) {
            if (err) return reject(err);
            resolve(this.changes > 0);
        });
    });
}

// ── WA Carts ─────────────────────────────────────────────────────────────────

/** Upsert pending WhatsApp Commerce cart items for a phone number. */
function saveWaCart(phone, items) {
    return new Promise((resolve, reject) => {
        getDb().run(
            `INSERT INTO wa_carts (phone, items_json)
             VALUES (?, ?)
             ON CONFLICT(phone) DO UPDATE SET
                 items_json = excluded.items_json,
                 saved_at   = datetime('now')`,
            [phone, JSON.stringify(items)],
            function (err) {
                if (err) return reject(err);
                resolve(true);
            }
        );
    });
}

/**
 * One-shot: get WA cart for phone and immediately delete it.
 * Returns parsed items array or null if none.
 */
function getAndDeleteWaCart(phone) {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.get('SELECT items_json FROM wa_carts WHERE phone = ?', [phone], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(null);
            let items = null;
            try { items = JSON.parse(row.items_json); } catch (e) {}
            db.run('DELETE FROM wa_carts WHERE phone = ?', [phone], (err2) => {
                if (err2) console.error('[appDb] wa_cart delete error:', err2);
                resolve(items);
            });
        });
    });
}

module.exports = {
    initDb,
    getUserByPartyCode,
    createUser,
    updatePassword,
    resetPassword,
    createSession,
    getSession,
    deleteSession,
    deleteExpiredSessions,
    getAllProductImages,
    updateProductImage,
    getAllBrands,
    getProductBrands,
    // Custom Brands
    getAllCustomBrands,
    createCustomBrand,
    updateCustomBrand,
    deleteCustomBrand,
    // Product Meta
    getAllProductMeta,
    upsertProductMeta,
    updateProductMetaImage,
    // Schemes
    getAllSchemes,
    getActiveBannerSchemes,
    createScheme,
    updateScheme,
    deleteScheme,
    // WA Carts
    saveWaCart,
    getAndDeleteWaCart,
};
