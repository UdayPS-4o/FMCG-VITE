/**
 * Festival themes for the customer app (app/).
 *
 * An admin schedules a theme (Diwali, Christmas, New Year, ...) with a start and
 * end time from the Notification Suite. While a theme is live, the customer app's
 * home page background takes the festive colours and effects; once the end time passes the app goes back to
 * its normal look by itself (the app also checks the end time locally, so it
 * switches back on time even without refetching).
 *
 * Each theme has up to 3 "variants" (colour sets). Retailers switch between them
 * with the Theme button on the home page. Each variant has its own effect:
 *   rockets | chakri | lights | none
 * Effects for future festivals (snowfall, fireworks, ...) are added to EFFECTS
 * here and to the app's FestiveEffects component when they are built.
 *
 * Mounted on the /api/app router (before the global CMS auth middleware).
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const FESTIVALS = ['DIWALI', 'CHRISTMAS', 'NEW_YEAR', 'HOLI', 'EID', 'CUSTOM'];
const EFFECTS = ['rockets', 'chakri', 'lights', 'none'];
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_VARIANTS = 3;

const db = new sqlite3.Database(path.join(__dirname, '../../db/festival_themes.db'), (err) => {
    if (err) return console.error('[festival-themes] Failed to open db:', err.message);
    db.run(`CREATE TABLE IF NOT EXISTS festival_themes (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        name             TEXT    NOT NULL,
        festival         TEXT    NOT NULL DEFAULT 'CUSTOM',
        start_at         TEXT    NOT NULL,
        end_at           TEXT    NOT NULL,
        variants         TEXT    NOT NULL DEFAULT '[]',
        allow_switch     INTEGER NOT NULL DEFAULT 1,
        effects_enabled  INTEGER NOT NULL DEFAULT 1,
        is_active        INTEGER NOT NULL DEFAULT 1,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);
});

const all = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const get = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

const parseVariants = (raw) => {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

const toClient = (t) => ({
    id: t.id,
    name: t.name,
    festival: t.festival,
    startAt: t.start_at,
    endAt: t.end_at,
    variants: parseVariants(t.variants),
    allowSwitch: !!t.allow_switch,
    effectsEnabled: !!t.effects_enabled,
    isActive: !!t.is_active,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
});

const isLive = (t, now = new Date()) =>
    !!t.is_active && new Date(t.start_at) <= now && new Date(t.end_at) > now;

// Validates the admin payload; returns { error } or { value } ready for the db.
const validate = (b) => {
    const name = String(b.name || '').trim();
    if (!name) return { error: 'Enter a theme name' };
    const festival = FESTIVALS.includes(b.festival) ? b.festival : 'CUSTOM';

    const start = new Date(b.startAt);
    const end = new Date(b.endAt);
    if (isNaN(start) || isNaN(end)) return { error: 'Pick both a start and an end time' };
    if (end <= start) return { error: 'End time must be after the start time' };

    const variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, MAX_VARIANTS).map((v, i) => ({
        label: String(v.label || `Set ${i + 1}`).slice(0, 30),
        bgFrom: HEX.test(v.bgFrom) ? v.bgFrom : '#1e293b',
        bgTo: HEX.test(v.bgTo) ? v.bgTo : '#334155',
        accent: HEX.test(v.accent) ? v.accent : '#fbbf24',
        effect: EFFECTS.includes(v.effect) ? v.effect : 'none',
    }));
    if (!variants.length) return { error: 'Add at least one colour set' };

    return {
        value: {
            name, festival,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            variants: JSON.stringify(variants),
            allow_switch: b.allowSwitch === false ? 0 : 1,
            effects_enabled: b.effectsEnabled === false ? 0 : 1,
            is_active: b.isActive === false ? 0 : 1,
        },
    };
};

// Two active themes may not overlap, so the app always knows which one to show.
const findOverlap = async (v, excludeId = 0) => {
    if (!v.is_active) return null;
    return get(
        `SELECT name FROM festival_themes
         WHERE is_active = 1 AND id != ? AND start_at < ? AND end_at > ?
         LIMIT 1`,
        [excludeId, v.end_at, v.start_at]
    );
};

module.exports = (router, { requireAdminJwtAuth }) => {
    /** GET /api/app/festival-theme/active - the theme live right now, or null */
    router.get('/festival-theme/active', async (req, res) => {
        try {
            const now = new Date();
            const rows = await all(
                `SELECT * FROM festival_themes WHERE is_active = 1 AND start_at <= ? AND end_at > ? ORDER BY start_at DESC LIMIT 1`,
                [now.toISOString(), now.toISOString()]
            );
            const live = rows.find(t => isLive(t, now));
            res.set('Cache-Control', 'no-store');
            res.json({ theme: live ? toClient(live) : null, serverTime: now.toISOString() });
        } catch (err) {
            console.error('[festival-theme/active]', err);
            res.status(500).json({ error: 'Failed to fetch festival theme' });
        }
    });

    /** GET /api/app/admin/festival-themes */
    router.get('/admin/festival-themes', requireAdminJwtAuth, async (req, res) => {
        try {
            const rows = await all(`SELECT * FROM festival_themes ORDER BY start_at DESC`);
            res.json(rows.map(toClient));
        } catch (err) {
            console.error('[admin/festival-themes]', err);
            res.status(500).json({ error: 'Failed to fetch festival themes' });
        }
    });

    /** POST /api/app/admin/festival-themes - create */
    router.post('/admin/festival-themes', requireAdminJwtAuth, async (req, res) => {
        try {
            const { error, value } = validate(req.body || {});
            if (error) return res.status(400).json({ error });
            const clash = await findOverlap(value);
            if (clash) return res.status(400).json({ error: `These dates overlap with "${clash.name}". Change one of them.` });

            const result = await run(
                `INSERT INTO festival_themes
                    (name, festival, start_at, end_at, variants, allow_switch, effects_enabled, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [value.name, value.festival, value.start_at, value.end_at, value.variants, value.allow_switch, value.effects_enabled, value.is_active]
            );
            res.json({ success: true, theme: toClient(await get(`SELECT * FROM festival_themes WHERE id = ?`, [result.lastID])) });
        } catch (err) {
            console.error('[admin/festival-themes POST]', err);
            res.status(500).json({ error: 'Failed to create festival theme' });
        }
    });

    /** PUT /api/app/admin/festival-themes/:id - update */
    router.put('/admin/festival-themes/:id', requireAdminJwtAuth, async (req, res) => {
        try {
            const existing = await get(`SELECT id FROM festival_themes WHERE id = ?`, [req.params.id]);
            if (!existing) return res.status(404).json({ error: 'Theme not found' });
            const { error, value } = validate(req.body || {});
            if (error) return res.status(400).json({ error });
            const clash = await findOverlap(value, existing.id);
            if (clash) return res.status(400).json({ error: `These dates overlap with "${clash.name}". Change one of them.` });

            await run(
                `UPDATE festival_themes SET
                    name = ?, festival = ?, start_at = ?, end_at = ?,
                    variants = ?, allow_switch = ?, effects_enabled = ?, is_active = ?, updated_at = datetime('now')
                 WHERE id = ?`,
                [value.name, value.festival, value.start_at, value.end_at,
                    value.variants, value.allow_switch, value.effects_enabled, value.is_active, existing.id]
            );
            res.json({ success: true, theme: toClient(await get(`SELECT * FROM festival_themes WHERE id = ?`, [existing.id])) });
        } catch (err) {
            console.error('[admin/festival-themes PUT]', err);
            res.status(500).json({ error: 'Failed to update festival theme' });
        }
    });

    /** DELETE /api/app/admin/festival-themes/:id */
    router.delete('/admin/festival-themes/:id', requireAdminJwtAuth, async (req, res) => {
        try {
            const result = await run(`DELETE FROM festival_themes WHERE id = ?`, [req.params.id]);
            if (!result.changes) return res.status(404).json({ error: 'Theme not found' });
            res.json({ success: true });
        } catch (err) {
            console.error('[admin/festival-themes DELETE]', err);
            res.status(500).json({ error: 'Failed to delete festival theme' });
        }
    });
};
