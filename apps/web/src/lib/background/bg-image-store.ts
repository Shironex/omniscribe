import { createLogger } from '@omniscribe/shared';

/**
 * IndexedDB-backed storage for the single active background-blend image.
 *
 * Only one image is ever kept: {@link putBgImage} clears any previous records
 * before inserting, so the store holds at most one row. The small config blob
 * (kind/opacity/blur + the record id) lives in localStorage via
 * `useAppearanceStore`; the heavy image bytes live here so they never bloat
 * synchronous storage and can be streamed back as an object URL.
 */

const logger = createLogger('BgImageStore');

const DB_NAME = 'omniscribe-appearance';
const DB_VERSION = 1;
const STORE_NAME = 'bg-images';

/** Persisted record shape inside the `bg-images` object store. */
export interface BgImageRecord {
  id: string;
  blob: Blob;
  name: string;
  addedAt: number;
}

/**
 * Cache of object URLs keyed by record id. Object URLs leak until revoked, so
 * we revoke stale entries whenever a new id is requested or a record is removed.
 */
const objectUrlCache = new Map<string, string>();

/** True when the IndexedDB API is unavailable (SSR, locked-down jsdom, etc.). */
function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Open (and lazily create) the appearance database. Resolves to `null` when
 * IndexedDB is unavailable or the open fails, so callers can degrade gracefully.
 */
function openDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);

  return new Promise(resolve => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      logger.warn('openDb: indexedDB.open threw', error);
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      logger.warn('openDb: failed to open database', request.error);
      resolve(null);
    };
  });
}

/** Run a transaction against the image store and resolve when it completes. */
function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null
): Promise<T | null> {
  return openDb().then(
    db =>
      new Promise<T | null>(resolve => {
        if (!db) {
          resolve(null);
          return;
        }
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE_NAME, mode);
        } catch (error) {
          logger.warn('withStore: failed to start transaction', error);
          db.close();
          resolve(null);
          return;
        }
        const store = tx.objectStore(STORE_NAME);
        let request: IDBRequest<T> | null = null;
        try {
          request = work(store);
        } catch (error) {
          logger.warn('withStore: store operation threw', error);
        }
        tx.oncomplete = () => {
          db.close();
          resolve((request?.result as T | undefined) ?? null);
        };
        tx.onerror = () => {
          logger.warn('withStore: transaction failed', tx.error);
          db.close();
          resolve(null);
        };
        tx.onabort = () => {
          db.close();
          resolve(null);
        };
      })
  );
}

/** Revoke and forget a cached object URL for `id`, if any. */
function revokeCachedUrl(id: string): void {
  const cached = objectUrlCache.get(id);
  if (cached) {
    try {
      URL.revokeObjectURL(cached);
    } catch {
      // ignore — URL may already be invalid
    }
    objectUrlCache.delete(id);
  }
}

/**
 * Store `file` as the active background image, replacing any previous one.
 * Returns the generated record id, or `null` when storage is unavailable.
 */
export async function putBgImage(file: File): Promise<string | null> {
  if (!isIndexedDbAvailable()) {
    logger.warn('putBgImage: IndexedDB unavailable');
    return null;
  }

  const id = crypto.randomUUID();
  const record: BgImageRecord = {
    id,
    blob: file,
    name: file.name || 'background',
    addedAt: Date.now(),
  };

  const ok = await withStore('readwrite', store => {
    // Only one image is kept — clear then insert in the same transaction.
    store.clear();
    return store.put(record) as IDBRequest<IDBValidKey>;
  });

  if (ok === null) {
    logger.warn('putBgImage: failed to persist image');
    return null;
  }

  // Drop every cached URL — the previous image (and id) is gone.
  for (const cachedId of [...objectUrlCache.keys()]) {
    revokeCachedUrl(cachedId);
  }

  return id;
}

/**
 * Resolve `id` to a renderable object URL, creating and caching it on first
 * access. Returns `null` when the record is missing or storage is unavailable.
 */
export async function getBgImageUrl(id: string): Promise<string | null> {
  const cached = objectUrlCache.get(id);
  if (cached) return cached;

  // A new id is being requested — revoke any other cached URLs to avoid leaks.
  for (const cachedId of [...objectUrlCache.keys()]) {
    if (cachedId !== id) revokeCachedUrl(cachedId);
  }

  const record = await withStore<BgImageRecord>('readonly', store => store.get(id));
  if (!record || !record.blob) return null;

  let url: string;
  try {
    url = URL.createObjectURL(record.blob);
  } catch (error) {
    logger.warn('getBgImageUrl: createObjectURL failed', error);
    return null;
  }
  objectUrlCache.set(id, url);
  return url;
}

/** Delete the image record for `id` and revoke its cached object URL. */
export async function deleteBgImage(id: string): Promise<void> {
  revokeCachedUrl(id);
  await withStore('readwrite', store => store.delete(id));
}

/** Remove every stored image and revoke all cached object URLs. */
export async function clearBgImages(): Promise<void> {
  for (const cachedId of [...objectUrlCache.keys()]) {
    revokeCachedUrl(cachedId);
  }
  await withStore('readwrite', store => store.clear());
}
