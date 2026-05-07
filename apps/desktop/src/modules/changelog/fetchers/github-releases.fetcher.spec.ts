import { fetchGithubReleases, mapRelease } from './github-releases.fetcher';

function makeJsonResponse(init: {
  status: number;
  body?: unknown;
  etag?: string | null;
}): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'etag' ? (init.etag ?? null) : null),
    },
    json: async () => init.body,
  } as unknown as Response;
}

const TTL = 6 * 60 * 60 * 1000;

describe('mapRelease', () => {
  it('strips tagPrefix when the tag begins with it', () => {
    const e = mapRelease(
      {
        tag_name: 'rust-v0.129.0',
        body: 'notes',
        published_at: '2025-12-01T00:00:00Z',
        html_url: 'https://github.com/openai/codex/releases/tag/rust-v0.129.0',
        prerelease: false,
      },
      'rust-v'
    );
    expect(e?.version).toBe('0.129.0');
    expect(e?.bodyMarkdown).toBe('notes');
    expect(e?.publishedAt).toBe('2025-12-01T00:00:00Z');
    expect(e?.url).toBe('https://github.com/openai/codex/releases/tag/rust-v0.129.0');
    expect(e?.prerelease).toBe(false);
  });

  it('keeps the tag verbatim when prefix does not match', () => {
    const e = mapRelease({ tag_name: 'v1.0.0', body: '' }, 'rust-v');
    expect(e?.version).toBe('v1.0.0');
  });

  it('falls back to name when tag_name is missing', () => {
    const e = mapRelease({ name: 'v2 — Phoenix', body: '' });
    expect(e?.version).toBe('v2 — Phoenix');
  });

  it('returns null when both tag_name and name are missing', () => {
    expect(mapRelease({ body: 'x' })).toBeNull();
  });
});

describe('fetchGithubReleases', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches and maps releases on first call', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({
        status: 200,
        etag: '"x"',
        body: [
          { tag_name: 'rust-v0.129.0', body: 'shiny', prerelease: false, draft: false },
          { tag_name: 'rust-v0.128.0', body: 'older', prerelease: false, draft: false },
        ],
      })
    );

    const result = await fetchGithubReleases({
      sourceId: 'codex',
      repo: 'openai/codex',
      tagPrefix: 'rust-v',
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.data?.entries).toHaveLength(2);
    expect(result.response.data?.entries[0].version).toBe('0.129.0');
    expect(result.response.data?.entries[1].version).toBe('0.128.0');
    expect(result.response.data?.viewUrl).toBe('https://github.com/openai/codex/releases');
    expect(result.cache).not.toBeNull();
  });

  it('filters out drafts', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({
        status: 200,
        body: [
          { tag_name: 'v1.0.0', body: '', draft: true },
          { tag_name: 'v0.9.0', body: '', draft: false },
        ],
      })
    );

    const result = await fetchGithubReleases({
      sourceId: 'codex',
      repo: 'o/r',
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.data?.entries).toHaveLength(1);
    expect(result.response.data?.entries[0].version).toBe('v0.9.0');
  });

  it('respects includePrereleases=false', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({
        status: 200,
        body: [
          { tag_name: 'v1.0.0-rc1', body: '', prerelease: true },
          { tag_name: 'v0.9.0', body: '', prerelease: false },
        ],
      })
    );

    const result = await fetchGithubReleases({
      sourceId: 'codex',
      repo: 'o/r',
      includePrereleases: false,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.data?.entries).toHaveLength(1);
    expect(result.response.data?.entries[0].version).toBe('v0.9.0');
  });

  it('flags rate-limit and falls back to cache when available', async () => {
    fetchSpy.mockResolvedValueOnce(makeJsonResponse({ status: 429 }));

    const cached = {
      entries: [{ version: '0.1.0', bodyMarkdown: '' }],
      etag: null,
      fetchedAt: Date.now() - 10 * 60 * 60 * 1000,
    };

    const result = await fetchGithubReleases({
      sourceId: 'codex',
      repo: 'o/r',
      cached,
      forceRefresh: true,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.error).toBeUndefined();
    expect(result.response.data?.fromCache).toBe(true);
  });

  it('returns rate_limited error when no cache exists', async () => {
    fetchSpy.mockResolvedValueOnce(makeJsonResponse({ status: 403 }));

    const result = await fetchGithubReleases({
      sourceId: 'codex',
      repo: 'o/r',
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.error).toBe('rate_limited');
  });

  it('handles 304 by returning the cached payload with bumped fetchedAt', async () => {
    fetchSpy.mockResolvedValueOnce(makeJsonResponse({ status: 304, etag: '"x"' }));

    const cached = {
      entries: [{ version: '0.1.0', bodyMarkdown: '' }],
      etag: '"x"',
      fetchedAt: Date.now() - 10 * 60 * 60 * 1000,
    };

    const result = await fetchGithubReleases({
      sourceId: 'codex',
      repo: 'o/r',
      cached,
      forceRefresh: true,
      cacheTtlMs: TTL,
      userAgent: 'ua',
    });

    expect(result.response.data?.fromCache).toBe(true);
    expect(result.cache).not.toBeNull();
  });
});
