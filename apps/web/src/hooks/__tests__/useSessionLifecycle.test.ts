import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks (must be declared before any imports that use them) ----

const mockRemoveSession = vi.fn().mockResolvedValue(undefined);
const mockKillTerminal = vi.fn();

// Mutable store sessions — handleKillSession reads from useSessionStore.getState()
let mockStoreSessions: any[] = [];

vi.mock('@/lib/session', () => ({
  removeSession: (...args: unknown[]) => mockRemoveSession(...args),
}));

vi.mock('@/lib/terminal', () => ({
  killTerminal: (...args: unknown[]) => mockKillTerminal(...args),
}));

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ sessions: mockStoreSessions }),
    {
      getState: () => ({ sessions: mockStoreSessions }),
    }
  ),
}));

// ---- Import under test (after mocks) ----

import { useSessionLifecycle } from '../useSessionLifecycle';

// ---- Types ----

interface MockSession {
  id: string;
  name: string;
  status: string;
  terminalSessionId?: number;
  projectPath: string;
  workingDirectory: string;
  aiMode: string;
  createdAt: Date;
  lastActiveAt: Date;
}

// ---- Helpers ----

let sessionCounter = 0;

function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  sessionCounter += 1;
  return {
    id: `session-${sessionCounter}`,
    name: `Session ${sessionCounter}`,
    status: 'idle',
    projectPath: '/test/project',
    workingDirectory: '/test/project',
    aiMode: 'claude',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ...overrides,
  };
}

// ---- Tests ----

