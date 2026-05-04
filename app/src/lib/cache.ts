/**
 * IndexedDB cache with TTL + stale-while-revalidate support.
 *
 * Patterns:
 *  - getCache / setCache  — simple TTL cache (returns null if expired)
 *  - getStale             — returns data even if expired, plus `isStale` flag
 */

const DB_NAME = 'fmcg-cache';
const STORE_NAME = 'api-cache';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { _db = (e.target as IDBOpenDBRequest).result; resolve(_db!); };
    req.onerror = () => reject(req.error);
  });
}

/** Returns cached data if not expired, null otherwise. */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec || Date.now() > rec.expires) return resolve(null);
        resolve(rec.data as T);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

/** Returns cached data even if stale, with `isStale` and `cachedAt` metadata. */
export async function getStale<T>(key: string): Promise<{ data: T; isStale: boolean; cachedAt: number } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec) return resolve(null);
        resolve({ data: rec.data as T, isStale: Date.now() > rec.expires, cachedAt: rec.cachedAt });
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

/** Store data with a TTL in milliseconds. */
export async function setCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, data, expires: Date.now() + ttlMs, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* silent fail */ }
}
