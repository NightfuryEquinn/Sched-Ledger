/**
 * IndexedDB ciphertext read cache for GET /api responses.
 * Stores JSON as returned by the server (ciphertext payloads intact).
 * Read-only offline fallback — no offline write queue.
 */

const DB_NAME = "sched-ledger-cache";
const DB_VERSION = 1;
const STORE = "api-gets";

type CacheEntry = {
  key: string;
  address: string;
  path: string;
  body: string;
  updatedAt: number;
};

let sharedDb: Promise<IDBDatabase> | null = null;

/** Open (or reuse) the cache database connection. */
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!sharedDb) {
    sharedDb = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("address", "address", { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          sharedDb = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        sharedDb = null;
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
    });
  }

  return sharedDb;
}

/** Build a cache key scoped to the signed-in address and API path. */
function cacheKey(address: string, path: string): string {
  return `${address.toLowerCase()}|${path}`;
}

/** Persist a successful GET response body. */
export async function putCipherCache(address: string, path: string, body: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const db = await openDb();
    const entry: CacheEntry = {
      key: cacheKey(address, path),
      address: address.toLowerCase(),
      path,
      body: JSON.stringify(body),
      updatedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("cache put failed"));
    });
  } catch {
    /* Cache is best-effort — never break the live request path. */
  }
}

/** Read a cached GET body, or null if missing. */
export async function getCipherCache<T>(address: string, path: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;

  try {
    const db = await openDb();
    const entry = await new Promise<CacheEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cacheKey(address, path));
      req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
      req.onerror = () => reject(req.error ?? new Error("cache get failed"));
    });
    if (!entry?.body) return null;

    return JSON.parse(entry.body) as T;
  } catch {
    return null;
  }
}

/** Drop all cached GETs for one address (e.g. on sign-out). */
export async function clearCipherCacheForAddress(address: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const db = await openDb();
    const addr = address.toLowerCase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const index = store.index("address");
      const req = index.openCursor(IDBKeyRange.only(addr));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("cache clear failed"));
    });
  } catch {
    /* ignore */
  }
}
