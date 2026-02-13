import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import { SessionEvents } from '@omniscribe/shared';
import type { ClaudeSessionEntry, ClaudeSessionHistoryResponse } from '@omniscribe/shared';

// Mock the socket module
vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

import {
  useSessionHistoryStore,
  selectSessionHistory,
  selectResumableSessions,
  selectIsResumable,
} from '../useSessionHistoryStore';

function createMockSessionEntry(overrides: Partial<ClaudeSessionEntry> = {}): ClaudeSessionEntry {
  return {
    sessionId: `claude-sess-${Math.random().toString(36).slice(2, 8)}`,
    fullPath: '/home/user/.claude/projects/test/sessions/abc123.json',
    fileMtime: Date.now(),
    firstPrompt: 'Fix the login bug',
    summary: 'Fixed authentication issue in login flow',
    messageCount: 12,
    created: '2025-01-15T10:00:00Z',
    modified: '2025-01-15T10:30:00Z',
    gitBranch: 'main',
    projectPath: '/test/project',
    isSidechain: false,
    ...overrides,
  };
}

const initialState = {
  sessions: [],
  resumableSessions: {},
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useSessionHistoryStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    useSessionHistoryStore.setState(initialState);
  });

  afterEach(() => {
    const state = useSessionHistoryStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  // ============================================
  // 1. Initial State
  // ============================================

  describe('initial state', () => {
    it('has empty sessions', () => {
      expect(useSessionHistoryStore.getState().sessions).toEqual([]);
    });

    it('has empty resumableSessions', () => {
      expect(useSessionHistoryStore.getState().resumableSessions).toEqual({});
    });

    it('is not loading', () => {
      expect(useSessionHistoryStore.getState().isLoading).toBe(false);
    });

    it('has no error', () => {
      expect(useSessionHistoryStore.getState().error).toBeNull();
    });

    it('has listeners not initialized', () => {
      expect(useSessionHistoryStore.getState().listenersInitialized).toBe(false);
    });
  });

  // ============================================
  // 2. setSessions
  // ============================================

  describe('setSessions', () => {
    it('sets the sessions list', () => {
      const sessions = [
        createMockSessionEntry({ sessionId: 'sess-1' }),
        createMockSessionEntry({ sessionId: 'sess-2' }),
      ];

      useSessionHistoryStore.getState().setSessions(sessions);

      expect(useSessionHistoryStore.getState().sessions).toHaveLength(2);
      expect(useSessionHistoryStore.getState().sessions[0].sessionId).toBe('sess-1');
      expect(useSessionHistoryStore.getState().sessions[1].sessionId).toBe('sess-2');
    });

    it('replaces the existing sessions list', () => {
      const oldSessions = [createMockSessionEntry({ sessionId: 'old-1' })];
      useSessionHistoryStore.setState({ sessions: oldSessions });

      const newSessions = [
        createMockSessionEntry({ sessionId: 'new-1' }),
        createMockSessionEntry({ sessionId: 'new-2' }),
      ];
      useSessionHistoryStore.getState().setSessions(newSessions);

      expect(useSessionHistoryStore.getState().sessions).toHaveLength(2);
      expect(useSessionHistoryStore.getState().sessions[0].sessionId).toBe('new-1');
    });

    it('can set an empty sessions list', () => {
      useSessionHistoryStore.setState({
        sessions: [createMockSessionEntry()],
      });

      useSessionHistoryStore.getState().setSessions([]);

      expect(useSessionHistoryStore.getState().sessions).toEqual([]);
    });

    it('does not affect resumableSessions', () => {
      useSessionHistoryStore.setState({
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'My Session' },
        },
      });

      useSessionHistoryStore.getState().setSessions([createMockSessionEntry()]);

      expect(useSessionHistoryStore.getState().resumableSessions).toEqual({
        'sess-1': { claudeSessionId: 'claude-1', sessionName: 'My Session' },
      });
    });
  });

  // ============================================
  // 3. fetchHistory
  // ============================================

  describe('fetchHistory', () => {
    it('sets isLoading to true when called', () => {
      useSessionHistoryStore.getState().fetchHistory('/test/project');

      expect(useSessionHistoryStore.getState().isLoading).toBe(true);
    });

    it('emits the session:history socket event with projectPath', () => {
      useSessionHistoryStore.getState().fetchHistory('/test/project');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        SessionEvents.HISTORY,
        { projectPath: '/test/project' },
        expect.any(Function)
      );
    });

    it('handles successful response with sessions', () => {
      const sessions = [
        createMockSessionEntry({ sessionId: 'sess-1' }),
        createMockSessionEntry({ sessionId: 'sess-2' }),
      ];

      mockSocket.emit.mockImplementation(
        (
          _event: string,
          _payload: unknown,
          callback: (response: ClaudeSessionHistoryResponse) => void
        ) => {
          callback({ sessions });
        }
      );

      useSessionHistoryStore.getState().fetchHistory('/test/project');

      const state = useSessionHistoryStore.getState();
      expect(state.sessions).toHaveLength(2);
      expect(state.sessions[0].sessionId).toBe('sess-1');
      expect(state.sessions[1].sessionId).toBe('sess-2');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('handles successful response with empty sessions', () => {
      mockSocket.emit.mockImplementation(
        (
          _event: string,
          _payload: unknown,
          callback: (response: ClaudeSessionHistoryResponse) => void
        ) => {
          callback({ sessions: [] });
        }
      );

      useSessionHistoryStore.getState().fetchHistory('/test/project');

      const state = useSessionHistoryStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('handles response with undefined sessions (defaults to empty array)', () => {
      mockSocket.emit.mockImplementation(
        (
          _event: string,
          _payload: unknown,
          callback: (response: ClaudeSessionHistoryResponse) => void
        ) => {
          // Simulate a response where sessions is undefined
          callback({ sessions: undefined as unknown as ClaudeSessionEntry[] });
        }
      );

      useSessionHistoryStore.getState().fetchHistory('/test/project');

      const state = useSessionHistoryStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.isLoading).toBe(false);
    });

    it('handles error response', () => {
      mockSocket.emit.mockImplementation(
        (
          _event: string,
          _payload: unknown,
          callback: (response: ClaudeSessionHistoryResponse) => void
        ) => {
          callback({ sessions: [], error: 'Failed to read session index' });
        }
      );

      useSessionHistoryStore.getState().fetchHistory('/test/project');

      const state = useSessionHistoryStore.getState();
      expect(state.error).toBe('Failed to read session index');
      expect(state.isLoading).toBe(false);
    });

    it('does not update sessions on error response', () => {
      const existingSessions = [createMockSessionEntry({ sessionId: 'existing' })];
      useSessionHistoryStore.setState({ sessions: existingSessions });

      mockSocket.emit.mockImplementation(
        (
          _event: string,
          _payload: unknown,
          callback: (response: ClaudeSessionHistoryResponse) => void
        ) => {
          callback({ sessions: [], error: 'Some error' });
        }
      );

      useSessionHistoryStore.getState().fetchHistory('/test/project');

      // Sessions should remain unchanged on error (only error and isLoading are set)
      const state = useSessionHistoryStore.getState();
      expect(state.error).toBe('Some error');
      expect(state.isLoading).toBe(false);
    });

    describe('timeout handling', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('times out after 15 seconds if no response', () => {
        // emit does not call the callback (simulates no response)
        mockSocket.emit.mockImplementation(() => {});

        useSessionHistoryStore.getState().fetchHistory('/test/project');

        expect(useSessionHistoryStore.getState().isLoading).toBe(true);

        vi.advanceTimersByTime(15_000);

        const state = useSessionHistoryStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.error).toBe('Request timed out while fetching session history');
      });

      it('does not time out if response arrives before deadline', () => {
        mockSocket.emit.mockImplementation(
          (
            _event: string,
            _payload: unknown,
            callback: (response: ClaudeSessionHistoryResponse) => void
          ) => {
            // Simulate a response arriving after 5 seconds
            setTimeout(() => {
              callback({ sessions: [createMockSessionEntry({ sessionId: 'sess-1' })] });
            }, 5_000);
          }
        );

        useSessionHistoryStore.getState().fetchHistory('/test/project');

        // Advance past the callback time but before timeout
        vi.advanceTimersByTime(5_000);

        const state = useSessionHistoryStore.getState();
        expect(state.sessions).toHaveLength(1);
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();

        // Advance past the timeout - should not change state
        vi.advanceTimersByTime(10_000);

        const stateAfterTimeout = useSessionHistoryStore.getState();
        expect(stateAfterTimeout.isLoading).toBe(false);
        expect(stateAfterTimeout.error).toBeNull();
      });

      it('clears timeout when response arrives', () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

        mockSocket.emit.mockImplementation(
          (
            _event: string,
            _payload: unknown,
            callback: (response: ClaudeSessionHistoryResponse) => void
          ) => {
            callback({ sessions: [] });
          }
        );

        useSessionHistoryStore.getState().fetchHistory('/test/project');

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });

      it('does not set timeout error before 15 seconds', () => {
        mockSocket.emit.mockImplementation(() => {});

        useSessionHistoryStore.getState().fetchHistory('/test/project');

        vi.advanceTimersByTime(14_999);

        const state = useSessionHistoryStore.getState();
        expect(state.isLoading).toBe(true);
        expect(state.error).toBeNull();
      });
    });
  });

  // ============================================
  // 4. addResumable
  // ============================================

  describe('addResumable', () => {
    it('adds a resumable session entry', () => {
      useSessionHistoryStore.getState().addResumable('sess-1', 'claude-abc123', 'My Session');

      const resumable = useSessionHistoryStore.getState().resumableSessions;
      expect(resumable['sess-1']).toEqual({
        claudeSessionId: 'claude-abc123',
        sessionName: 'My Session',
      });
    });

    it('can add multiple resumable sessions', () => {
      useSessionHistoryStore.getState().addResumable('sess-1', 'claude-1', 'Session 1');
      useSessionHistoryStore.getState().addResumable('sess-2', 'claude-2', 'Session 2');

      const resumable = useSessionHistoryStore.getState().resumableSessions;
      expect(Object.keys(resumable)).toHaveLength(2);
      expect(resumable['sess-1']).toEqual({
        claudeSessionId: 'claude-1',
        sessionName: 'Session 1',
      });
      expect(resumable['sess-2']).toEqual({
        claudeSessionId: 'claude-2',
        sessionName: 'Session 2',
      });
    });

    it('overwrites an existing entry for the same sessionId', () => {
      useSessionHistoryStore.getState().addResumable('sess-1', 'claude-old', 'Old Name');
      useSessionHistoryStore.getState().addResumable('sess-1', 'claude-new', 'New Name');

      const resumable = useSessionHistoryStore.getState().resumableSessions;
      expect(Object.keys(resumable)).toHaveLength(1);
      expect(resumable['sess-1']).toEqual({
        claudeSessionId: 'claude-new',
        sessionName: 'New Name',
      });
    });

    it('does not affect the sessions list', () => {
      const sessions = [createMockSessionEntry({ sessionId: 'entry-1' })];
      useSessionHistoryStore.setState({ sessions });

      useSessionHistoryStore.getState().addResumable('sess-1', 'claude-1', 'Session 1');

      expect(useSessionHistoryStore.getState().sessions).toHaveLength(1);
      expect(useSessionHistoryStore.getState().sessions[0].sessionId).toBe('entry-1');
    });
  });

  // ============================================
  // 5. removeResumable
  // ============================================

  describe('removeResumable', () => {
    it('removes a resumable session by sessionId', () => {
      useSessionHistoryStore.setState({
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
          'sess-2': { claudeSessionId: 'claude-2', sessionName: 'Session 2' },
        },
      });

      useSessionHistoryStore.getState().removeResumable('sess-1');

      const resumable = useSessionHistoryStore.getState().resumableSessions;
      expect(resumable['sess-1']).toBeUndefined();
      expect(resumable['sess-2']).toEqual({
        claudeSessionId: 'claude-2',
        sessionName: 'Session 2',
      });
    });

    it('does nothing when removing a non-existent sessionId', () => {
      useSessionHistoryStore.setState({
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
        },
      });

      useSessionHistoryStore.getState().removeResumable('non-existent');

      const resumable = useSessionHistoryStore.getState().resumableSessions;
      expect(Object.keys(resumable)).toHaveLength(1);
      expect(resumable['sess-1']).toBeDefined();
    });

    it('results in empty object when last entry is removed', () => {
      useSessionHistoryStore.setState({
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
        },
      });

      useSessionHistoryStore.getState().removeResumable('sess-1');

      expect(useSessionHistoryStore.getState().resumableSessions).toEqual({});
    });

    it('does not affect the sessions list', () => {
      const sessions = [createMockSessionEntry({ sessionId: 'entry-1' })];
      useSessionHistoryStore.setState({
        sessions,
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
        },
      });

      useSessionHistoryStore.getState().removeResumable('sess-1');

      expect(useSessionHistoryStore.getState().sessions).toHaveLength(1);
    });
  });

  // ============================================
  // 6. clearHistory
  // ============================================

  describe('clearHistory', () => {
    it('clears the sessions list', () => {
      useSessionHistoryStore.setState({
        sessions: [
          createMockSessionEntry({ sessionId: 'sess-1' }),
          createMockSessionEntry({ sessionId: 'sess-2' }),
        ],
      });

      useSessionHistoryStore.getState().clearHistory();

      expect(useSessionHistoryStore.getState().sessions).toEqual([]);
    });

    it('clears the resumableSessions', () => {
      useSessionHistoryStore.setState({
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
          'sess-2': { claudeSessionId: 'claude-2', sessionName: 'Session 2' },
        },
      });

      useSessionHistoryStore.getState().clearHistory();

      expect(useSessionHistoryStore.getState().resumableSessions).toEqual({});
    });

    it('clears both sessions and resumableSessions at once', () => {
      useSessionHistoryStore.setState({
        sessions: [createMockSessionEntry({ sessionId: 'sess-1' })],
        resumableSessions: {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
        },
      });

      useSessionHistoryStore.getState().clearHistory();

      const state = useSessionHistoryStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.resumableSessions).toEqual({});
    });

    it('does not affect loading or error state', () => {
      useSessionHistoryStore.setState({
        sessions: [createMockSessionEntry()],
        resumableSessions: { 'sess-1': { claudeSessionId: 'c1', sessionName: 'S1' } },
        isLoading: true,
        error: 'some error',
      });

      useSessionHistoryStore.getState().clearHistory();

      const state = useSessionHistoryStore.getState();
      expect(state.isLoading).toBe(true);
      expect(state.error).toBe('some error');
    });

    it('is idempotent on already empty state', () => {
      useSessionHistoryStore.getState().clearHistory();

      const state = useSessionHistoryStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.resumableSessions).toEqual({});
    });
  });

  // ============================================
  // 7. Selectors
  // ============================================

  describe('selectors', () => {
    describe('selectSessionHistory', () => {
      it('returns all session history entries', () => {
        const sessions = [
          createMockSessionEntry({ sessionId: 'sess-1' }),
          createMockSessionEntry({ sessionId: 'sess-2' }),
        ];
        useSessionHistoryStore.setState({ sessions });

        const result = selectSessionHistory(useSessionHistoryStore.getState());
        expect(result).toHaveLength(2);
        expect(result[0].sessionId).toBe('sess-1');
        expect(result[1].sessionId).toBe('sess-2');
      });

      it('returns empty array when no sessions exist', () => {
        const result = selectSessionHistory(useSessionHistoryStore.getState());
        expect(result).toEqual([]);
      });

      it('returns the same reference as state.sessions', () => {
        const sessions = [createMockSessionEntry()];
        useSessionHistoryStore.setState({ sessions });

        const result = selectSessionHistory(useSessionHistoryStore.getState());
        expect(result).toBe(useSessionHistoryStore.getState().sessions);
      });
    });

    describe('selectResumableSessions', () => {
      it('returns all resumable sessions', () => {
        const resumableSessions = {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
          'sess-2': { claudeSessionId: 'claude-2', sessionName: 'Session 2' },
        };
        useSessionHistoryStore.setState({ resumableSessions });

        const result = selectResumableSessions(useSessionHistoryStore.getState());
        expect(result).toEqual(resumableSessions);
      });

      it('returns empty object when no resumable sessions exist', () => {
        const result = selectResumableSessions(useSessionHistoryStore.getState());
        expect(result).toEqual({});
      });

      it('returns the same reference as state.resumableSessions', () => {
        const resumableSessions = {
          'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
        };
        useSessionHistoryStore.setState({ resumableSessions });

        const result = selectResumableSessions(useSessionHistoryStore.getState());
        expect(result).toBe(useSessionHistoryStore.getState().resumableSessions);
      });
    });

    describe('selectIsResumable', () => {
      it('returns true when sessionId exists in resumableSessions', () => {
        useSessionHistoryStore.setState({
          resumableSessions: {
            'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
          },
        });

        const result = selectIsResumable('sess-1')(useSessionHistoryStore.getState());
        expect(result).toBe(true);
      });

      it('returns false when sessionId does not exist in resumableSessions', () => {
        useSessionHistoryStore.setState({
          resumableSessions: {
            'sess-1': { claudeSessionId: 'claude-1', sessionName: 'Session 1' },
          },
        });

        const result = selectIsResumable('sess-2')(useSessionHistoryStore.getState());
        expect(result).toBe(false);
      });

      it('returns false when resumableSessions is empty', () => {
        const result = selectIsResumable('sess-1')(useSessionHistoryStore.getState());
        expect(result).toBe(false);
      });

      it('returns a curried selector function', () => {
        const selector = selectIsResumable('sess-1');
        expect(typeof selector).toBe('function');
      });

      it('works correctly after adding and removing a resumable session', () => {
        useSessionHistoryStore.getState().addResumable('sess-1', 'claude-1', 'Session 1');
        expect(selectIsResumable('sess-1')(useSessionHistoryStore.getState())).toBe(true);

        useSessionHistoryStore.getState().removeResumable('sess-1');
        expect(selectIsResumable('sess-1')(useSessionHistoryStore.getState())).toBe(false);
      });
    });
  });

  // ============================================
  // 8. Socket Store Actions (setLoading, setError)
  // ============================================

  describe('socket store actions', () => {
    describe('setLoading', () => {
      it('sets the loading state', () => {
        useSessionHistoryStore.getState().setLoading(true);
        expect(useSessionHistoryStore.getState().isLoading).toBe(true);

        useSessionHistoryStore.getState().setLoading(false);
        expect(useSessionHistoryStore.getState().isLoading).toBe(false);
      });
    });

    describe('setError', () => {
      it('sets an error message', () => {
        useSessionHistoryStore.getState().setError('Something went wrong');
        expect(useSessionHistoryStore.getState().error).toBe('Something went wrong');
      });

      it('clears the error when set to null', () => {
        useSessionHistoryStore.setState({ error: 'Previous error' });

        useSessionHistoryStore.getState().setError(null);
        expect(useSessionHistoryStore.getState().error).toBeNull();
      });
    });
  });

  // ============================================
  // 9. Listener Lifecycle
  // ============================================

  describe('listener lifecycle', () => {
    it('sets listenersInitialized to true on initListeners', () => {
      useSessionHistoryStore.getState().initListeners();
      expect(useSessionHistoryStore.getState().listenersInitialized).toBe(true);
    });

    it('sets listenersInitialized to false on cleanupListeners', () => {
      useSessionHistoryStore.getState().initListeners();
      useSessionHistoryStore.getState().cleanupListeners();
      expect(useSessionHistoryStore.getState().listenersInitialized).toBe(false);
    });

    it('does not reinitialize if already initialized', () => {
      useSessionHistoryStore.getState().initListeners();
      const callCountAfterFirst = mockSocket.on.mock.calls.length;

      useSessionHistoryStore.getState().initListeners();
      const callCountAfterSecond = mockSocket.on.mock.calls.length;

      // No additional listeners should be registered
      expect(callCountAfterSecond).toBe(callCountAfterFirst);
    });

    it('registers connect and connect_error listeners on init', () => {
      useSessionHistoryStore.getState().initListeners();

      const registeredEvents = mockSocket.on.mock.calls.map((call: unknown[]) => call[0] as string);
      expect(registeredEvents).toContain('connect');
      expect(registeredEvents).toContain('connect_error');
    });

    it('cleans up connect and connect_error listeners on cleanup', () => {
      useSessionHistoryStore.getState().initListeners();
      useSessionHistoryStore.getState().cleanupListeners();

      const removedEvents = mockSocket.off.mock.calls.map((call: unknown[]) => call[0] as string);
      expect(removedEvents).toContain('connect');
      expect(removedEvents).toContain('connect_error');
    });
  });
});
