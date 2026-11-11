/**
 * Profile page data for the customer app (app/src/pages/Profile.tsx).
 *
 *   GET  /profile/summary                 details, credit terms, unpaid bills, prefs
 *   GET  /profile/ledger?fy=2526          ledger for one financial year
 *   PUT  /profile/prefs                   notification choices + extra contacts
 *   GET  /profile/sessions                logged-in devices
 *   POST /profile/sessions/logout-others  sign out every other device
 *   POST /profile/request                 issue / detail-change / location request to the admin
 *
 * Mounted on the /api/app router. Everything is read-only against the DBF
 * JSON exports; only app_prefs (SQLite) and db/messages.json are written.
 */

const fs = require('fs').promises;
const path = require('path');
const appDb = require('../../db/app/appDb');

const MESSAGES_PATH = path.join(__dirname, '../../db/messages.json');
const UPDATES_PATH = path.join(__dirname, '../../db/account-master-updates.json');
const BALANCE_PATH = path.join(__dirname, '../../db/balance.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_CHARS = 600 * 1024; // downscaled JPEG data URL from the app
const MAX_CONTACTS = 5;
const MAX_FY = 3;

const DEFAULT_PREFS = { orderUpdates: true, paymentReminders: true, schemeAlerts: true, contacts: [] };

const REQUEST_TITLES = {
    issue: 'Issue',
    change: 'Detail change request',
    location: 'Shop location update',
};

const str = (v) => (v == null ? '' : String(v).trim());
const round2 = (n) => Math.round(n * 100) / 100;

const readJson = async (file, fallback) => {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        return fallback;
    }
};

const formatDate = (d) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

/**
 * Financial-year data folders next to DBF_FOLDER_PATH ("D01-2627" -> also
 * "D01-2526", ...). Newest first, current year first, at most MAX_FY.
 */
async function listFinancialYears() {
    const current = path.resolve(process.env.DBF_FOLDER_PATH);
    const parent = path.dirname(current);
    const m = path.basename(current).match(/^(.*?)(\d{4})$/);
    if (!m) return [{ fy: 'current', dir: current }];
    const prefix = m[1].toLowerCase();
    const currentFy = m[2];
    let names = [];
    try { names = await fs.readdir(parent); } catch { /* only the current year */ }
    const years = names
        .filter((n) => n.toLowerCase().startsWith(prefix) && /^\d{4}$/.test(n.slice(prefix.length)))
        .map((n) => ({ fy: n.slice(prefix.length), dir: path.join(parent, n) }))
        .filter((y) => y.fy <= currentFy)
        .sort((a, b) => b.fy.localeCompare(a.fy));
    if (!years.some((y) => y.fy === currentFy)) years.unshift({ fy: currentFy, dir: current });
    return years.slice(0, MAX_FY);
}

/** Ledger rows of one party from a year folder, oldest first. */
async function readPartyLedger(dir, partyCode) {
    const cash = await readJson(path.join(dir, 'data', 'json', 'CASH.json'), []);
    return cash
        .filter((r) => r && r.C_CODE === partyCode && r.DATE)
        .map((r) => {
            const cr = parseFloat(r.CR) || 0;
            const dr = parseFloat(r.DR) || 0;
            const d = new Date(r.DATE);
            const vr = str(r.VR);
            const isSaleBill = vr.startsWith('SB-') && str(r.SERIES) && str(r.BILL);
            return {
                date: formatDate(d),
                originalDate: r.DATE,
                time: d.getTime(),
                narration: str(r.REMARK),
                book: vr,
                cr,
                dr,
                amount: cr > 0 ? cr : dr,
                type: cr > 0 ? 'CR' : 'DR',
                series: isSaleBill ? str(r.SERIES) : '',
                billNo: isSaleBill ? str(r.BILL) : '',
            };
        })
        .sort((a, b) => a.time - b.time);
}

/**
 * Unpaid bills, oldest first: every payment is set against the oldest debit
 * first (the ledger has no bill-wise receipts), whatever is left is unpaid.
 */
