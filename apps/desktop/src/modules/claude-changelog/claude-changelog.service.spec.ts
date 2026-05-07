// Mock electron `app` (BEFORE the service is imported) so the constructor
// can call `app.getVersion()` without a running Electron context.
jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn(() => '0.0.0-test'),
  },
}));

// In-memory mock for `electron-store` — each instance gets its own bag.
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation((opts: { defaults?: Record<string, unknown> }) => {
    const data: Record<string, unknown> = { ...(opts?.defaults ?? {}) };
    return {
      get: (key: string) => data[key],
      set: (key: string, value: unknown) => {
        data[key] = value;
      },
      delete: (key: string) => {
        delete data[key];
      },
      has: (key: string) => key in data,
      clear: () => {
        for (const k of Object.keys(data)) delete data[k];
      },
      get path() {
        return ':memory:';
      },
    };
  });
});

import {
  CLAUDE_CHANGELOG_TTL_MS,
  CLAUDE_CHANGELOG_URL,
  ClaudeChangelogService,
  parseChangelogMarkdown,
} from './claude-changelog.service';

// ---------- parseChangelogMarkdown ----------

describe('parseChangelogMarkdown', () => {
  it('parses upstream shape and discards the H1 preamble', () => {
    const md = `# Changelog\n\n## 2.1.132\n\n- Added foo\n- Fixed bar\n\n## 2.1.131\n\n- baz\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      version: '2.1.132',
      bodyMarkdown: '- Added foo\n- Fixed bar',
    });
    expect(entries[1]).toEqual({ version: '2.1.131', bodyMarkdown: '- baz' });
  });

  it('preserves upstream order (newest-first, no sort)', () => {
    const md = `## 9.9.9\n\n- newest\n\n## 1.0.0\n\n- oldest\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries.map(e => e.version)).toEqual(['9.9.9', '1.0.0']);
  });

  it('handles BOM and CRLF line endings', () => {
    const md = `\uFEFF# Changelog\r\n\r\n## 1.2.3\r\n\r\n- one\r\n- two\r\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('1.2.3');
    expect(entries[0].bodyMarkdown).toBe('- one\n- two');
  });

  it('trims trailing whitespace and blank lines from bodies', () => {
    const md = `## 1.0.0\n\n- a\n\n\n\n## 0.9.0\n\n- b\n\n\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries[0].bodyMarkdown).toBe('- a');
    expect(entries[1].bodyMarkdown).toBe('- b');
  });

  it('keeps non-semver release labels verbatim', () => {
    const md = `## v2 — Project Phoenix\n\n- ship it\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('v2 — Project Phoenix');
  });

  it('returns an empty array on input with no `## ` headers', () => {
    expect(parseChangelogMarkdown('# Changelog\n\nNothing here.')).toEqual([]);
  });
});

// ---------- ClaudeChangelogService ----------

describe('ClaudeChangelogService', () => {
  let service: ClaudeChangelogService;
  let fetchSpy: jest.SpyInstance;

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

  beforeEach(() => {
    service = new ClaudeChangelogService();
    fetchSpy = jest.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches and caches on first call', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        body: '# Changelog\n\n## 1.0.0\n\n- a\n',
        etag: '"abc"',
      })
    );

    const result = await service.fetchChangelog();

    expect(fetchSpy).toHaveBeenCalledWith(
      CLAUDE_CHANGELOG_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      })
    );
    expect(result.data).toBeDefined();
    expect(result.data?.fromCache).toBe(false);
    expect(result.data?.entries).toEqual([{ version: '1.0.0', bodyMarkdown: '- a' }]);
  });

  it('returns cached payload (fromCache=true) when within TTL', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a\n', etag: '"abc"' })
    );
    await service.fetchChangelog();
    fetchSpy.mockClear();

    const result = await service.fetchChangelog();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.data?.fromCache).toBe(true);
  });

  it('honours forceRefresh and sends If-None-Match from cached etag', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a\n', etag: '"abc"' })
    );
    await service.fetchChangelog();

    fetchSpy.mockResolvedValueOnce(makeResponse({ status: 304, etag: '"abc"' }));
    const result = await service.fetchChangelog(true);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const lastCall = fetchSpy.mock.calls[1]!;
    expect(lastCall[1].headers['If-None-Match']).toBe('"abc"');
    expect(result.data?.fromCache).toBe(true);
    expect(result.data?.entries[0].version).toBe('1.0.0');
  });

  it('falls back to cache on network error without erroring', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a\n', etag: '"abc"' })
    );
    await service.fetchChangelog();

    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    const result = await service.fetchChangelog(true);

    expect(result.error).toBeUndefined();
    expect(result.data?.fromCache).toBe(true);
    expect(result.data?.entries[0].version).toBe('1.0.0');
  });

  it('returns network error when no cache exists and fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'));

    const result = await service.fetchChangelog();

    expect(result.data).toBeUndefined();
    expect(result.error).toBe('network');
  });

  it('flags rate-limit responses (and falls back to cache when available)', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ status: 429 }));
    const noCache = await service.fetchChangelog();
    expect(noCache.error).toBe('rate_limited');

    // Seed cache, then 429 → fall back to cache silently.
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a\n', etag: '"abc"' })
    );
    await service.fetchChangelog();
    fetchSpy.mockResolvedValueOnce(makeResponse({ status: 429 }));
    const withCache = await service.fetchChangelog(true);
    expect(withCache.error).toBeUndefined();
    expect(withCache.data?.fromCache).toBe(true);
  });

  it('treats stale cache (older than TTL) as needing refetch', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a\n', etag: '"abc"' })
    );
    const first = await service.fetchChangelog();
    expect(first.data?.fromCache).toBe(false);

    // Rewind the cached fetchedAt past the TTL window.
    const internalStore = (
      service as unknown as {
        store: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
      }
    ).store;
    const cached = internalStore.get('cache') as { fetchedAt: number };
    internalStore.set('cache', { ...cached, fetchedAt: Date.now() - CLAUDE_CHANGELOG_TTL_MS - 1 });

    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 2.0.0\n\n- b\n', etag: '"xyz"' })
    );
    const second = await service.fetchChangelog();
    expect(second.data?.fromCache).toBe(false);
    expect(second.data?.entries[0].version).toBe('2.0.0');
  });
});
