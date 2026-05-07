import { fetchCustom } from './custom.fetcher';

const TTL = 60 * 60 * 1000;

describe('fetchCustom', () => {
  it('routes to the registered fetcher and returns its entries', async () => {
    const fetcher = jest.fn().mockResolvedValue([{ version: '1.0.0', bodyMarkdown: 'a' }]);

    const result = await fetchCustom({
      sourceId: 'plugin-x',
      fetcherToken: 'tok',
      fetcher,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
    });

    expect(fetcher).toHaveBeenCalled();
    expect(result.response.data?.entries).toEqual([{ version: '1.0.0', bodyMarkdown: 'a' }]);
    expect(result.cache).not.toBeNull();
  });

  it('returns unknown error when no fetcher is registered for the token', async () => {
    const result = await fetchCustom({
      sourceId: 'plugin-x',
      fetcherToken: 'tok',
      fetcher: undefined,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
    });

    expect(result.response.error).toBe('unknown');
    expect(result.response.message).toContain('tok');
  });

  it('falls back to stale cache when the fetcher throws', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('boom'));

    const result = await fetchCustom({
      sourceId: 'plugin-x',
      fetcherToken: 'tok',
      fetcher,
      cached: {
        entries: [{ version: '0.1.0', bodyMarkdown: '' }],
        fetchedAt: Date.now() - 10 * 60 * 60 * 1000,
      },
      forceRefresh: true,
      cacheTtlMs: TTL,
    });

    expect(result.response.error).toBeUndefined();
    expect(result.response.data?.fromCache).toBe(true);
  });

  it('returns parse_error when the fetcher returns a non-array', async () => {
    const fetcher = jest.fn().mockResolvedValue('not-an-array' as unknown as never);

    const result = await fetchCustom({
      sourceId: 'plugin-x',
      fetcherToken: 'tok',
      fetcher,
      cached: null,
      forceRefresh: false,
      cacheTtlMs: TTL,
    });

    expect(result.response.error).toBe('parse_error');
  });
});
