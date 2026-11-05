/**
 * In-app promotions for the customer app (app/).
 *
 * An admin uploads an image / GIF from the Notification Suite. The customer app
 * shows it as a popup, according to `frequency`:
 *   ONCE        - once per user; never again after it is closed with X
 *   HOURLY      - at most once every hour while the app is in use
 *   EVERY_PAGE  - every time the user moves to another page
 *
 * When published with sendPush, the promotion also goes out as a normal push
 * notification (FCM / web push), so users with the app closed see it too.
 *
 * Mounted on the /api/app router (before the global CMS auth middleware).
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const FREQUENCIES = ['ONCE', 'HOURLY', 'EVERY_PAGE'];
const TARGET_MODES = ['ALL', 'SUBGROUP', 'USER'];
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/promotions');
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = {
    'image/gif': 'gif',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
};

const db = new sqlite3.Database(path.join(__dirname, '../../db/promotions.db'), (err) => {
    if (err) return console.error('[promotions] Failed to open db:', err.message);
    db.run(`CREATE TABLE IF NOT EXISTS app_promotions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL DEFAULT '',
        message      TEXT    NOT NULL DEFAULT '',
        media_url    TEXT    NOT NULL,
        action_url   TEXT    NOT NULL DEFAULT '',
        cta_text     TEXT    NOT NULL DEFAULT '',
        frequency    TEXT    NOT NULL DEFAULT 'ONCE',
        target_mode  TEXT    NOT NULL DEFAULT 'ALL',
        target_value TEXT    NOT NULL DEFAULT '',
        start_date   TEXT,
        end_date     TEXT,
        is_active    INTEGER NOT NULL DEFAULT 1,
        push_sent    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);
});

const all = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const get = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

const loadUsers = () => {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '../../db/users.json'), 'utf8'));
    } catch (e) {
        return [];
    }
};

const isLive = (p, now = new Date()) => {
    if (!p.is_active) return false;
    if (p.start_date && new Date(p.start_date) > now) return false;
    if (p.end_date && new Date(p.end_date) < now) return false;
    return true;
};

const matchesParty = (p, partyCode, users) => {
    if (p.target_mode === 'ALL') return true;
    const code = String(partyCode || '').toUpperCase();
    if (p.target_mode === 'USER') {
        return p.target_value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).includes(code);
    }
    if (p.target_mode === 'SUBGROUP') {
        const u = users.find(x => String(x.username || '').toUpperCase() === code);
        return !!(u && u.subgroup && String(u.subgroup.title || '').toLowerCase() === p.target_value.toLowerCase());
    }
    return false;
};

// Party codes the promotion is aimed at (null = everyone)
const targetPartyCodes = (p) => {
    if (p.target_mode === 'ALL') return null;
    if (p.target_mode === 'USER') return p.target_value.split(',').map(s => s.trim()).filter(Boolean);
    const users = loadUsers();
    return users
        .filter(u => u.subgroup && String(u.subgroup.title || '').toLowerCase() === p.target_value.toLowerCase())
        .map(u => u.username);
};

const absoluteUrl = (req, url) => {
    if (!url || /^https?:\/\//i.test(url)) return url;
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    return `${proto}://${req.get('host')}${url}`;
};

const toClient = (p) => ({
    id: p.id,
    title: p.title,
    message: p.message,
    mediaUrl: p.media_url,
    actionUrl: p.action_url,
    ctaText: p.cta_text,
    frequency: p.frequency,
    targetMode: p.target_mode,
    targetValue: p.target_value,
    startDate: p.start_date,
    endDate: p.end_date,
    isActive: !!p.is_active,
    pushSent: !!p.push_sent,
    createdAt: p.created_at,
});

const sendPromotionPush = async (req, p) => {
    const { sendPromotionToParties } = require('../push');
    return sendPromotionToParties(targetPartyCodes(p), {
        title: p.title || 'New offer for you',
        message: p.message || 'Tap to see the latest offer',
        image: absoluteUrl(req, p.media_url),
        // Tapping the notification opens the app with ?promo=<id>, which shows the popup
        data: { url: `/?promo=${p.id}`, promoId: String(p.id) },
    });
};

module.exports = (router, { requireAppAuth, requireAdminJwtAuth }) => {
    /** GET /api/app/promotions/active - live promotions for the logged-in shop */
    router.get('/promotions/active', requireAppAuth, async (req, res) => {
        try {
            const rows = await all(`SELECT * FROM app_promotions WHERE is_active = 1 ORDER BY id DESC`);
            const users = loadUsers();
            // Also send promotions starting within the next day, so the app can
            // show them the minute they start without waiting for a refetch
            const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const upcomingOrLive = p => isLive(p) || (p.is_active && p.start_date && new Date(p.start_date) <= soon
                && !(p.end_date && new Date(p.end_date) < new Date()));
            res.json(rows.filter(p => upcomingOrLive(p) && matchesParty(p, req.appPartyCode, users)).map(toClient));
        } catch (err) {
            console.error('[promotions/active]', err);
            res.status(500).json({ error: 'Failed to fetch promotions' });
        }
    });

    /** GET /api/app/admin/promotions */
    router.get('/admin/promotions', requireAdminJwtAuth, async (req, res) => {
        try {
            const rows = await all(`SELECT * FROM app_promotions ORDER BY id DESC`);
            res.json(rows.map(toClient));
        } catch (err) {
            console.error('[admin/promotions]', err);
            res.status(500).json({ error: 'Failed to fetch promotions' });
        }
    });

    /** POST /api/app/admin/promotions/upload  { fileBase64, filename } -> { url } */
    router.post('/admin/promotions/upload', requireAdminJwtAuth, async (req, res) => {
        try {
            const { fileBase64 } = req.body || {};
            const m = typeof fileBase64 === 'string' && fileBase64.match(/^data:([\w/+.-]+);base64,(.+)$/);
            if (!m) return res.status(400).json({ error: 'Invalid file data' });
            const ext = ALLOWED_TYPES[m[1].toLowerCase()];
            if (!ext) return res.status(400).json({ error: 'Only GIF, PNG, JPG or WEBP images are allowed' });
            const buf = Buffer.from(m[2], 'base64');
            if (buf.length > MAX_UPLOAD_BYTES) return res.status(400).json({ error: 'File is larger than 8 MB' });

            await fsPromises.mkdir(UPLOAD_DIR, { recursive: true });
            const name = `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            await fsPromises.writeFile(path.join(UPLOAD_DIR, name), buf);
            res.json({ success: true, url: `/uploads/promotions/${name}` });
        } catch (err) {
            console.error('[admin/promotions/upload]', err);
            res.status(500).json({ error: 'Upload failed' });
        }
    });

    /** POST /api/app/admin/promotions - create (and optionally push) */
    router.post('/admin/promotions', requireAdminJwtAuth, async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.mediaUrl) return res.status(400).json({ error: 'Image / GIF is required' });
            const frequency = FREQUENCIES.includes(b.frequency) ? b.frequency : 'ONCE';
            const targetMode = TARGET_MODES.includes(b.targetMode) ? b.targetMode : 'ALL';
            const targetValue = targetMode === 'ALL' ? '' : String(b.targetValue || '').trim();
            if (targetMode !== 'ALL' && !targetValue) {
                return res.status(400).json({ error: `Please choose a target ${targetMode.toLowerCase()}` });
            }

            const result = await run(
                `INSERT INTO app_promotions
                    (title, message, media_url, action_url, cta_text, frequency, target_mode, target_value, start_date, end_date, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    String(b.title || ''), String(b.message || ''), String(b.mediaUrl),
                    String(b.actionUrl || ''), String(b.ctaText || ''), frequency, targetMode, targetValue,
                    b.startDate || null, b.endDate || null,
                ]
            );
            const promo = await get(`SELECT * FROM app_promotions WHERE id = ?`, [result.lastID]);

            let pushedDevices = 0;
            if (b.sendPush) {
                pushedDevices = await sendPromotionPush(req, promo);
                await run(`UPDATE app_promotions SET push_sent = 1 WHERE id = ?`, [promo.id]);
                promo.push_sent = 1;
            }
            res.json({ success: true, promotion: toClient(promo), pushedDevices });
        } catch (err) {
            console.error('[admin/promotions POST]', err);
            res.status(500).json({ error: 'Failed to create promotion' });
        }
    });

    /** PATCH /api/app/admin/promotions/:id  { isActive } */
    router.patch('/admin/promotions/:id', requireAdminJwtAuth, async (req, res) => {
        try {
            await run(`UPDATE app_promotions SET is_active = ? WHERE id = ?`, [req.body && req.body.isActive ? 1 : 0, req.params.id]);
            res.json({ success: true });
        } catch (err) {
            console.error('[admin/promotions PATCH]', err);
            res.status(500).json({ error: 'Failed to update promotion' });
        }
    });

    /** POST /api/app/admin/promotions/:id/push - (re)send as a push notification */
    router.post('/admin/promotions/:id/push', requireAdminJwtAuth, async (req, res) => {
        try {
            const promo = await get(`SELECT * FROM app_promotions WHERE id = ?`, [req.params.id]);
            if (!promo) return res.status(404).json({ error: 'Promotion not found' });
            const pushedDevices = await sendPromotionPush(req, promo);
            await run(`UPDATE app_promotions SET push_sent = 1 WHERE id = ?`, [promo.id]);
            res.json({ success: true, pushedDevices });
        } catch (err) {
            console.error('[admin/promotions push]', err);
            res.status(500).json({ error: 'Failed to send push' });
        }
    });

    /** DELETE /api/app/admin/promotions/:id */
    router.delete('/admin/promotions/:id', requireAdminJwtAuth, async (req, res) => {
        try {
            const promo = await get(`SELECT * FROM app_promotions WHERE id = ?`, [req.params.id]);
            if (!promo) return res.status(404).json({ error: 'Promotion not found' });
            await run(`DELETE FROM app_promotions WHERE id = ?`, [promo.id]);
            if (promo.media_url && promo.media_url.startsWith('/uploads/promotions/')) {
                fsPromises.unlink(path.join(UPLOAD_DIR, path.basename(promo.media_url))).catch(() => {});
            }
            res.json({ success: true });
        } catch (err) {
            console.error('[admin/promotions DELETE]', err);
            res.status(500).json({ error: 'Failed to delete promotion' });
        }
    });
};