async function computeOutstanding(partyCode, party) {
    const dir = path.resolve(process.env.DBF_FOLDER_PATH);
    const rows = await readPartyLedger(dir, partyCode);
    let credit = rows.reduce((sum, r) => sum + r.cr, 0);

    const bills = await readJson(path.join(dir, 'data', 'json', 'bill.json'), []);
    const dueDaysOf = {};
    bills.forEach((b) => {
        if (b && b.C_CODE === partyCode) dueDaysOf[`${str(b.SERIES)}-${Number(b.BILL)}`] = Number(b.DUE_DAYS) || 0;
    });
    const partyDays = Number(party?.CR_DAYS) || 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unpaid = [];
    for (const r of rows) {
        if (r.dr <= 0) continue;
        const paid = Math.min(credit, r.dr);
        credit -= paid;
        const pending = round2(r.dr - paid);
        if (pending < 1) continue;

        const dueDays = (r.series ? dueDaysOf[`${r.series}-${Number(r.billNo)}`] : 0) || partyDays;
        const billDay = new Date(r.time);
        billDay.setHours(0, 0, 0, 0);
        const ageDays = Math.round((today - billDay) / DAY_MS);
        unpaid.push({
            date: r.date,
            series: r.series,
            billNo: r.billNo,
            label: r.series ? `${r.series}-${r.billNo}` : (r.narration || r.book || 'Opening balance'),
            amount: round2(r.dr),
            pending,
            ageDays,
            dueDays,
            // Only meaningful when credit days are set on the bill or the party
            overdueDays: dueDays > 0 ? ageDays - dueDays : null,
        });
    }
    return { bills: unpaid, total: round2(unpaid.reduce((sum, b) => sum + b.pending, 0)) };
}

async function readBalance(partyCode) {
    const parsed = await readJson(BALANCE_PATH, null);
    const row = parsed && Array.isArray(parsed.data) ? parsed.data.find((b) => b.partycode === partyCode) : null;
    if (!row || !row.result) return { amount: 0, type: '' };
    const parts = String(row.result).trim().split(/\s+/);
    const amount = parseFloat(parts[0]);
    return { amount: isNaN(amount) ? 0 : round2(amount), type: (parts[1] || '').toUpperCase() };
}

const cleanPrefs = (raw) => {
    const p = raw && typeof raw === 'object' ? raw : {};
    const flag = (key) => (typeof p[key] === 'boolean' ? p[key] : DEFAULT_PREFS[key]);
    const contacts = (Array.isArray(p.contacts) ? p.contacts : [])
        .map((c) => ({
            name: str(c?.name).slice(0, 60),
            mobile: str(c?.mobile).replace(/\D/g, '').slice(-10),
            role: str(c?.role).slice(0, 30),
        }))
        .filter((c) => c.name && c.mobile.length === 10)
        .slice(0, MAX_CONTACTS);
    return {
        orderUpdates: flag('orderUpdates'),
        paymentReminders: flag('paymentReminders'),
        schemeAlerts: flag('schemeAlerts'),
        contacts,
    };
};

/** "Chrome on Android" style label from a user-agent string. */
const describeDevice = (ua) => {
    const s = str(ua);
    if (!s) return 'Unknown device';
    const os = /Android/i.test(s) ? 'Android'
        : /iPhone|iPad|iPod/i.test(s) ? 'iPhone / iPad'
        : /Windows/i.test(s) ? 'Windows'
        : /Macintosh|Mac OS/i.test(s) ? 'Mac'
        : /Linux/i.test(s) ? 'Linux' : 'Device';
    const browser = /; wv\)|Capacitor/i.test(s) ? 'App'
        : /Edg\//i.test(s) ? 'Edge'
        : /SamsungBrowser/i.test(s) ? 'Samsung Internet'
        : /Chrome\//i.test(s) ? 'Chrome'
        : /Firefox\//i.test(s) ? 'Firefox'
        : /Safari\//i.test(s) ? 'Safari' : 'Browser';
    return `${browser} on ${os}`;
};

const bearerToken = (req) => {
    const auth = req.headers['authorization'] || '';
    return auth.startsWith('Bearer ') ? auth.slice(7) : '';
};

