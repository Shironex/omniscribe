import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  putBgImage,
  getBgImageUrl,
  deleteBgImage,
  clearBgImages,
  type BgImageRecord,
} from '@/lib/background/bg-image-store';

/**
 * The store degrades gracefully when IndexedDB is unavailable (the default in
 * jsdom) and otherwise drives a minimal in-memory fake that exercises the real
 * transaction/caching logic without adding a `fake-indexeddb` dependency.
 */

function makeFile(name = 'bg.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

describe('bg-image-store — no IndexedDB (graceful degradation)', () => {
  beforeEach(() => {
    // jsdom does not provide indexedDB; assert that explicitly.
    expect(typeof indexedDB).toBe('undefined');
  });

  it('putBgImage returns null when storage is unavailable', async () => {
    await expect(putBgImage(makeFile())).resolves.toBeNull();
  });

  it('getBgImageUrl returns null for an unknown id', async () => {
    await expect(getBgImageUrl('missing')).resolves.toBeNull();
  });

  it('deleteBgImage and clearBgImages never throw', async () => {
    await expect(deleteBgImage('whatever')).resolves.toBeUndefined();
    await expect(clearBgImages()).resolves.toBeUndefined();
  });
});

// ── Minimal in-memory IndexedDB fake ────────────────────────────────────────
// Implements only the surface the store touches: open/upgrade, a single
// object store with get/put/clear/delete, and transaction completion events.

interface FakeRequest<T = unknown> {
  result?: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

function installFakeIndexedDb(): { rows: Map<string, BgImageRecord> } {
  const rows = new Map<string, BgImageRecord>();

  function flush(fn: (() => void) | null) {
    if (fn) queueMicrotask(fn);
  }

  const fakeIndexedDB = {
    open() {
      const openReq: {
        result?: unknown;
        error: unknown;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      } = {
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };

      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => ({}),
        transaction() {
          const tx: {
            error: unknown;
            oncomplete: (() => void) | null;
            onerror: (() => void) | null;
            onabort: (() => void) | null;
            objectStore: () => unknown;
          } = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore: () => store,
          };
          const store = {
            get(id: string): FakeRequest {
              const req: FakeRequest = {
                result: rows.get(id),
                error: null,
                onsuccess: null,
                onerror: null,
              };
              flush(() => req.onsuccess?.());
              return req;
            },
            put(record: BgImageRecord): FakeRequest {
              rows.set(record.id, record);
              const req: FakeRequest = {
                result: record.id,
                error: null,
                onsuccess: null,
                onerror: null,
              };
              flush(() => req.onsuccess?.());
              return req;
            },
            clear(): FakeRequest {
              rows.clear();
              const req: FakeRequest = {
                result: undefined,
                error: null,
                onsuccess: null,
                onerror: null,
              };
              flush(() => req.onsuccess?.());
              return req;
            },
            delete(id: string): FakeRequest {
              rows.delete(id);
              const req: FakeRequest = {
                result: undefined,
                error: null,
                onsuccess: null,
                onerror: null,
              };
              flush(() => req.onsuccess?.());
              return req;
            },
          };
          // Complete the transaction on the next microtask after the op runs.
          flush(() => tx.oncomplete?.());
          return tx;
        },
        close() {},
      };

      openReq.result = db;
      flush(() => {
        openReq.onupgradeneeded?.();
        openReq.onsuccess?.();
      });
      return openReq;
    },
  };

  vi.stubGlobal('indexedDB', fakeIndexedDB);
  return { rows };
}

describe('bg-image-store — with fake IndexedDB', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let urlSeq = 0;

  beforeEach(async () => {
    urlSeq = 0;
    createObjectURL = vi.fn(() => `blob:fake/${++urlSeq}`);
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof URL);
    installFakeIndexedDb();
    // Start from a clean store (also resets the module's URL cache state).
    await clearBgImages();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores an image and returns a generated id', async () => {
    const id = await putBgImage(makeFile());
    expect(id).toBeTypeOf('string');
    expect(id).toBeTruthy();
  });

  it('resolves an object URL and caches it across calls', async () => {
    const id = (await putBgImage(makeFile())) as string;

    const url1 = await getBgImageUrl(id);
    const url2 = await getBgImageUrl(id);

    expect(url1).toBe('blob:fake/1');
    expect(url2).toBe(url1);
    // Cached — createObjectURL only called once for the same id.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('keeps only one image — replacing revokes the previous URL', async () => {
    const first = (await putBgImage(makeFile('a.png'))) as string;
    await getBgImageUrl(first); // url 1, cached

    await putBgImage(makeFile('b.png')); // clears store + cache
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');

    // The old id no longer resolves.
    const stale = await getBgImageUrl(first);
    expect(stale).toBeNull();
  });

  it('deleteBgImage revokes the cached URL and drops the record', async () => {
    const id = (await putBgImage(makeFile())) as string;
    await getBgImageUrl(id);

    await deleteBgImage(id);
    expect(revokeObjectURL).toHaveBeenCalled();
    await expect(getBgImageUrl(id)).resolves.toBeNull();
  });
});
