// Mock electron `app` BEFORE importing the service so its constructor runs.
jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn(() => '0.0.0-test'),
    getPath: jest.fn(() => '/tmp/omniscribe-test-changelog'),
  },
}));

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

// Stub fs to avoid touching the real filesystem during the legacy migration check.
jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

import { ChangelogRegistryService } from './changelog-registry.service';
import { ChangelogService } from './changelog.service';

describe('ChangelogService', () => {
  let registry: ChangelogRegistryService;
  let service: ChangelogService;
  let fetchSpy: jest.SpyInstance;

  function makeResponse(init: { status: number; body?: string; etag?: string | null }): Response {
    return {
      ok: init.status >= 200 && init.status < 300,
      status: init.status,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'etag' ? (init.etag ?? null) : null),
      },
      text: async () => init.body ?? '',
      json: async () => (init.body ? JSON.parse(init.body) : null),
    } as unknown as Response;
  }

  beforeEach(() => {
    registry = new ChangelogRegistryService();
    service = new ChangelogService(registry);
    fetchSpy = jest.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns unknown error for an unregistered source id', async () => {
    const result = await service.fetchChangelog('nope');
    expect(result.error).toBe('unknown');
    expect(result.message).toContain('nope');
  });

  it('routes github-markdown sources through the markdown fetcher', async () => {
    registry.register({
      id: 'claude',
      source: { kind: 'github-markdown', url: 'https://example/CHANGELOG.md' },
    });
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a', etag: '"x"' })
    );

    const result = await service.fetchChangelog('claude');

    expect(fetchSpy).toHaveBeenCalledWith('https://example/CHANGELOG.md', expect.any(Object));
    expect(result.data?.entries[0].version).toBe('1.0.0');
  });

  it('routes github-releases sources through the releases fetcher', async () => {
    registry.register({
      id: 'codex',
      source: { kind: 'github-releases', repo: 'openai/codex', tagPrefix: 'rust-v' },
    });
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        etag: '"r"',
        body: JSON.stringify([
          { tag_name: 'rust-v0.129.0', body: 'shiny', prerelease: false, draft: false },
        ]),
      })
    );

    const result = await service.fetchChangelog('codex');

    expect(result.data?.entries[0].version).toBe('0.129.0');
  });

  it('routes custom sources to the registered backend fetcher', async () => {
    const fetcher = jest.fn().mockResolvedValue([{ version: '7.0.0', bodyMarkdown: 'custom' }]);

    registry.registerCustomFetcher('tok', fetcher);
    registry.register({ id: 'p', source: { kind: 'custom', fetcherToken: 'tok' } });

    const result = await service.fetchChangelog('p');

    expect(fetcher).toHaveBeenCalled();
    expect(result.data?.entries[0].version).toBe('7.0.0');
  });

  it('isolates caches across sources', async () => {
    registry.register({
      id: 'claude',
      source: { kind: 'github-markdown', url: 'https://example/c.md' },
    });
    registry.register({
      id: 'codex',
      source: { kind: 'github-releases', repo: 'openai/codex' },
    });

    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: '## 1.0.0\n\n- a', etag: '"x"' })
    );
    await service.fetchChangelog('claude');

    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, body: JSON.stringify([{ tag_name: 'v0.1.0', body: '' }]) })
    );
    await service.fetchChangelog('codex');

    // Calling claude again returns cached markdown, NOT the codex releases.
    const claudeAgain = await service.fetchChangelog('claude');
    expect(claudeAgain.data?.entries[0].version).toBe('1.0.0');
  });
});
