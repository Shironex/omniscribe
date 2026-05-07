import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';

vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

const mockEmitAsync = vi.fn();
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: (...args: unknown[]) => mockEmitAsync(...args),
}));

import { useChangelogStore } from '../useChangelogStore';
import type { ChangelogPayload } from '@omniscribe/shared';

function makePayload(
  sourceId: string,
  overrides: Partial<ChangelogPayload> = {}
): ChangelogPayload {
  return {
    sourceId,
    rawMarkdown: '## 1.0.0\n\n- a',
    entries: [{ version: '1.0.0', bodyMarkdown: '- a' }],
    fetchedAt: 1234567890,
    sourceUrl: 'https://example.test/CHANGELOG.md',
    fromCache: false,
    ...overrides,
  };
}

describe('useChangelogStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useChangelogStore.setState({ bySource: {} });
  });

  describe('initial state', () => {
    it('starts with an empty bySource map', () => {
      expect(useChangelogStore.getState().bySource).toEqual({});
    });

    it('selectChangelogSlot returns initial slot for unknown sourceIds', () => {
      const slot = useChangelogStore.getState().bySource['nope'];
      expect(slot).toBeUndefined();
    });
  });

  describe('fetchChangelog', () => {
    it('emits FETCH with sourceId and forceRefresh=false by default', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload('claude') });

      await useChangelogStore.getState().fetchChangelog('claude');

      expect(mockEmitAsync).toHaveBeenCalledWith(
        'changelog:fetch',
        { sourceId: 'claude', forceRefresh: false },
        { timeout: 30000 }
      );
    });

    it('passes forceRefresh through to the gateway', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload('claude') });

      await useChangelogStore.getState().fetchChangelog('claude', true);

      expect(mockEmitAsync).toHaveBeenCalledWith(
        'changelog:fetch',
        { sourceId: 'claude', forceRefresh: true },
        { timeout: 30000 }
      );
    });

    it('stores per-source data and tracks lastFetched on success', async () => {
      const payload = makePayload('claude', { fetchedAt: 9999 });
      mockEmitAsync.mockResolvedValue({ data: payload });

      await useChangelogStore.getState().fetchChangelog('claude');

      const slot = useChangelogStore.getState().bySource['claude'];
      expect(slot.status).toBe('success');
      expect(slot.data).toEqual(payload);
      expect(slot.lastFetched).toBe(9999);
      expect(slot.error).toBeNull();
    });

    it('handles a typed error response from the gateway', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'network', message: 'offline' });

      await useChangelogStore.getState().fetchChangelog('claude');

      const slot = useChangelogStore.getState().bySource['claude'];
      expect(slot.status).toBe('error');
      expect(slot.error).toBe('network');
      expect(slot.errorMessage).toBe('offline');
      expect(slot.data).toBeNull();
    });

    it('treats thrown emitAsync errors as unknown errors', async () => {
      mockEmitAsync.mockRejectedValue(new Error('socket dead'));

      await useChangelogStore.getState().fetchChangelog('claude');

      const slot = useChangelogStore.getState().bySource['claude'];
      expect(slot.status).toBe('error');
      expect(slot.error).toBe('unknown');
      expect(slot.errorMessage).toBe('socket dead');
    });

    it('skips concurrent fetches for the SAME sourceId while one is in flight', async () => {
      let resolve: ((value: unknown) => void) | undefined;
      mockEmitAsync.mockReturnValue(
        new Promise(r => {
          resolve = r;
        })
      );

      const first = useChangelogStore.getState().fetchChangelog('claude');
      // Concurrent call for the SAME source should be a no-op.
      const second = useChangelogStore.getState().fetchChangelog('claude');

      resolve?.({ data: makePayload('claude') });
      await Promise.all([first, second]);

      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
    });

    it('does NOT block fetches for a DIFFERENT sourceId', async () => {
      const resolves: Record<string, ((value: unknown) => void) | undefined> = {};
      mockEmitAsync.mockImplementation((_event: string, body: { sourceId: string }) => {
        return new Promise(r => {
          resolves[body.sourceId] = r;
        });
      });

      const claudeFetch = useChangelogStore.getState().fetchChangelog('claude');
      const codexFetch = useChangelogStore.getState().fetchChangelog('codex');

      // Both fetches are in flight concurrently.
      expect(mockEmitAsync).toHaveBeenCalledTimes(2);

      resolves.claude?.({ data: makePayload('claude') });
      resolves.codex?.({ data: makePayload('codex') });
      await Promise.all([claudeFetch, codexFetch]);

      expect(useChangelogStore.getState().bySource['claude']?.status).toBe('success');
      expect(useChangelogStore.getState().bySource['codex']?.status).toBe('success');
    });
  });

  describe('clear', () => {
    it('drops a single sourceId slot when specified', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload('claude') });
      await useChangelogStore.getState().fetchChangelog('claude');
      mockEmitAsync.mockResolvedValue({ data: makePayload('codex') });
      await useChangelogStore.getState().fetchChangelog('codex');

      useChangelogStore.getState().clear('claude');

      expect(useChangelogStore.getState().bySource['claude']).toBeUndefined();
      expect(useChangelogStore.getState().bySource['codex']?.status).toBe('success');
    });

    it('drops every slot when sourceId is omitted', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload('claude') });
      await useChangelogStore.getState().fetchChangelog('claude');

      useChangelogStore.getState().clear();

      expect(useChangelogStore.getState().bySource).toEqual({});
    });
  });
});
