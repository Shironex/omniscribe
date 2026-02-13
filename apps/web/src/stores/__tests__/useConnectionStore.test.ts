import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';

// Mock the socket module
vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

import { useConnectionStore } from '../useConnectionStore';

const initialState = {
  status: 'reconnecting' as const,
  disconnectedAt: null,
};

describe('useConnectionStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    useConnectionStore.setState(initialState);
    // Always clean up listeners to reset module-level variables
    useConnectionStore.getState().cleanupListeners();
    vi.useFakeTimers();
  });

  afterEach(() => {
    useConnectionStore.getState().cleanupListeners();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts with reconnecting status', () => {
      expect(useConnectionStore.getState().status).toBe('reconnecting');
    });

    it('has null disconnectedAt', () => {
      expect(useConnectionStore.getState().disconnectedAt).toBeNull();
    });
  });

  describe('setConnected', () => {
    it('sets status to connected', () => {
      useConnectionStore.getState().setConnected();
      expect(useConnectionStore.getState().status).toBe('connected');
    });

    it('clears disconnectedAt', () => {
      useConnectionStore.setState({ disconnectedAt: Date.now() });
      useConnectionStore.getState().setConnected();
      expect(useConnectionStore.getState().disconnectedAt).toBeNull();
    });

    it('clears the failure timeout', () => {
      // Start reconnecting (sets a 30s timer)
      useConnectionStore.getState().setReconnecting();

      // Now connect before the timer fires
      useConnectionStore.getState().setConnected();

      // Advance past the 30s mark - should NOT call setFailed
      vi.advanceTimersByTime(35000);
      expect(useConnectionStore.getState().status).toBe('connected');
    });
  });

  describe('setReconnecting', () => {
    it('sets status to reconnecting', () => {
      useConnectionStore.setState({ status: 'connected' });
      useConnectionStore.getState().setReconnecting();
      expect(useConnectionStore.getState().status).toBe('reconnecting');
    });

    it('sets disconnectedAt to current time', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      useConnectionStore.getState().setReconnecting();
      expect(useConnectionStore.getState().disconnectedAt).toBe(now);
    });

    it('transitions to failed after 30 seconds', () => {
      useConnectionStore.getState().setReconnecting();
      expect(useConnectionStore.getState().status).toBe('reconnecting');

      vi.advanceTimersByTime(30000);
      expect(useConnectionStore.getState().status).toBe('failed');
    });

    it('resets the failure timer on subsequent calls', () => {
      useConnectionStore.getState().setReconnecting();

      // Advance 20 seconds
      vi.advanceTimersByTime(20000);
      expect(useConnectionStore.getState().status).toBe('reconnecting');

      // Call setReconnecting again, which should reset the timer
      useConnectionStore.getState().setReconnecting();

      // Advance another 20 seconds (40s total, but only 20s since last call)
      vi.advanceTimersByTime(20000);
      expect(useConnectionStore.getState().status).toBe('reconnecting');

      // Advance 10 more seconds (30s since last setReconnecting)
      vi.advanceTimersByTime(10000);
      expect(useConnectionStore.getState().status).toBe('failed');
    });
  });

  describe('setFailed', () => {
    it('sets status to failed', () => {
      useConnectionStore.getState().setFailed();
      expect(useConnectionStore.getState().status).toBe('failed');
    });

    it('clears the failure timeout', () => {
      useConnectionStore.getState().setReconnecting();
      useConnectionStore.getState().setFailed();

      // Advance past 30s - should stay failed, not trigger again
      vi.advanceTimersByTime(35000);
      expect(useConnectionStore.getState().status).toBe('failed');
    });
  });

  describe('retryConnection', () => {
    it('calls setReconnecting and socket.connect', () => {
      useConnectionStore.getState().retryConnection();

      expect(useConnectionStore.getState().status).toBe('reconnecting');
      expect(mockSocket.connect).toHaveBeenCalled();
    });
  });

  describe('initListeners', () => {
    it('registers socket event listeners', () => {
      useConnectionStore.getState().initListeners();

      // Should have registered connect, disconnect, reconnect_failed, ws:throttled
      const onCalls = mockSocket.on.mock.calls.map(([event]) => event);
      expect(onCalls).toContain('connect');
      expect(onCalls).toContain('disconnect');
      expect(onCalls).toContain('reconnect_failed');
      expect(onCalls).toContain('ws:throttled');
    });

    it('is idempotent - calling twice does not double-register', () => {
      useConnectionStore.getState().initListeners();
      const firstCallCount = mockSocket.on.mock.calls.length;

      useConnectionStore.getState().initListeners();
      expect(mockSocket.on.mock.calls.length).toBe(firstCallCount);
    });

    it('connect handler calls setConnected', () => {
      useConnectionStore.getState().initListeners();
      useConnectionStore.setState({ status: 'reconnecting' });

      mockSocket.__simulateEvent('connect');

      expect(useConnectionStore.getState().status).toBe('connected');
    });

    it('disconnect handler calls setReconnecting for server disconnect', () => {
      useConnectionStore.getState().initListeners();
      useConnectionStore.setState({ status: 'connected' });

      mockSocket.__simulateEvent('disconnect', 'transport close');

      expect(useConnectionStore.getState().status).toBe('reconnecting');
    });

    it('disconnect handler does NOT call setReconnecting for client disconnect', () => {
      useConnectionStore.getState().initListeners();
      useConnectionStore.setState({ status: 'connected' });

      mockSocket.__simulateEvent('disconnect', 'io client disconnect');

      // Should remain connected since it was intentional
      expect(useConnectionStore.getState().status).toBe('connected');
    });

    it('reconnect_failed handler calls setFailed', () => {
      useConnectionStore.getState().initListeners();

      mockSocket.__simulateEvent('reconnect_failed');

      expect(useConnectionStore.getState().status).toBe('failed');
    });
  });

  describe('cleanupListeners', () => {
    it('removes all registered listeners', () => {
      useConnectionStore.getState().initListeners();
      useConnectionStore.getState().cleanupListeners();

      // Verify off was called for each event
      const offCalls = mockSocket.off.mock.calls.map(([event]) => event);
      expect(offCalls).toContain('connect');
      expect(offCalls).toContain('disconnect');
      expect(offCalls).toContain('reconnect_failed');
      expect(offCalls).toContain('ws:throttled');
    });

    it('clears the failure timeout', () => {
      useConnectionStore.getState().setReconnecting();
      useConnectionStore.getState().cleanupListeners();

      // Advance past 30s - should NOT transition to failed
      vi.advanceTimersByTime(35000);
      expect(useConnectionStore.getState().status).toBe('reconnecting');
    });

    it('allows re-initialization after cleanup', () => {
      useConnectionStore.getState().initListeners();
      useConnectionStore.getState().cleanupListeners();

      // Clear mock call counts
      mockSocket.on.mockClear();

      useConnectionStore.getState().initListeners();

      const onCalls = mockSocket.on.mock.calls.map(([event]) => event);
      expect(onCalls).toContain('connect');
    });

    it('is safe to call when no listeners are registered', () => {
      expect(() => useConnectionStore.getState().cleanupListeners()).not.toThrow();
    });
  });
});
