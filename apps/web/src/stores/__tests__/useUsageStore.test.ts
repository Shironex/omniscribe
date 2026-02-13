import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import {
  useUsageStore,
  selectUsage,
  selectUsageStatus,
  selectUsageError,
  selectSessionPercentage,
  selectWeeklyPercentage,
} from '../useUsageStore';
import type { ClaudeUsage } from '@omniscribe/shared';

const initialState = {
  claudeUsage: null,
  status: 'idle' as const,
  error: null,
  errorMessage: null,
  lastFetched: null,
  workingDir: null,
  pollingEnabled: false,
};

function createMockUsage(overrides: Partial<ClaudeUsage> = {}): ClaudeUsage {
  return {
    sessionPercentage: 42,
    sessionResetTime: '2026-02-10T18:00:00Z',
    sessionResetText: 'Resets in 2h 15m',
    weeklyPercentage: 30,
    weeklyResetTime: '2026-02-15T00:00:00Z',
    weeklyResetText: 'Resets Feb 15 at 12:00am',
    sonnetWeeklyPercentage: 25,
    sonnetResetText: 'Resets Feb 17 at 9:59am',
    lastUpdated: new Date().toISOString(),
    userTimezone: 'America/New_York',
    ...overrides,
  };
}

describe('useUsageStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useUsageStore.setState(initialState);
  });

  afterEach(() => {
    useUsageStore.getState().stopPolling();
    vi.useRealTimers();
  });

  // ============================================
  // Initial State
  // ============================================

  describe('initial state', () => {
    it('has null claudeUsage', () => {
      expect(useUsageStore.getState().claudeUsage).toBeNull();
    });

    it('has idle status', () => {
      expect(useUsageStore.getState().status).toBe('idle');
    });

    it('has null error', () => {
      expect(useUsageStore.getState().error).toBeNull();
    });

    it('has null errorMessage', () => {
      expect(useUsageStore.getState().errorMessage).toBeNull();
    });

    it('has null lastFetched', () => {
      expect(useUsageStore.getState().lastFetched).toBeNull();
    });

    it('has null workingDir', () => {
      expect(useUsageStore.getState().workingDir).toBeNull();
    });

    it('has pollingEnabled false', () => {
      expect(useUsageStore.getState().pollingEnabled).toBe(false);
    });
  });

  // ============================================
  // setWorkingDir
  // ============================================

  describe('setWorkingDir', () => {
    it('sets the working directory', () => {
      useUsageStore.getState().setWorkingDir('/home/user/project');
      expect(useUsageStore.getState().workingDir).toBe('/home/user/project');
    });

    it('overwrites a previously set working directory', () => {
      useUsageStore.getState().setWorkingDir('/old/path');
      useUsageStore.getState().setWorkingDir('/new/path');
      expect(useUsageStore.getState().workingDir).toBe('/new/path');
    });
  });

  // ============================================
  // fetchUsage
  // ============================================

  describe('fetchUsage', () => {
    it('fetches usage data successfully', async () => {
      const usage = createMockUsage({ sessionPercentage: 55, weeklyPercentage: 40 });
      mockEmitAsync.mockResolvedValue({ usage });

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      const state = useUsageStore.getState();
      expect(state.claudeUsage).toEqual(usage);
      expect(state.status).toBe('success');
      expect(state.lastFetched).not.toBeNull();
      expect(state.error).toBeNull();
      expect(state.errorMessage).toBeNull();
    });

    it('calls emitAsync with correct event and payload', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });

      useUsageStore.getState().setWorkingDir('/my/project');
      await useUsageStore.getState().fetchUsage();

      expect(mockEmitAsync).toHaveBeenCalledWith(
        'usage:fetch',
        { workingDir: '/my/project' },
        { timeout: 60000 }
      );
    });

    it('uses workingDir argument over state workingDir', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });

      useUsageStore.getState().setWorkingDir('/state/dir');
      await useUsageStore.getState().fetchUsage('/arg/dir');

      expect(mockEmitAsync).toHaveBeenCalledWith(
        'usage:fetch',
        { workingDir: '/arg/dir' },
        { timeout: 60000 }
      );
    });

    it('handles error in response', async () => {
      mockEmitAsync.mockResolvedValue({
        error: 'auth_required',
        message: 'Not authenticated',
      });

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      const state = useUsageStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('auth_required');
      expect(state.errorMessage).toBe('Not authenticated');
      expect(state.claudeUsage).toBeNull();
    });

    it('handles error response without message', async () => {
      mockEmitAsync.mockResolvedValue({
        error: 'cli_not_found',
      });

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      const state = useUsageStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('cli_not_found');
      expect(state.errorMessage).toBeNull();
    });

    it('handles exception during fetch', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Network failure'));

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      const state = useUsageStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('unknown');
      expect(state.errorMessage).toBe('Network failure');
    });

    it('handles non-Error exception during fetch', async () => {
      mockEmitAsync.mockRejectedValue('string error');

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      const state = useUsageStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('unknown');
      expect(state.errorMessage).toBe('string error');
    });

    it('skips fetch if no workingDir is set', async () => {
      await useUsageStore.getState().fetchUsage();

      expect(mockEmitAsync).not.toHaveBeenCalled();
      expect(useUsageStore.getState().status).toBe('idle');
    });

    it('skips fetch if already fetching', async () => {
      // Simulate a long-running fetch that never resolves during this test
      let resolveFirst!: (value: unknown) => void;
      mockEmitAsync.mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)));

      useUsageStore.getState().setWorkingDir('/home/user/project');

      // Start first fetch (will be pending)
      const firstFetch = useUsageStore.getState().fetchUsage();
      expect(useUsageStore.getState().status).toBe('fetching');

      // Try second fetch while first is still pending
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      await useUsageStore.getState().fetchUsage();

      // emitAsync should only have been called once (the first time)
      expect(mockEmitAsync).toHaveBeenCalledTimes(1);

      // Resolve first fetch to clean up
      resolveFirst({ usage: createMockUsage() });
      await firstFetch;
    });

    it('sets status to fetching during request', async () => {
      let resolvePromise!: (value: unknown) => void;
      mockEmitAsync.mockImplementation(() => new Promise(resolve => (resolvePromise = resolve)));

      useUsageStore.getState().setWorkingDir('/home/user/project');
      const fetchPromise = useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().status).toBe('fetching');
      expect(useUsageStore.getState().error).toBeNull();
      expect(useUsageStore.getState().errorMessage).toBeNull();

      resolvePromise({ usage: createMockUsage() });
      await fetchPromise;
    });

    it('sets lastFetched timestamp on success', async () => {
      const now = Date.now();
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().lastFetched).toBeGreaterThanOrEqual(now);
    });

    it('does not update lastFetched on error response', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'unknown', message: 'fail' });

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().lastFetched).toBeNull();
    });

    it('does not update lastFetched on exception', async () => {
      mockEmitAsync.mockRejectedValue(new Error('timeout'));

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().lastFetched).toBeNull();
    });

    it('clears previous error on successful fetch', async () => {
      useUsageStore.setState({ error: 'unknown', errorMessage: 'Previous error' });
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });

      useUsageStore.getState().setWorkingDir('/home/user/project');
      await useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().error).toBeNull();
      expect(useUsageStore.getState().errorMessage).toBeNull();
    });
  });

  // ============================================
  // startPolling
  // ============================================

  describe('startPolling', () => {
    it('starts polling with an immediate fetch', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();

      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
      expect(useUsageStore.getState().pollingEnabled).toBe(true);
    });

    it('fetches again after 15 minutes', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();

      expect(mockEmitAsync).toHaveBeenCalledTimes(1);

      // Advance past the initial fetch so status is no longer 'fetching'
      await vi.advanceTimersByTimeAsync(100);

      // Advance to next polling interval (15 minutes)
      vi.advanceTimersByTime(15 * 60 * 1000);

      expect(mockEmitAsync).toHaveBeenCalledTimes(2);
    });

    it('fetches multiple times across intervals', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();

      // Initial fetch
      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);

      // 15min: second fetch
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(mockEmitAsync).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(100);

      // 30min: third fetch
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(mockEmitAsync).toHaveBeenCalledTimes(3);
    });

    it('does not start if socket is not connected', () => {
      mockSocket.connected = false;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();

      expect(mockEmitAsync).not.toHaveBeenCalled();
      expect(useUsageStore.getState().pollingEnabled).toBe(false);
    });

    it('does not duplicate if already polling', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();

      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);

      // Call startPolling again
      useUsageStore.getState().startPolling();

      // Should not trigger another immediate fetch
      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
      expect(useUsageStore.getState().pollingEnabled).toBe(true);

      // After 15min, should still only fire once (not doubled)
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(mockEmitAsync).toHaveBeenCalledTimes(2);
    });

    it('sets pollingEnabled to true', () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();

      expect(useUsageStore.getState().pollingEnabled).toBe(true);
    });
  });

  // ============================================
  // stopPolling
  // ============================================

  describe('stopPolling', () => {
    it('clears interval and sets pollingEnabled to false', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();
      expect(useUsageStore.getState().pollingEnabled).toBe(true);

      await vi.advanceTimersByTimeAsync(100);

      useUsageStore.getState().stopPolling();
      expect(useUsageStore.getState().pollingEnabled).toBe(false);

      // Advancing timers should not trigger another fetch
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(mockEmitAsync).toHaveBeenCalledTimes(1); // Only the initial fetch
    });

    it('is safe to call when not polling', () => {
      expect(() => useUsageStore.getState().stopPolling()).not.toThrow();
      expect(useUsageStore.getState().pollingEnabled).toBe(false);
    });

    it('is safe to call multiple times', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();
      await vi.advanceTimersByTimeAsync(100);

      useUsageStore.getState().stopPolling();
      expect(() => useUsageStore.getState().stopPolling()).not.toThrow();
      expect(useUsageStore.getState().pollingEnabled).toBe(false);
    });
  });

  // ============================================
  // isStale
  // ============================================

  describe('isStale', () => {
    it('returns true when lastFetched is null', () => {
      expect(useUsageStore.getState().isStale()).toBe(true);
    });

    it('returns true when lastFetched is older than 2 minutes', () => {
      const threeMinutesAgo = Date.now() - 3 * 60 * 1000;
      useUsageStore.setState({ lastFetched: threeMinutesAgo });

      expect(useUsageStore.getState().isStale()).toBe(true);
    });

    it('returns false when lastFetched is within 2 minutes', () => {
      const oneMinuteAgo = Date.now() - 1 * 60 * 1000;
      useUsageStore.setState({ lastFetched: oneMinuteAgo });

      expect(useUsageStore.getState().isStale()).toBe(false);
    });

    it('returns false when lastFetched is exactly now', () => {
      useUsageStore.setState({ lastFetched: Date.now() });

      expect(useUsageStore.getState().isStale()).toBe(false);
    });

    it('returns true when exactly at 2 minute boundary', () => {
      // 2 minutes and 1ms ago should be stale
      const justOverTwoMinutes = Date.now() - (2 * 60 * 1000 + 1);
      useUsageStore.setState({ lastFetched: justOverTwoMinutes });

      expect(useUsageStore.getState().isStale()).toBe(true);
    });

    it('becomes stale after time passes', () => {
      useUsageStore.setState({ lastFetched: Date.now() });
      expect(useUsageStore.getState().isStale()).toBe(false);

      // Advance past the stale threshold
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);
      expect(useUsageStore.getState().isStale()).toBe(true);
    });
  });

  // ============================================
  // isAtLimit
  // ============================================

  describe('isAtLimit', () => {
    it('returns false when claudeUsage is null', () => {
      expect(useUsageStore.getState().isAtLimit()).toBe(false);
    });

    it('returns false when sessionPercentage is below 100', () => {
      useUsageStore.setState({
        claudeUsage: createMockUsage({ sessionPercentage: 99 }),
      });

      expect(useUsageStore.getState().isAtLimit()).toBe(false);
    });

    it('returns true when sessionPercentage is exactly 100', () => {
      useUsageStore.setState({
        claudeUsage: createMockUsage({ sessionPercentage: 100 }),
      });

      expect(useUsageStore.getState().isAtLimit()).toBe(true);
    });

    it('returns true when sessionPercentage is over 100', () => {
      useUsageStore.setState({
        claudeUsage: createMockUsage({ sessionPercentage: 150 }),
      });

      expect(useUsageStore.getState().isAtLimit()).toBe(true);
    });

    it('returns false when sessionPercentage is 0', () => {
      useUsageStore.setState({
        claudeUsage: createMockUsage({ sessionPercentage: 0 }),
      });

      expect(useUsageStore.getState().isAtLimit()).toBe(false);
    });
  });

  // ============================================
  // clear
  // ============================================

  describe('clear', () => {
    it('resets all state to initial values', () => {
      useUsageStore.setState({
        claudeUsage: createMockUsage(),
        status: 'success',
        error: 'unknown',
        errorMessage: 'Some error',
        lastFetched: Date.now(),
        pollingEnabled: true,
      });

      useUsageStore.getState().clear();

      const state = useUsageStore.getState();
      expect(state.claudeUsage).toBeNull();
      expect(state.status).toBe('idle');
      expect(state.error).toBeNull();
      expect(state.errorMessage).toBeNull();
      expect(state.lastFetched).toBeNull();
      expect(state.pollingEnabled).toBe(false);
    });

    it('stops active polling', async () => {
      mockEmitAsync.mockResolvedValue({ usage: createMockUsage() });
      mockSocket.connected = true;

      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().startPolling();
      await vi.advanceTimersByTimeAsync(100);

      expect(mockEmitAsync).toHaveBeenCalledTimes(1);

      useUsageStore.getState().clear();

      // Advancing past interval should not trigger another fetch
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
    });

    it('does not clear workingDir', () => {
      useUsageStore.getState().setWorkingDir('/home/user/project');
      useUsageStore.getState().clear();

      // workingDir is not part of the clear reset
      expect(useUsageStore.getState().workingDir).toBe('/home/user/project');
    });

    it('is safe to call when already in initial state', () => {
      expect(() => useUsageStore.getState().clear()).not.toThrow();

      const state = useUsageStore.getState();
      expect(state.claudeUsage).toBeNull();
      expect(state.status).toBe('idle');
    });
  });

  // ============================================
  // Selectors
  // ============================================

  describe('selectors', () => {
    describe('selectUsage', () => {
      it('returns null when no usage data', () => {
        expect(selectUsage(useUsageStore.getState())).toBeNull();
      });

      it('returns usage data when present', () => {
        const usage = createMockUsage({ sessionPercentage: 75 });
        useUsageStore.setState({ claudeUsage: usage });

        expect(selectUsage(useUsageStore.getState())).toEqual(usage);
      });
    });

    describe('selectUsageStatus', () => {
      it('returns idle by default', () => {
        expect(selectUsageStatus(useUsageStore.getState())).toBe('idle');
      });

      it('returns current status', () => {
        useUsageStore.setState({ status: 'fetching' });
        expect(selectUsageStatus(useUsageStore.getState())).toBe('fetching');

        useUsageStore.setState({ status: 'success' });
        expect(selectUsageStatus(useUsageStore.getState())).toBe('success');

        useUsageStore.setState({ status: 'error' });
        expect(selectUsageStatus(useUsageStore.getState())).toBe('error');
      });
    });

    describe('selectUsageError', () => {
      it('returns null error and message by default', () => {
        const result = selectUsageError(useUsageStore.getState());
        expect(result).toEqual({ error: null, message: null });
      });

      it('returns error and message when present', () => {
        useUsageStore.setState({
          error: 'auth_required',
          errorMessage: 'Please authenticate',
        });

        const result = selectUsageError(useUsageStore.getState());
        expect(result).toEqual({
          error: 'auth_required',
          message: 'Please authenticate',
        });
      });

      it('returns error without message', () => {
        useUsageStore.setState({ error: 'unknown', errorMessage: null });

        const result = selectUsageError(useUsageStore.getState());
        expect(result).toEqual({ error: 'unknown', message: null });
      });
    });

    describe('selectSessionPercentage', () => {
      it('returns 0 when no usage data', () => {
        expect(selectSessionPercentage(useUsageStore.getState())).toBe(0);
      });

      it('returns sessionPercentage from usage data', () => {
        useUsageStore.setState({
          claudeUsage: createMockUsage({ sessionPercentage: 85 }),
        });

        expect(selectSessionPercentage(useUsageStore.getState())).toBe(85);
      });

      it('returns 0 when sessionPercentage is 0', () => {
        useUsageStore.setState({
          claudeUsage: createMockUsage({ sessionPercentage: 0 }),
        });

        expect(selectSessionPercentage(useUsageStore.getState())).toBe(0);
      });

      it('returns values over 100', () => {
        useUsageStore.setState({
          claudeUsage: createMockUsage({ sessionPercentage: 120 }),
        });

        expect(selectSessionPercentage(useUsageStore.getState())).toBe(120);
      });
    });

    describe('selectWeeklyPercentage', () => {
      it('returns 0 when no usage data', () => {
        expect(selectWeeklyPercentage(useUsageStore.getState())).toBe(0);
      });

      it('returns weeklyPercentage from usage data', () => {
        useUsageStore.setState({
          claudeUsage: createMockUsage({ weeklyPercentage: 60 }),
        });

        expect(selectWeeklyPercentage(useUsageStore.getState())).toBe(60);
      });

      it('returns 0 when weeklyPercentage is 0', () => {
        useUsageStore.setState({
          claudeUsage: createMockUsage({ weeklyPercentage: 0 }),
        });

        expect(selectWeeklyPercentage(useUsageStore.getState())).toBe(0);
      });

      it('returns values over 100', () => {
        useUsageStore.setState({
          claudeUsage: createMockUsage({ weeklyPercentage: 110 }),
        });

        expect(selectWeeklyPercentage(useUsageStore.getState())).toBe(110);
      });
    });
  });
});
