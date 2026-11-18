// Live location storage.
//
// current.json  – last known position per user (kept in memory, written atomically)
// history/YYYY-MM-DD.jsonl – one line per point, per IST day (append-only)
//
// The old implementation re-read and re-wrote whole JSON files on every update.
// Two phones posting at the same moment made one request read a half-written
// file, fall back to [] and overwrite everything — wiping other users' live
// positions and the whole history. Everything here goes through a single
// in-process queue, and a read failure never results in an overwrite.

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const LOCATIONS_DIR = path.join(__dirname, '..', 'db', 'locations');
const CURRENT_FILE = path.join(LOCATIONS_DIR, 'current.json');
const HISTORY_DIR = path.join(LOCATIONS_DIR, 'history');
const LEGACY_HISTORY_FILE = path.join(LOCATIONS_DIR, 'history.json');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDate = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().split('T')[0];

let current = null; // Map<string userId, record>
let queue = Promise.resolve();

// Run fn after every previously queued fn; errors don't break the chain.
const enqueue = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

const loadCurrent = () => {
  if (current) return current;
  current = new Map();
  try {
    const list = JSON.parse(fsSync.readFileSync(CURRENT_FILE, 'utf8'));
    for (const rec of list) current.set(String(rec.userId), rec);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('locationStore: could not read current.json, starting empty in memory:', e.message);
  }
  return current;
};

const writeAtomic = async (file, data) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
};

const isBackgroundSource = (source) => source === 'background' || source === 'service-worker';

/**
 * Record a position for a user.
 * source: 'foreground' | 'background' | 'service-worker' | 'checkin'
 */
const recordLocation = (userId, userName, location, source = 'foreground') =>
  enqueue(async () => {
    const map = loadCurrent();
    const now = new Date();
    const nowIso = now.toISOString();
    const isBackgroundTracking = isBackgroundSource(source);

    map.set(String(userId), {
      userId,
      userName,
      currentLocation: location,
      lastUpdated: nowIso,
      source,
      isBackgroundTracking,
    });

    await fs.mkdir(HISTORY_DIR, { recursive: true });
    await writeAtomic(CURRENT_FILE, JSON.stringify([...map.values()], null, 2));

    const line = JSON.stringify({
      userId,
      userName,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? null,
      deviceTime: location.timestamp ?? null,
      timestamp: nowIso,
      source,
    });
    await fs.appendFile(path.join(HISTORY_DIR, `${istDate(now)}.jsonl`), line + '\n');
  });

const getCurrentLocations = () => [...loadCurrent().values()];

/** All points for one user on one IST date (YYYY-MM-DD), oldest first. */
const getRoute = async (userId, date) => {
  const uid = String(userId);
  const points = [];

  const push = (p) => {
    if (String(p.userId) !== uid) return;
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
    points.push(p);
  };

  try {
    const text = await fs.readFile(path.join(HISTORY_DIR, `${date}.jsonl`), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { push(JSON.parse(line)); } catch { /* skip a torn line */ }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  // Points written by the old code before this change (same day only)
  try {
    const legacy = JSON.parse(await fs.readFile(LEGACY_HISTORY_FILE, 'utf8'));
    for (const h of legacy) {
      if (!h.location || istDate(new Date(h.timestamp)) !== date) continue;
      push({
        userId: h.userId,
        userName: h.userName,
        latitude: h.location.latitude,
        longitude: h.location.longitude,
        accuracy: h.location.accuracy ?? null,
        timestamp: h.timestamp,
        source: h.source,
      });
    }
  } catch { /* legacy file missing or unreadable – ignore */ }

  points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return points;
};

module.exports = { recordLocation, getCurrentLocations, getRoute, istDate };
