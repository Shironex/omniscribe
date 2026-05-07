import { fetchGithubMarkdown } from './github-markdown.fetcher';

function makeResponse(init: { status: number; body?: string; etag?: string | null }): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'etag' ? (init.etag ?? null) : null),
    },
    text: async () => init.body ?? '',
  } as unknown as Response;
}

const URL = 'https://example.test/CHANGELOG.md';
const TTL = 6 * 60 * 60 * 1000;

describe('fetchGithubMarkdown', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches and caches on first call', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a\n', etag: '"abc"' })
    );

    const result = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'Omniscribe/test',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'Omniscribe/test' }),
      })
    );
    expect(result.cache).not.toBeNull();
    expect(result.response.data?.fromCache).toBe(false);
    expect(result.response.data?.entries).toEqual([{ version: '1.0.0', bodyMarkdown: '- a' }]);
  });

  it('returns fresh cache (fromCache=true) when within TTL and not forced', async () => {
    const cached = { rawMarkdown: '## 1.0.0\n\n- a', etag: '"abc"', fetchedAt: Date.now() - 1000 };

    const result = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.cache).toBeNull();
    expect(result.response.data?.fromCache).toBe(true);
  });

  it('honours forceRefresh and sends If-None-Match from cached etag', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ status: 304, etag: '"abc"' }));

    const cached = {
      rawMarkdown: '## 1.0.0\n\n- a',
      etag: '"abc"',
      fetchedAt: Date.now() - 10 * 60 * 60 * 1000,
    };

    const result = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached,
      forceRefresh: true,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const lastCall = fetchSpy.mock.calls[0]!;
    expect(lastCall[1].headers['If-None-Match']).toBe('"abc"');
    expect(result.response.data?.fromCache).toBe(true);
    expect(result.response.data?.entries[0].version).toBe('1.0.0');
  });

  it('falls back to cache on network error without erroring', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'));

    const cached = {
      rawMarkdown: '## 1.0.0\n\n- a',
      etag: '"abc"',
      fetchedAt: Date.now() - 10 * 60 * 60 * 1000,
    };

    const result = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached,
      forceRefresh: true,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.error).toBeUndefined();
    expect(result.response.data?.fromCache).toBe(true);
    expect(result.response.data?.entries[0].version).toBe('1.0.0');
  });

  it('returns network error when no cache exists and fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'));

    const result = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.data).toBeUndefined();
    expect(result.response.error).toBe('network');
  });

  it('flags rate-limit responses (and falls back to cache when available)', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ status: 429 }));
    const noCache = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });
    expect(noCache.response.error).toBe('rate_limited');

    fetchSpy.mockResolvedValueOnce(makeResponse({ status: 429 }));
    const withCache = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached: {
        rawMarkdown: '## 1.0.0\n\n- a',
        etag: '"abc"',
        fetchedAt: Date.now() - 10 * 60 * 60 * 1000,
      },
      forceRefresh: true,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });
    expect(withCache.response.error).toBeUndefined();
    expect(withCache.response.data?.fromCache).toBe(true);
  });

  it('treats stale cache (older than TTL) as needing refetch', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 2.0.0\n\n- b\n', etag: '"xyz"' })
    );

    const cached = {
      rawMarkdown: '## 1.0.0\n\n- a',
      etag: '"abc"',
      fetchedAt: Date.now() - TTL - 1,
    };

    const result = await fetchGithubMarkdown({
      sourceId: 'claude',
      url: URL,
      cached,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.data?.fromCache).toBe(false);
    expect(result.response.data?.entries[0].version).toBe('2.0.0');
  });
});
