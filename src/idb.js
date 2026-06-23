// IndexedDB key-value cache for FabHub
// Replaces localStorage for data storage — no 5 MB limit, async, non-blocking

const DB_NAME = 'fabhub-cache';
const DB_VER  = 1;
const STORE   = 'kv';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'k' });
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

export async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result?.v ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

export async function idbGetMany(keys) {
  try {
    const db    = await openDB();
    const store = db.transaction(STORE).objectStore(STORE);
    const out   = {};
    await Promise.all(keys.map(k => new Promise(resolve => {
      const req = store.get(k);
      req.onsuccess = () => { out[k] = req.result?.v ?? null; resolve(); };
      req.onerror   = () => { out[k] = null; resolve(); };
    })));
    return out;
  } catch { return Object.fromEntries(keys.map(k => [k, null])); }
}

export async function idbSetMany(entries) {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [k, v] of entries) store.put({ k, v });
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = reject;
    });
  } catch {}
}

export async function idbSet(key, value) {
  return idbSetMany([[key, value]]);
}
