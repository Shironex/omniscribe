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

import { useClaudeChangelogStore } from '../useClaudeChangelogStore';
import type { ClaudeChangelogPayload } from '@omniscribe/shared';

const initialState = {
  data: null,
  status: 'idle' as const,
  error: null,
  errorMessage: null,
  lastFetched: null,
};

function makePayload(overrides: Partial<ClaudeChangelogPayload> = {}): ClaudeChangelogPayload {
  return {
    rawMarkdown: '## 1.0.0\n\n- a',
    entries: [{ version: '1.0.0', bodyMarkdown: '- a' }],
    fetchedAt: 1234567890,
    sourceUrl: 'https://example.test/CHANGELOG.md',
    fromCache: false,
    ...overrides,
  };
}

describe('useClaudeChangelogStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useClaudeChangelogStore.setState(initialState);
  });

  describe('initial state', () => {
    it('starts idle with null data', () => {
      const s = useClaudeChangelogStore.getState();
      expect(s.data).toBeNull();
      expect(s.status).toBe('idle');
      expect(s.error).toBeNull();
      expect(s.errorMessage).toBeNull();
      expect(s.lastFetched).toBeNull();
    });
  });

  describe('fetchChangelog', () => {
    it('emits FETCH with default forceRefresh=false and 30s timeout', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload() });

      await useClaudeChangelogStore.getState().fetchChangelog();

      expect(mockEmitAsync).toHaveBeenCalledWith(
        'claude-changelog:fetch',
        { forceRefresh: false },
        { timeout: 30000 }
      );
    });

    it('passes forceRefresh through to the gateway', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload() });

      await useClaudeChangelogStore.getState().fetchChangelog(true);

      expect(mockEmitAsync).toHaveBeenCalledWith(
        'claude-changelog:fetch',
        { forceRefresh: true },
        { timeout: 30000 }
      );
    });

    it('stores data and tracks lastFetched on success', async () => {
      const payload = makePayload({ fetchedAt: 9999 });
      mockEmitAsync.mockResolvedValue({ data: payload });

      await useClaudeChangelogStore.getState().fetchChangelog();

      const s = useClaudeChangelogStore.getState();
      expect(s.status).toBe('success');
      expect(s.data).toEqual(payload);
      expect(s.lastFetched).toBe(9999);
      expect(s.error).toBeNull();
    });

    it('handles a typed error response from the gateway', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'network', message: 'offline' });

      await useClaudeChangelogStore.getState().fetchChangelog();

      const s = useClaudeChangelogStore.getState();
      expect(s.status).toBe('error');
      expect(s.error).toBe('network');
      expect(s.errorMessage).toBe('offline');
      expect(s.data).toBeNull();
    });

    it('treats thrown emitAsync errors as unknown errors', async () => {
      mockEmitAsync.mockRejectedValue(new Error('socket dead'));

      await useClaudeChangelogStore.getState().fetchChangelog();

      const s = useClaudeChangelogStore.getState();
      expect(s.status).toBe('error');
      expect(s.error).toBe('unknown');
      expect(s.errorMessage).toBe('socket dead');
    });

    it('skips concurrent fetches while one is in flight', async () => {
      let resolve: ((value: unknown) => void) | undefined;
      mockEmitAsync.mockReturnValue(
        new Promise(r => {
          resolve = r;
        })
      );

      const first = useClaudeChangelogStore.getState().fetchChangelog();
      // Concurrent call should be a no-op.
      const second = useClaudeChangelogStore.getState().fetchChangelog();

      resolve?.({ data: makePayload() });
      await Promise.all([first, second]);

      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('resets all state fields to initial values', async () => {
      mockEmitAsync.mockResolvedValue({ data: makePayload() });
      await useClaudeChangelogStore.getState().fetchChangelog();

      useClaudeChangelogStore.getState().clear();

      expect(useClaudeChangelogStore.getState()).toMatchObject(initialState);
    });
  });
});