module.exports = (router, { requireAppAuth }) => {
    router.get('/profile/summary', requireAppAuth, async (req, res) => {
        try {
            const code = req.appPartyCode;
            const party = req.appParty || {};
            appDb.touchSession(bearerToken(req), req.headers['user-agent']).catch(() => {});

            const [outstanding, balance, prefs, updates] = await Promise.all([
                computeOutstanding(code, party),
                readBalance(code),
                appDb.getPrefs(code),
                readJson(UPDATES_PATH, {}),
            ]);
            const saved = updates[code] || {};
            const lat = Number(saved.latitude);
            const lng = Number(saved.longitude);

            res.json({
                details: {
                    gst: str(party.C_GST) || str(party.GSTNO),
                    fssai: str(party.FSAAINO),
                    pan: str(party.C_PAN_NO),
                    email: str(party.EMAIL),
                    address: [party.C_ADD1, party.C_ADD2, party.C_PLACE].map(str).filter(Boolean).join(', '),
                    pincode: str(party.C_PIN),
                },
                credit: { limit: Number(party.CR_LIMIT) || 0, days: Number(party.CR_DAYS) || 0 },
                balance,
                outstanding,
                location: lat && lng ? { latitude: lat, longitude: lng, capturedAt: saved.gpsCapturedAt || null } : null,
                prefs: cleanPrefs(prefs),
            });
        } catch (err) {
            console.error('[app/profile/summary]', err);
            res.status(500).json({ error: 'Failed to load profile' });
        }
    });

    router.get('/profile/ledger', requireAppAuth, async (req, res) => {
        try {
            const years = await listFinancialYears();
            const wanted = str(req.query.fy);
            const year = years.find((y) => y.fy === wanted) || years[0];
            const isCurrent = year === years[0];
            const rows = await readPartyLedger(year.dir, req.appPartyCode);
            const data = rows.reverse().map(({ time, ...row }) =>
                // Invoices can only be opened for the current year's data
                (isCurrent ? row : { ...row, series: '', billNo: '' }));
            res.json({ success: true, fy: year.fy, years: years.map((y) => y.fy), data });
        } catch (err) {
            console.error('[app/profile/ledger]', err);
            res.status(500).json({ error: 'Failed to load ledger' });
        }
    });

    router.put('/profile/prefs', requireAppAuth, async (req, res) => {
        try {
            const current = cleanPrefs(await appDb.getPrefs(req.appPartyCode));
            const next = cleanPrefs({ ...current, ...(req.body || {}) });
            await appDb.setPrefs(req.appPartyCode, next);
            res.json({ success: true, prefs: next });
        } catch (err) {
            console.error('[app/profile/prefs]', err);
            res.status(500).json({ error: 'Failed to save settings' });
        }
    });

    router.get('/profile/sessions', requireAppAuth, async (req, res) => {
        try {
            const token = bearerToken(req);
            const rows = await appDb.getSessionsByParty(req.appPartyCode);
            res.json(rows.map((r) => ({
                id: r.id,
                device: describeDevice(r.token === token ? req.headers['user-agent'] : r.user_agent),
                createdAt: r.created_at,
                lastSeen: r.last_seen,
                current: r.token === token,
            })));
        } catch (err) {
            console.error('[app/profile/sessions]', err);
            res.status(500).json({ error: 'Failed to load devices' });
        }
    });

    router.post('/profile/sessions/logout-others', requireAppAuth, async (req, res) => {
        try {
            const removed = await appDb.deleteOtherSessions(req.appPartyCode, bearerToken(req));
            res.json({ success: true, removed });
        } catch (err) {
            console.error('[app/profile/sessions/logout-others]', err);
            res.status(500).json({ error: 'Failed to log out other devices' });
        }
    });

    /** Lands in the admin's message list (db/messages.json), like a pickup request. */
    router.post('/profile/request', requireAppAuth, async (req, res) => {
        try {
            const { type, subject, details, invoice, photo } = req.body || {};
            const title = REQUEST_TITLES[type];
            const text = str(details).slice(0, 1000);
            if (!title) return res.status(400).json({ error: 'Unknown request type' });
            if (!text) return res.status(400).json({ error: 'Details are required' });

            let photoAttachment = null;
            if (photo) {
                if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > MAX_PHOTO_CHARS) {
                    return res.status(400).json({ error: 'Photo is not valid or too large' });
                }
                photoAttachment = photo;
            }

            const name = str(req.appParty?.C_NAME) || req.appPartyCode;
            const lines = [
                `${title} from ${name} (${req.appPartyCode})`,
                str(subject) && `Subject: ${str(subject).slice(0, 100)}`,
                str(invoice) && `Invoice: ${str(invoice).slice(0, 30)}`,
                text,
            ].filter(Boolean);

            const message = {
                id: Date.now().toString(),
                recipientId: 1,
                recipientName: 'Admin',
                message: lines.join('\n'),
                photoAttachment,
                sentAt: new Date().toISOString(),
                sentBy: req.appPartyCode,
                isRead: false,
            };
            const messages = await readJson(MESSAGES_PATH, []);
            messages.push(message);
            await fs.writeFile(MESSAGES_PATH, JSON.stringify(messages, null, 2));
            res.json({ success: true, id: message.id });
        } catch (err) {
            console.error('[app/profile/request]', err);
            res.status(500).json({ error: 'Failed to send request' });
        }
    });
};

module.exports.cleanPrefs = cleanPrefs;
