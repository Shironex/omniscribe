import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import { SessionStatus, MAX_CONCURRENT_SESSIONS } from '@omniscribe/shared';

// Mock the socket module
vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

import {
  useSessionStore,
  selectSessionsForProject,
  selectSession,
  selectSessionsByStatus,
  selectActiveSessions,
  selectRunningSessionCount,
  selectIsAtSessionLimit,
} from '../useSessionStore';
import type { FrontendSessionConfig } from '../useSessionStore';

function createMockSession(overrides: Partial<FrontendSessionConfig> = {}): FrontendSessionConfig {
  return {
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Session',
    workingDirectory: '/test',
    aiMode: 'claude',
    projectPath: '/test/project',
    status: 'idle',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ...overrides,
  };
}

const initialState = {
  sessions: [],
  pendingStatusUpdates: {},
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useSessionStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    useSessionStore.setState(initialState);
  });

  afterEach(() => {
    // Clean up listeners if initialized
    const state = useSessionStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  describe('initial state', () => {
    it('has empty sessions', () => {
      expect(useSessionStore.getState().sessions).toEqual([]);
    });

    it('has no pending status updates', () => {
      expect(useSessionStore.getState().pendingStatusUpdates).toEqual({});
    });

    it('is not loading', () => {
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it('has no error', () => {
      expect(useSessionStore.getState().error).toBeNull();
    });
  });

  describe('addSession', () => {
    it('adds a new session to the list', () => {
      const session = createMockSession({ id: 'sess-1' });
      useSessionStore.getState().addSession(session);

      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().sessions[0].id).toBe('sess-1');
    });

    it('does not add a duplicate session', () => {
      const session = createMockSession({ id: 'sess-1' });
      useSessionStore.getState().addSession(session);
      useSessionStore.getState().addSession(session);

      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });

    it('triggers processPendingUpdates asynchronously', async () => {
      vi.useFakeTimers();

      // Set up a pending status update for the session
      useSessionStore.setState({
        pendingStatusUpdates: {
          'sess-1': [{ sessionId: 'sess-1', status: 'working' as SessionStatus }],
        },
      });

      const session = createMockSession({ id: 'sess-1', status: 'idle' });
      useSessionStore.getState().addSession(session);

      // The setTimeout(0) should fire processPendingUpdates
      vi.advanceTimersByTime(0);

      const state = useSessionStore.getState();
      const updated = state.sessions.find(s => s.id === 'sess-1');
      expect(updated?.status).toBe('working');

      vi.useRealTimers();
    });
  });

  describe('removeSession', () => {
    it('removes a session by ID', () => {
      const session = createMockSession({ id: 'sess-1' });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().removeSession('sess-1');
      expect(useSessionStore.getState().sessions).toHaveLength(0);
    });

    it('clears pending status updates for the removed session', () => {
      useSessionStore.setState({
        sessions: [createMockSession({ id: 'sess-1' })],
        pendingStatusUpdates: {
          'sess-1': [{ sessionId: 'sess-1', status: 'working' as SessionStatus }],
          'sess-2': [{ sessionId: 'sess-2', status: 'idle' as SessionStatus }],
        },
      });

      useSessionStore.getState().removeSession('sess-1');

      const pending = useSessionStore.getState().pendingStatusUpdates;
      expect(pending['sess-1']).toBeUndefined();
      expect(pending['sess-2']).toBeDefined();
    });

    it('does nothing for a non-existent session', () => {
      const session = createMockSession({ id: 'sess-1' });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().removeSession('non-existent');
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });
  });

  describe('updateSession', () => {
    it('updates an existing session with partial data', () => {
      const session = createMockSession({ id: 'sess-1', name: 'Old Name' });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().updateSession('sess-1', { name: 'New Name' });

      const updated = useSessionStore.getState().sessions[0];
      expect(updated.name).toBe('New Name');
    });

    it('updates lastActiveAt on change', () => {
      const oldDate = new Date(2020, 0, 1);
      const session = createMockSession({ id: 'sess-1', lastActiveAt: oldDate });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().updateSession('sess-1', { name: 'Updated' });

      const updated = useSessionStore.getState().sessions[0];
      expect(updated.lastActiveAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('does not affect other sessions', () => {
      const sess1 = createMockSession({ id: 'sess-1', name: 'Session 1' });
      const sess2 = createMockSession({ id: 'sess-2', name: 'Session 2' });
      useSessionStore.setState({ sessions: [sess1, sess2] });

      useSessionStore.getState().updateSession('sess-1', { name: 'Updated' });

      expect(useSessionStore.getState().sessions[1].name).toBe('Session 2');
    });
  });

  describe('updateStatus', () => {
    it('updates status for an existing session', () => {
      const session = createMockSession({ id: 'sess-1', status: 'idle' });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().updateStatus('sess-1', 'working', 'Processing...');

      const updated = useSessionStore.getState().sessions[0];
      expect(updated.status).toBe('working');
      expect(updated.statusMessage).toBe('Processing...');
    });

    it('buffers status update for non-existent session', () => {
      useSessionStore.getState().updateStatus('unknown-sess', 'working', 'Buffered');

      const pending = useSessionStore.getState().pendingStatusUpdates;
      expect(pending['unknown-sess']).toHaveLength(1);
      expect(pending['unknown-sess'][0].status).toBe('working');
    });

    it('appends to existing pending updates', () => {
      useSessionStore.setState({
        pendingStatusUpdates: {
          'sess-1': [{ sessionId: 'sess-1', status: 'connecting' as SessionStatus }],
        },
      });

      useSessionStore.getState().updateStatus('sess-1', 'working');

      const pending = useSessionStore.getState().pendingStatusUpdates['sess-1'];
      expect(pending).toHaveLength(2);
    });

    it('preserves existing statusMessage when no new message provided', () => {
      const session = createMockSession({
        id: 'sess-1',
        status: 'idle',
        statusMessage: 'Old message',
      });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().updateStatus('sess-1', 'working');

      const updated = useSessionStore.getState().sessions[0];
      expect(updated.statusMessage).toBe('Old message');
    });

    it('sets needsInputPrompt flag', () => {
      const session = createMockSession({ id: 'sess-1' });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().updateStatus('sess-1', 'needs_input', 'Enter value', true);

      const updated = useSessionStore.getState().sessions[0];
      expect(updated.needsInputPrompt).toBe(true);
    });
  });

  describe('setSessions', () => {
    it('replaces the sessions list entirely', () => {
      const old = createMockSession({ id: 'old' });
      useSessionStore.setState({ sessions: [old] });

      const newSessions = [createMockSession({ id: 'new-1' }), createMockSession({ id: 'new-2' })];
      useSessionStore.getState().setSessions(newSessions);

      expect(useSessionStore.getState().sessions).toHaveLength(2);
      expect(useSessionStore.getState().sessions[0].id).toBe('new-1');
    });
  });

  describe('processPendingUpdates', () => {
    it('applies buffered updates in order', () => {
      const session = createMockSession({ id: 'sess-1', status: 'idle' });
      useSessionStore.setState({
        sessions: [session],
        pendingStatusUpdates: {
          'sess-1': [
            { sessionId: 'sess-1', status: 'connecting' as SessionStatus },
            { sessionId: 'sess-1', status: 'working' as SessionStatus, message: 'Final' },
          ],
        },
      });

      useSessionStore.getState().processPendingUpdates('sess-1');

      const updated = useSessionStore.getState().sessions[0];
      expect(updated.status).toBe('working');
      expect(updated.statusMessage).toBe('Final');
    });

    it('clears pending updates after processing', () => {
      const session = createMockSession({ id: 'sess-1' });
      useSessionStore.setState({
        sessions: [session],
        pendingStatusUpdates: {
          'sess-1': [{ sessionId: 'sess-1', status: 'working' as SessionStatus }],
        },
      });

      useSessionStore.getState().processPendingUpdates('sess-1');

      expect(useSessionStore.getState().pendingStatusUpdates['sess-1']).toBeUndefined();
    });

    it('does nothing when there are no pending updates', () => {
      const session = createMockSession({ id: 'sess-1', status: 'idle' });
      useSessionStore.setState({ sessions: [session] });

      useSessionStore.getState().processPendingUpdates('sess-1');

      expect(useSessionStore.getState().sessions[0].status).toBe('idle');
    });
  });

  describe('selectors', () => {
    describe('selectSessionsForProject', () => {
      it('returns sessions matching the project path', () => {
        const sessions = [
          createMockSession({ id: 's1', projectPath: '/project-a' }),
          createMockSession({ id: 's2', projectPath: '/project-b' }),
          createMockSession({ id: 's3', projectPath: '/project-a' }),
        ];
        useSessionStore.setState({ sessions });

        const selector = selectSessionsForProject('/project-a');
        const result = selector(useSessionStore.getState());
        expect(result).toHaveLength(2);
        expect(result.map(s => s.id)).toEqual(['s1', 's3']);
      });
    });

    describe('selectSession', () => {
      it('returns the session matching the ID', () => {
        const sessions = [createMockSession({ id: 's1' }), createMockSession({ id: 's2' })];
        useSessionStore.setState({ sessions });

        const result = selectSession('s2')(useSessionStore.getState());
        expect(result?.id).toBe('s2');
      });

      it('returns undefined for non-existent ID', () => {
        const result = selectSession('nope')(useSessionStore.getState());
        expect(result).toBeUndefined();
      });
    });

    describe('selectSessionsByStatus', () => {
      it('returns sessions matching the given status', () => {
        const sessions = [
          createMockSession({ id: 's1', status: 'idle' }),
          createMockSession({ id: 's2', status: 'working' }),
          createMockSession({ id: 's3', status: 'idle' }),
        ];
        useSessionStore.setState({ sessions });

        const result = selectSessionsByStatus('idle')(useSessionStore.getState());
        expect(result).toHaveLength(2);
      });
    });

    describe('selectActiveSessions', () => {
      it('excludes idle and disconnected sessions', () => {
        const sessions = [
          createMockSession({ id: 's1', status: 'idle' }),
          createMockSession({ id: 's2', status: 'working' }),
          createMockSession({ id: 's3', status: 'disconnected' }),
          createMockSession({ id: 's4', status: 'needs_input' }),
        ];
        useSessionStore.setState({ sessions });

        const result = selectActiveSessions(useSessionStore.getState());
        expect(result).toHaveLength(2);
        expect(result.map(s => s.id)).toEqual(['s2', 's4']);
      });
    });

    describe('selectRunningSessionCount', () => {
      it('counts only sessions with terminalSessionId', () => {
        const sessions = [
          createMockSession({ id: 's1', terminalSessionId: 1 }),
          createMockSession({ id: 's2' }), // no terminal
          createMockSession({ id: 's3', terminalSessionId: 3 }),
        ];
        useSessionStore.setState({ sessions });

        expect(selectRunningSessionCount(useSessionStore.getState())).toBe(2);
      });

      it('returns 0 when no sessions have terminals', () => {
        const sessions = [createMockSession({ id: 's1' })];
        useSessionStore.setState({ sessions });

        expect(selectRunningSessionCount(useSessionStore.getState())).toBe(0);
      });
    });

    describe('selectIsAtSessionLimit', () => {
      it('returns false when under the limit', () => {
        const sessions = [createMockSession({ id: 's1', terminalSessionId: 1 })];
        useSessionStore.setState({ sessions });

        expect(selectIsAtSessionLimit(useSessionStore.getState())).toBe(false);
      });

      it('returns true when at the limit', () => {
        const sessions = Array.from({ length: MAX_CONCURRENT_SESSIONS }, (_, i) =>
          createMockSession({ id: `s${i}`, terminalSessionId: i })
        );
        useSessionStore.setState({ sessions });

        expect(selectIsAtSessionLimit(useSessionStore.getState())).toBe(true);
      });

      it('returns true when over the limit', () => {
        const sessions = Array.from({ length: MAX_CONCURRENT_SESSIONS + 1 }, (_, i) =>
          createMockSession({ id: `s${i}`, terminalSessionId: i })
        );
        useSessionStore.setState({ sessions });

        expect(selectIsAtSessionLimit(useSessionStore.getState())).toBe(true);
      });
    });
  });
});
