import { ChangelogRegistryService, DEFAULT_CHANGELOG_TTL_MS } from './changelog-registry.service';

describe('ChangelogRegistryService', () => {
  let registry: ChangelogRegistryService;

  beforeEach(() => {
    registry = new ChangelogRegistryService();
  });

  it('registers and retrieves a source by id', () => {
    registry.register({
      id: 'claude',
      source: { kind: 'github-markdown', url: 'https://example/CHANGELOG.md' },
    });
    const got = registry.get('claude');
    expect(got).toBeDefined();
    expect(got?.source.kind).toBe('github-markdown');
    expect(got?.cacheTtlMs).toBe(DEFAULT_CHANGELOG_TTL_MS);
  });

  it('clamps cacheTtlMs to [60s, 7d]', () => {
    registry.register({
      id: 'a',
      source: { kind: 'github-markdown', url: 'https://example/a.md' },
      cacheTtlMs: 0,
    });
    registry.register({
      id: 'b',
      source: { kind: 'github-markdown', url: 'https://example/b.md' },
      cacheTtlMs: 365 * 24 * 60 * 60 * 1000,
    });
    expect(registry.get('a')?.cacheTtlMs).toBe(60_000);
    expect(registry.get('b')?.cacheTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('overwrites duplicate registrations', () => {
    registry.register({
      id: 'claude',
      source: { kind: 'github-markdown', url: 'https://example/old.md' },
    });
    registry.register({
      id: 'claude',
      source: { kind: 'github-releases', repo: 'anthropics/claude-code' },
    });
    const got = registry.get('claude');
    expect(got?.source.kind).toBe('github-releases');
  });

  it('unregister removes the source and reports whether it existed', () => {
    registry.register({
      id: 'claude',
      source: { kind: 'github-markdown', url: 'https://example' },
    });
    expect(registry.unregister('claude')).toBe(true);
    expect(registry.get('claude')).toBeUndefined();
    expect(registry.unregister('claude')).toBe(false);
  });

  it('list returns every registered source', () => {
    registry.register({ id: 'a', source: { kind: 'github-markdown', url: 'https://a' } });
    registry.register({ id: 'b', source: { kind: 'github-releases', repo: 'o/r' } });
    const ids = registry.list().map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('register/unregister custom fetchers by token', async () => {
    const fn = jest.fn().mockResolvedValue([]);
    registry.registerCustomFetcher('codex', fn);
    expect(registry.getCustomFetcher('codex')).toBe(fn);
    expect(registry.unregisterCustomFetcher('codex')).toBe(true);
    expect(registry.getCustomFetcher('codex')).toBeUndefined();
  });
});