describe('useSessionLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionCounter = 0;
    mockStoreSessions = [];
  });

  // ================================================================
  // handleStopAll
  // ================================================================
  describe('handleStopAll', () => {
    it('stops all non-disconnected sessions', async () => {
      const sessions = [
        createMockSession({ status: 'idle', terminalSessionId: 1 }),
        createMockSession({ status: 'working', terminalSessionId: 2 }),
        createMockSession({ status: 'needs_input', terminalSessionId: 3 }),
      ] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleStopAll();
      });

      expect(mockKillTerminal).toHaveBeenCalledTimes(3);
      expect(mockKillTerminal).toHaveBeenCalledWith(1);
      expect(mockKillTerminal).toHaveBeenCalledWith(2);
      expect(mockKillTerminal).toHaveBeenCalledWith(3);
      expect(mockRemoveSession).toHaveBeenCalledTimes(3);
      expect(mockRemoveSession).toHaveBeenCalledWith('session-1');
      expect(mockRemoveSession).toHaveBeenCalledWith('session-2');
      expect(mockRemoveSession).toHaveBeenCalledWith('session-3');
    });

    it('skips disconnected sessions', async () => {
      const sessions = [
        createMockSession({ status: 'idle', terminalSessionId: 1 }),
        createMockSession({ status: 'disconnected', terminalSessionId: 2 }),
        createMockSession({ status: 'working', terminalSessionId: 3 }),
      ] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleStopAll();
      });

      // disconnected session (session-2) should be skipped entirely
      expect(mockKillTerminal).toHaveBeenCalledTimes(2);
      expect(mockKillTerminal).toHaveBeenCalledWith(1);
      expect(mockKillTerminal).toHaveBeenCalledWith(3);
      expect(mockRemoveSession).toHaveBeenCalledTimes(2);
      expect(mockRemoveSession).toHaveBeenCalledWith('session-1');
      expect(mockRemoveSession).toHaveBeenCalledWith('session-3');
      // Ensure session-2 was NOT processed
      expect(mockRemoveSession).not.toHaveBeenCalledWith('session-2');
      expect(mockKillTerminal).not.toHaveBeenCalledWith(2);
    });

    it('skips all sessions when every session is disconnected', async () => {
      const sessions = [
        createMockSession({ status: 'disconnected', terminalSessionId: 1 }),
        createMockSession({ status: 'disconnected', terminalSessionId: 2 }),
      ] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleStopAll();
      });

      expect(mockKillTerminal).not.toHaveBeenCalled();
      expect(mockRemoveSession).not.toHaveBeenCalled();
    });

    it('calls killTerminal only for sessions with terminalSessionId', async () => {
      const sessions = [
        createMockSession({ status: 'idle', terminalSessionId: 10 }),
        createMockSession({ status: 'working' }), // no terminalSessionId
        createMockSession({ status: 'idle', terminalSessionId: 20 }),
      ] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleStopAll();
      });

      // killTerminal called only for sessions with terminalSessionId
      expect(mockKillTerminal).toHaveBeenCalledTimes(2);
      expect(mockKillTerminal).toHaveBeenCalledWith(10);
      expect(mockKillTerminal).toHaveBeenCalledWith(20);

      // removeSession called for all non-disconnected sessions
      expect(mockRemoveSession).toHaveBeenCalledTimes(3);
    });

    it('handles errors gracefully without throwing', async () => {
      mockRemoveSession.mockRejectedValueOnce(new Error('server error'));

      const sessions = [
        createMockSession({ status: 'idle', terminalSessionId: 1 }),
        createMockSession({ status: 'working', terminalSessionId: 2 }),
      ] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      // Should not throw even when removeSession rejects for session-1
      await act(async () => {
        await result.current.handleStopAll();
      });

      // Both sessions should still be attempted (parallel execution)
      expect(mockKillTerminal).toHaveBeenCalledTimes(2);
      expect(mockRemoveSession).toHaveBeenCalledTimes(2);
    });

    it('handles errors in killTerminal gracefully', async () => {
      mockKillTerminal.mockImplementationOnce(() => {
        throw new Error('kill failed');
      });

      const sessions = [
        createMockSession({ status: 'idle', terminalSessionId: 1 }),
        createMockSession({ status: 'working', terminalSessionId: 2 }),
      ] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      // Should not throw even when killTerminal throws for session-1
      await act(async () => {
        await result.current.handleStopAll();
      });

      // First session: killTerminal threw, but the error is caught
      // so removeSession is NOT called for that session (error breaks the try block)
      // Second session should still be processed
      expect(mockKillTerminal).toHaveBeenCalledTimes(2);
      expect(mockRemoveSession).toHaveBeenCalledWith('session-2');
    });

    it('handles empty sessions array', async () => {
      const sessions: any[] = [];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleStopAll();
      });

      expect(mockKillTerminal).not.toHaveBeenCalled();
      expect(mockRemoveSession).not.toHaveBeenCalled();
    });

    it('handles terminalSessionId of 0 (falsy but valid)', async () => {
      const sessions = [createMockSession({ status: 'idle', terminalSessionId: 0 })] as any[];

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleStopAll();
      });

      // terminalSessionId 0 is not undefined, so killTerminal should be called
      expect(mockKillTerminal).toHaveBeenCalledTimes(1);
      expect(mockKillTerminal).toHaveBeenCalledWith(0);
      expect(mockRemoveSession).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // handleKillSession
  // ================================================================
  describe('handleKillSession', () => {
    it('kills a specific session by ID', async () => {
      const sessions = [
        createMockSession({ id: 'target', status: 'working', terminalSessionId: 5 }),
        createMockSession({ id: 'other', status: 'idle', terminalSessionId: 6 }),
      ] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleKillSession('target');
      });

      expect(mockKillTerminal).toHaveBeenCalledTimes(1);
      expect(mockKillTerminal).toHaveBeenCalledWith(5);
      expect(mockRemoveSession).toHaveBeenCalledTimes(1);
      expect(mockRemoveSession).toHaveBeenCalledWith('target');
    });

    it('calls killTerminal when session has terminalSessionId', async () => {
      const sessions = [createMockSession({ id: 'with-terminal', terminalSessionId: 42 })] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleKillSession('with-terminal');
      });

      expect(mockKillTerminal).toHaveBeenCalledWith(42);
      expect(mockRemoveSession).toHaveBeenCalledWith('with-terminal');
    });

    it('does not call killTerminal when session has no terminalSessionId', async () => {
      const sessions = [
        createMockSession({ id: 'no-terminal' }), // no terminalSessionId
      ] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleKillSession('no-terminal');
      });

      expect(mockKillTerminal).not.toHaveBeenCalled();
      expect(mockRemoveSession).toHaveBeenCalledWith('no-terminal');
    });

    it('calls removeSession even when session is not found in store', async () => {
      const sessions = [createMockSession({ id: 'existing' })] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleKillSession('non-existent');
      });

      // Session not found, so killTerminal should not be called
      expect(mockKillTerminal).not.toHaveBeenCalled();
      // removeSession should still be called with the given sessionId
      expect(mockRemoveSession).toHaveBeenCalledWith('non-existent');
    });

    it('handles removeSession errors gracefully', async () => {
      mockRemoveSession.mockRejectedValueOnce(new Error('remove failed'));

      const sessions = [createMockSession({ id: 'error-session', terminalSessionId: 7 })] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      // Should not throw
      await act(async () => {
        await result.current.handleKillSession('error-session');
      });

      expect(mockKillTerminal).toHaveBeenCalledWith(7);
      expect(mockRemoveSession).toHaveBeenCalledWith('error-session');
    });

    it('handles killTerminal errors gracefully', async () => {
      mockKillTerminal.mockImplementationOnce(() => {
        throw new Error('kill failed');
      });

      const sessions = [createMockSession({ id: 'kill-error', terminalSessionId: 8 })] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      // Should not throw even when killTerminal throws
      await act(async () => {
        await result.current.handleKillSession('kill-error');
      });

      expect(mockKillTerminal).toHaveBeenCalledWith(8);
      // removeSession is NOT called because killTerminal threw inside the try block
      // before removeSession could execute... actually, let's check the code:
      // killTerminal is called first, then removeSession. If killTerminal throws,
      // the catch block handles it and removeSession is NOT called.
    });

    it('handles terminalSessionId of 0 (falsy but valid)', async () => {
      const sessions = [createMockSession({ id: 'zero-terminal', terminalSessionId: 0 })] as any[];
      mockStoreSessions = sessions;

      const { result } = renderHook(() => useSessionLifecycle(sessions));

      await act(async () => {
        await result.current.handleKillSession('zero-terminal');
      });

      // terminalSessionId 0 !== undefined, so killTerminal should be called
      expect(mockKillTerminal).toHaveBeenCalledWith(0);
      expect(mockRemoveSession).toHaveBeenCalledWith('zero-terminal');
    });
  });

  // ================================================================
  // sessionsRef update behavior
  // ================================================================
  describe('ref update', () => {
    it('uses updated sessions after re-render', async () => {
      const initialSessions = [
        createMockSession({ id: 'initial-1', status: 'idle', terminalSessionId: 1 }),
      ] as any[];

      const { result, rerender } = renderHook(({ sessions }) => useSessionLifecycle(sessions), {
        initialProps: { sessions: initialSessions },
      });

      // Re-render with new sessions
      const updatedSessions = [
        createMockSession({ id: 'updated-1', status: 'working', terminalSessionId: 10 }),
        createMockSession({ id: 'updated-2', status: 'idle', terminalSessionId: 11 }),
      ] as any[];

      rerender({ sessions: updatedSessions });

      await act(async () => {
        await result.current.handleStopAll();
      });

      // Should use the updated sessions, not the initial ones
      expect(mockRemoveSession).toHaveBeenCalledWith('updated-1');
      expect(mockRemoveSession).toHaveBeenCalledWith('updated-2');
      expect(mockRemoveSession).not.toHaveBeenCalledWith('initial-1');
      expect(mockKillTerminal).toHaveBeenCalledWith(10);
      expect(mockKillTerminal).toHaveBeenCalledWith(11);
      expect(mockKillTerminal).not.toHaveBeenCalledWith(1);
    });

    it('handleKillSession uses sessions from the store', async () => {
      const initialSessions = [
        createMockSession({ id: 'sess-a', terminalSessionId: 100 }),
      ] as any[];
      mockStoreSessions = initialSessions;

      const { result } = renderHook(({ sessions }) => useSessionLifecycle(sessions), {
        initialProps: { sessions: initialSessions },
      });

      // Update the store sessions (simulating a session update in the global store)
      const updatedSessions = [
        createMockSession({ id: 'sess-a', terminalSessionId: 200 }),
      ] as any[];
      mockStoreSessions = updatedSessions;

      await act(async () => {
        await result.current.handleKillSession('sess-a');
      });

      // Should use the store's terminalSessionId (200), not the original (100)
      expect(mockKillTerminal).toHaveBeenCalledWith(200);
      expect(mockKillTerminal).not.toHaveBeenCalledWith(100);
      expect(mockRemoveSession).toHaveBeenCalledWith('sess-a');
    });

    it('handlers maintain stable references across re-renders', () => {
      const sessions1 = [createMockSession()] as any[];
      const sessions2 = [createMockSession(), createMockSession()] as any[];

      const { result, rerender } = renderHook(({ sessions }) => useSessionLifecycle(sessions), {
        initialProps: { sessions: sessions1 },
      });

      const handleStopAll1 = result.current.handleStopAll;
      const handleKillSession1 = result.current.handleKillSession;

      rerender({ sessions: sessions2 });

      // useCallback with [] deps means references should be stable
      expect(result.current.handleStopAll).toBe(handleStopAll1);
      expect(result.current.handleKillSession).toBe(handleKillSession1);
    });

    it('reflects removed sessions after re-render', async () => {
      const initialSessions = [
        createMockSession({ id: 'keep', status: 'idle', terminalSessionId: 1 }),
        createMockSession({ id: 'remove', status: 'idle', terminalSessionId: 2 }),
      ] as any[];

      const { result, rerender } = renderHook(({ sessions }) => useSessionLifecycle(sessions), {
        initialProps: { sessions: initialSessions },
      });

      // Re-render with one session removed
      const reducedSessions = [
        createMockSession({ id: 'keep', status: 'idle', terminalSessionId: 1 }),
      ] as any[];

      rerender({ sessions: reducedSessions });

      await act(async () => {
        await result.current.handleStopAll();
      });

      // Only the remaining session should be processed
      expect(mockRemoveSession).toHaveBeenCalledTimes(1);
      expect(mockRemoveSession).toHaveBeenCalledWith('keep');
      expect(mockKillTerminal).toHaveBeenCalledTimes(1);
      expect(mockKillTerminal).toHaveBeenCalledWith(1);
    });
  });
});
