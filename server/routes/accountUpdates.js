// Update Account Master: edit details of existing parties (CMPL) inside the web app.
// Updates are stored only in db/account-master-updates.json (keyed by party code);
// CMPL.dbf is never written.
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { storeShopPhoto } = require('../utils/shopPhotos');

const router = express.Router();
const UPDATES_PATH = path.join(__dirname, '..', 'db', 'account-master-updates.json');

const EDITABLE_FIELDS = [
  'achead', 'addressline1', 'addressline2', 'place', 'pincode', 'mobile', 'pan', 'aadhar',
  'gst', 'dlno', 'fssaino', 'email', 'statecode',
  'latitude', 'longitude', 'gpsAccuracy', 'gpsCapturedAt', 'shopPhoto',
];

const str = (v) => (v == null ? '' : String(v).trim());

async function readCmpl() {
  const file = path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'CMPL.json');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readUpdates() {
  try {
    return JSON.parse(await fs.readFile(UPDATES_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

const isAdmin = (user) => Array.isArray(user?.routeAccess) && user.routeAccess.includes('Admin');

// Two-letter sub group prefixes the user may see; null means all (admin)
function allowedPrefixes(user) {
  if (isAdmin(user)) return null;
  const sgs = Array.isArray(user?.subgroups) && user.subgroups.length ? user.subgroups : user?.subgroup ? [user.subgroup] : [];
  return new Set(sgs.map((sg) => String(sg?.subgroupCode || '').substring(0, 2).toUpperCase()).filter(Boolean));
}

function requireAccess(req, res, next) {
  const ra = req.user?.routeAccess || [];
  if (ra.includes('Admin') || ra.includes('Account Master')) return next();
  return res.status(403).json({ message: "You don't have access to Account Master." });
}

const isDebtor = (p) => p.M_GROUP === 'DT' && p.C_CODE && !p.C_CODE.endsWith('000');

function canSee(prefixes, code) {
  return prefixes === null || prefixes.has(String(code).substring(0, 2).toUpperCase());
}

// CMPL record → the form's field names
function fromCmpl(p) {
  return {
    achead: str(p.C_NAME),
    addressline1: str(p.C_ADD1),
    addressline2: str(p.C_ADD2),
    place: str(p.C_PLACE),
    pincode: str(p.C_PIN),
    mobile: str(p.C_MOBILE),
    pan: str(p.C_PAN_NO),
    aadhar: str(p.C_ADHAR),
    gst: str(p.GSTNO || p.C_GST),
    dlno: str(p.C_DL_NO),
    fssaino: str(p.FSAAINO),
    email: str(p.EMAIL),
    statecode: str(p.C_STATE),
  };
}

// Sub groups and parties the user is allowed to update
router.get('/api/account-updates/parties', requireAccess, async (req, res) => {
  try {
    const [cmpl, updates] = await Promise.all([readCmpl(), readUpdates()]);
    const prefixes = allowedPrefixes(req.user);

    const subgroups = cmpl
      .filter((p) => p.M_GROUP === 'DT' && p.C_CODE?.endsWith('000') && canSee(prefixes, p.C_CODE))
      .sort((a, b) => a.C_CODE.localeCompare(b.C_CODE))
      .map((p) => ({ value: p.C_CODE.substring(0, 2).toUpperCase(), label: `${str(p.C_NAME)} (${p.C_CODE.substring(0, 2)})` }));

    const parties = cmpl
      .filter((p) => isDebtor(p) && canSee(prefixes, p.C_CODE))
      .sort((a, b) => str(a.C_NAME).localeCompare(str(b.C_NAME)))
      .map((p) => ({
        code: p.C_CODE,
        name: str(updates[p.C_CODE]?.achead) || str(p.C_NAME),
        place: str(updates[p.C_CODE]?.place) || str(p.C_PLACE),
        prefix: p.C_CODE.substring(0, 2).toUpperCase(),
        updatedAt: updates[p.C_CODE]?.updatedAt || null,
      }));

    res.json({ subgroups, parties });
  } catch (err) {
    console.error('account-updates/parties failed:', err);
    res.status(500).json({ message: 'Could not load parties.' });
  }
});

// Current details of one party: saved web-app update if any, else CMPL values
router.get('/api/account-updates/party/:code', requireAccess, async (req, res) => {
  try {
    const code = String(req.params.code);
    if (!canSee(allowedPrefixes(req.user), code)) {
      return res.status(403).json({ message: 'This party is outside your sub groups.' });
    }
    const [cmpl, updates] = await Promise.all([readCmpl(), readUpdates()]);
    const party = cmpl.find((p) => p.C_CODE === code && isDebtor(p));
    if (!party) return res.status(404).json({ message: 'Party not found.' });
    const saved = updates[code] || null;
    res.json({
      code,
      original: fromCmpl(party),
      values: { ...fromCmpl(party), ...(saved || {}) },
      updatedAt: saved?.updatedAt || null,
      updatedByName: saved?.updatedByName || null,
    });
  } catch (err) {
    console.error('account-updates/party failed:', err);
    res.status(500).json({ message: 'Could not load party details.' });
  }
});

router.post('/api/account-updates/party/:code', requireAccess, async (req, res) => {
  try {
    const code = String(req.params.code);
    if (!canSee(allowedPrefixes(req.user), code)) {
      return res.status(403).json({ message: 'This party is outside your sub groups.' });
    }
    const cmpl = await readCmpl();
    if (!cmpl.some((p) => p.C_CODE === code && isDebtor(p))) {
      return res.status(404).json({ message: 'Party not found.' });
    }

    const record = {};
    for (const f of EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) record[f] = req.body[f];
    }
    await storeShopPhoto(record, code);

    const updates = await readUpdates();
    updates[code] = {
      ...(updates[code] || {}),
      ...record,
      code,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.id ?? null,
      updatedByName: req.user?.name || req.user?.username || null,
    };
    await fs.mkdir(path.dirname(UPDATES_PATH), { recursive: true });
    await fs.writeFile(UPDATES_PATH, JSON.stringify(updates, null, 2), 'utf8');
    res.json({ message: 'Account updated.', updatedAt: updates[code].updatedAt });
  } catch (err) {
    console.error('account-updates save failed:', err);
    res.status(err.message === 'Shop photo is too large' ? 400 : 500).json({ message: err.message || 'Could not save.' });
  }
});

module.exports = router;
