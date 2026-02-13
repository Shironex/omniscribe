import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import type { TaskItem } from '@omniscribe/shared';

// Mock the socket module
vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

import {
  useTaskStore,
  selectTasksForSession,
  selectTaskCountForSession,
  selectHasInProgressTasks,
} from '../useTaskStore';

function createMockTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'Test task',
    status: 'pending',
    ...overrides,
  };
}

const initialState = {
  tasksBySession: {},
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useTaskStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    useTaskStore.setState(initialState);
  });

  afterEach(() => {
    const state = useTaskStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  // ============================================
  // Initial State
  // ============================================

  describe('initial state', () => {
    it('has empty tasksBySession', () => {
      expect(useTaskStore.getState().tasksBySession).toEqual({});
    });

    it('is not loading', () => {
      expect(useTaskStore.getState().isLoading).toBe(false);
    });

    it('has no error', () => {
      expect(useTaskStore.getState().error).toBeNull();
    });

    it('has listeners not initialized', () => {
      expect(useTaskStore.getState().listenersInitialized).toBe(false);
    });
  });

  // ============================================
  // setTasks
  // ============================================

  describe('setTasks', () => {
    it('sets tasks for a session', () => {
      const tasks = [createMockTask({ id: 't1' }), createMockTask({ id: 't2' })];
      useTaskStore.getState().setTasks('sess-1', tasks);

      expect(useTaskStore.getState().tasksBySession['sess-1']).toHaveLength(2);
      expect(useTaskStore.getState().tasksBySession['sess-1'][0].id).toBe('t1');
      expect(useTaskStore.getState().tasksBySession['sess-1'][1].id).toBe('t2');
    });

    it('replaces existing tasks for a session (snapshot replacement)', () => {
      const oldTasks = [createMockTask({ id: 't1', subject: 'Old task' })];
      useTaskStore.getState().setTasks('sess-1', oldTasks);

      const newTasks = [createMockTask({ id: 't2', subject: 'New task' })];
      useTaskStore.getState().setTasks('sess-1', newTasks);

      const stored = useTaskStore.getState().tasksBySession['sess-1'];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('t2');
      expect(stored[0].subject).toBe('New task');
    });

    it('does not affect tasks for other sessions', () => {
      const tasks1 = [createMockTask({ id: 't1' })];
      const tasks2 = [createMockTask({ id: 't2' })];
      useTaskStore.getState().setTasks('sess-1', tasks1);
      useTaskStore.getState().setTasks('sess-2', tasks2);

      useTaskStore.getState().setTasks('sess-1', [createMockTask({ id: 't3' })]);

      expect(useTaskStore.getState().tasksBySession['sess-2']).toHaveLength(1);
      expect(useTaskStore.getState().tasksBySession['sess-2'][0].id).toBe('t2');
    });

    it('can set an empty task list for a session', () => {
      useTaskStore.getState().setTasks('sess-1', [createMockTask({ id: 't1' })]);
      useTaskStore.getState().setTasks('sess-1', []);

      expect(useTaskStore.getState().tasksBySession['sess-1']).toEqual([]);
    });

    it('handles setting tasks for multiple sessions', () => {
      useTaskStore.getState().setTasks('sess-1', [createMockTask({ id: 't1' })]);
      useTaskStore.getState().setTasks('sess-2', [createMockTask({ id: 't2' })]);
      useTaskStore.getState().setTasks('sess-3', [createMockTask({ id: 't3' })]);

      const state = useTaskStore.getState().tasksBySession;
      expect(Object.keys(state)).toHaveLength(3);
      expect(state['sess-1'][0].id).toBe('t1');
      expect(state['sess-2'][0].id).toBe('t2');
      expect(state['sess-3'][0].id).toBe('t3');
    });
  });

  // ============================================
  // clearTasks
  // ============================================

  describe('clearTasks', () => {
    it('removes tasks for a session', () => {
      useTaskStore.getState().setTasks('sess-1', [createMockTask()]);
      useTaskStore.getState().clearTasks('sess-1');

      expect(useTaskStore.getState().tasksBySession['sess-1']).toBeUndefined();
    });

    it('does not affect tasks for other sessions', () => {
      useTaskStore.getState().setTasks('sess-1', [createMockTask({ id: 't1' })]);
      useTaskStore.getState().setTasks('sess-2', [createMockTask({ id: 't2' })]);

      useTaskStore.getState().clearTasks('sess-1');

      expect(useTaskStore.getState().tasksBySession['sess-1']).toBeUndefined();
      expect(useTaskStore.getState().tasksBySession['sess-2']).toHaveLength(1);
      expect(useTaskStore.getState().tasksBySession['sess-2'][0].id).toBe('t2');
    });

    it('is safe to call for a non-existent session', () => {
      useTaskStore.getState().setTasks('sess-1', [createMockTask()]);

      expect(() => useTaskStore.getState().clearTasks('non-existent')).not.toThrow();
      expect(useTaskStore.getState().tasksBySession['sess-1']).toHaveLength(1);
    });

    it('is safe to call when tasksBySession is empty', () => {
      expect(() => useTaskStore.getState().clearTasks('sess-1')).not.toThrow();
      expect(useTaskStore.getState().tasksBySession).toEqual({});
    });

    it('completely removes the key from tasksBySession', () => {
      useTaskStore.getState().setTasks('sess-1', [createMockTask()]);
      useTaskStore.getState().clearTasks('sess-1');

      expect('sess-1' in useTaskStore.getState().tasksBySession).toBe(false);
    });
  });

  // ============================================
  // Common Socket Actions (setLoading, setError)
  // ============================================

  describe('setLoading', () => {
    it('sets loading to true', () => {
      useTaskStore.getState().setLoading(true);
      expect(useTaskStore.getState().isLoading).toBe(true);
    });

    it('sets loading to false', () => {
      useTaskStore.setState({ isLoading: true });
      useTaskStore.getState().setLoading(false);
      expect(useTaskStore.getState().isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets an error message', () => {
      useTaskStore.getState().setError('Something went wrong');
      expect(useTaskStore.getState().error).toBe('Something went wrong');
    });

    it('clears error when set to null', () => {
      useTaskStore.setState({ error: 'Old error' });
      useTaskStore.getState().setError(null);
      expect(useTaskStore.getState().error).toBeNull();
    });
  });

  // ============================================
  // Socket Listeners
  // ============================================

  describe('initListeners', () => {
    it('registers socket event listeners', () => {
      useTaskStore.getState().initListeners();

      const onCalls = mockSocket.on.mock.calls.map(([event]: [string, ...unknown[]]) => event);
      expect(onCalls).toContain('session:tasks');
      expect(onCalls).toContain('session:removed');
      expect(onCalls).toContain('connect');
      expect(onCalls).toContain('connect_error');
    });

    it('sets listenersInitialized to true', () => {
      useTaskStore.getState().initListeners();
      expect(useTaskStore.getState().listenersInitialized).toBe(true);
    });

    it('is idempotent - calling twice does not double-register', () => {
      useTaskStore.getState().initListeners();
      const firstCallCount = mockSocket.on.mock.calls.length;

      useTaskStore.getState().initListeners();
      expect(mockSocket.on.mock.calls.length).toBe(firstCallCount);
    });

    it('does not register duplicate listeners for session:tasks', () => {
      useTaskStore.getState().initListeners();
      expect(mockSocket.__listenerCount('session:tasks')).toBe(1);

      useTaskStore.getState().initListeners();
      expect(mockSocket.__listenerCount('session:tasks')).toBe(1);
    });
  });

  describe('cleanupListeners', () => {
    it('removes all registered listeners', () => {
      useTaskStore.getState().initListeners();
      useTaskStore.getState().cleanupListeners();

      const offCalls = mockSocket.off.mock.calls.map(([event]: [string, ...unknown[]]) => event);
      expect(offCalls).toContain('session:tasks');
      expect(offCalls).toContain('session:removed');
      expect(offCalls).toContain('connect');
      expect(offCalls).toContain('connect_error');
    });

    it('sets listenersInitialized to false', () => {
      useTaskStore.getState().initListeners();
      useTaskStore.getState().cleanupListeners();
      expect(useTaskStore.getState().listenersInitialized).toBe(false);
    });

    it('allows re-initialization after cleanup', () => {
      useTaskStore.getState().initListeners();
      useTaskStore.getState().cleanupListeners();

      mockSocket.on.mockClear();

      useTaskStore.getState().initListeners();

      const onCalls = mockSocket.on.mock.calls.map(([event]: [string, ...unknown[]]) => event);
      expect(onCalls).toContain('session:tasks');
      expect(onCalls).toContain('session:removed');
    });

    it('is safe to call when no listeners are registered', () => {
      expect(() => useTaskStore.getState().cleanupListeners()).not.toThrow();
    });

    it('actually removes listeners from the socket (verified via listener count)', () => {
      useTaskStore.getState().initListeners();
      expect(mockSocket.__listenerCount('session:tasks')).toBe(1);

      useTaskStore.getState().cleanupListeners();
      expect(mockSocket.__listenerCount('session:tasks')).toBe(0);
    });
  });

  describe('socket event: session:tasks', () => {
    it('updates tasks when session:tasks event is received', () => {
      useTaskStore.getState().initListeners();

      const tasks: TaskItem[] = [
        createMockTask({ id: 't1', subject: 'Implement feature', status: 'in_progress' }),
        createMockTask({ id: 't2', subject: 'Write tests', status: 'pending' }),
      ];

      mockSocket.__simulateEvent('session:tasks', {
        sessionId: 'sess-1',
        tasks,
      });

      const stored = useTaskStore.getState().tasksBySession['sess-1'];
      expect(stored).toHaveLength(2);
      expect(stored[0].id).toBe('t1');
      expect(stored[0].subject).toBe('Implement feature');
      expect(stored[0].status).toBe('in_progress');
      expect(stored[1].id).toBe('t2');
      expect(stored[1].status).toBe('pending');
    });

    it('replaces existing tasks on subsequent events', () => {
      useTaskStore.getState().initListeners();

      mockSocket.__simulateEvent('session:tasks', {
        sessionId: 'sess-1',
        tasks: [createMockTask({ id: 't1', status: 'pending' })],
      });

      mockSocket.__simulateEvent('session:tasks', {
        sessionId: 'sess-1',
        tasks: [createMockTask({ id: 't1', status: 'completed' })],
      });

      const stored = useTaskStore.getState().tasksBySession['sess-1'];
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('completed');
    });

    it('handles tasks for multiple sessions independently', () => {
      useTaskStore.getState().initListeners();

      mockSocket.__simulateEvent('session:tasks', {
        sessionId: 'sess-1',
        tasks: [createMockTask({ id: 't1' })],
      });

      mockSocket.__simulateEvent('session:tasks', {
        sessionId: 'sess-2',
        tasks: [createMockTask({ id: 't2' }), createMockTask({ id: 't3' })],
      });

      expect(useTaskStore.getState().tasksBySession['sess-1']).toHaveLength(1);
      expect(useTaskStore.getState().tasksBySession['sess-2']).toHaveLength(2);
    });

    it('handles empty task list from event', () => {
      useTaskStore.getState().initListeners();

      mockSocket.__simulateEvent('session:tasks', {
        sessionId: 'sess-1',
        tasks: [],
      });

      expect(useTaskStore.getState().tasksBySession['sess-1']).toEqual([]);
    });
  });

  describe('socket event: session:removed', () => {
    it('clears tasks when session:removed event is received', () => {
      useTaskStore.getState().initListeners();
      useTaskStore.getState().setTasks('sess-1', [createMockTask({ id: 't1' })]);

      mockSocket.__simulateEvent('session:removed', { sessionId: 'sess-1' });

      expect(useTaskStore.getState().tasksBySession['sess-1']).toBeUndefined();
    });

    it('does not affect other sessions when one is removed', () => {
      useTaskStore.getState().initListeners();
      useTaskStore.getState().setTasks('sess-1', [createMockTask({ id: 't1' })]);
      useTaskStore.getState().setTasks('sess-2', [createMockTask({ id: 't2' })]);

      mockSocket.__simulateEvent('session:removed', { sessionId: 'sess-1' });

      expect(useTaskStore.getState().tasksBySession['sess-1']).toBeUndefined();
      expect(useTaskStore.getState().tasksBySession['sess-2']).toHaveLength(1);
    });

    it('is safe when removing a session with no tasks', () => {
      useTaskStore.getState().initListeners();

      expect(() => {
        mockSocket.__simulateEvent('session:removed', { sessionId: 'non-existent' });
      }).not.toThrow();
    });
  });

  describe('socket event: connect', () => {
    it('clears error on reconnection', () => {
      useTaskStore.getState().initListeners();
      useTaskStore.setState({ error: 'Connection lost' });

      mockSocket.__simulateEvent('connect');

      expect(useTaskStore.getState().error).toBeNull();
    });
  });

  describe('socket event: connect_error', () => {
    it('sets error on connection error', () => {
      useTaskStore.getState().initListeners();

      mockSocket.__simulateEvent('connect_error', new Error('ECONNREFUSED'));

      expect(useTaskStore.getState().error).toBe('Connection error: ECONNREFUSED');
    });
  });

  // ============================================
  // Selectors
  // ============================================

  describe('selectors', () => {
    describe('selectTasksForSession', () => {
      it('returns tasks for a session that has tasks', () => {
        const tasks = [createMockTask({ id: 't1' }), createMockTask({ id: 't2' })];
        useTaskStore.getState().setTasks('sess-1', tasks);

        const result = selectTasksForSession('sess-1')(useTaskStore.getState());
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('t1');
        expect(result[1].id).toBe('t2');
      });

      it('returns empty array for a session with no tasks', () => {
        const result = selectTasksForSession('non-existent')(useTaskStore.getState());
        expect(result).toEqual([]);
      });

      it('returns the same reference for missing sessions (referential stability)', () => {
        const result1 = selectTasksForSession('non-existent')(useTaskStore.getState());
        const result2 = selectTasksForSession('non-existent')(useTaskStore.getState());
        expect(result1).toBe(result2);
      });

      it('returns the actual task array reference when session has tasks', () => {
        const tasks = [createMockTask({ id: 't1' })];
        useTaskStore.getState().setTasks('sess-1', tasks);

        const result = selectTasksForSession('sess-1')(useTaskStore.getState());
        expect(result).toBe(useTaskStore.getState().tasksBySession['sess-1']);
      });
    });

    describe('selectTaskCountForSession', () => {
      it('returns the number of tasks for a session', () => {
        const tasks = [createMockTask(), createMockTask(), createMockTask()];
        useTaskStore.getState().setTasks('sess-1', tasks);

        expect(selectTaskCountForSession('sess-1')(useTaskStore.getState())).toBe(3);
      });

      it('returns 0 for a session with no tasks', () => {
        expect(selectTaskCountForSession('non-existent')(useTaskStore.getState())).toBe(0);
      });

      it('returns 0 for a session with an empty task list', () => {
        useTaskStore.getState().setTasks('sess-1', []);
        expect(selectTaskCountForSession('sess-1')(useTaskStore.getState())).toBe(0);
      });

      it('returns correct count after tasks are updated', () => {
        useTaskStore.getState().setTasks('sess-1', [createMockTask(), createMockTask()]);
        expect(selectTaskCountForSession('sess-1')(useTaskStore.getState())).toBe(2);

        useTaskStore.getState().setTasks('sess-1', [createMockTask()]);
        expect(selectTaskCountForSession('sess-1')(useTaskStore.getState())).toBe(1);
      });
    });

    describe('selectHasInProgressTasks', () => {
      it('returns true when there are in_progress tasks', () => {
        const tasks = [
          createMockTask({ id: 't1', status: 'completed' }),
          createMockTask({ id: 't2', status: 'in_progress' }),
          createMockTask({ id: 't3', status: 'pending' }),
        ];
        useTaskStore.getState().setTasks('sess-1', tasks);

        expect(selectHasInProgressTasks('sess-1')(useTaskStore.getState())).toBe(true);
      });

      it('returns false when no tasks are in_progress', () => {
        const tasks = [
          createMockTask({ id: 't1', status: 'completed' }),
          createMockTask({ id: 't2', status: 'pending' }),
        ];
        useTaskStore.getState().setTasks('sess-1', tasks);

        expect(selectHasInProgressTasks('sess-1')(useTaskStore.getState())).toBe(false);
      });

      it('returns false for a session with no tasks', () => {
        expect(selectHasInProgressTasks('non-existent')(useTaskStore.getState())).toBe(false);
      });

      it('returns false for a session with an empty task list', () => {
        useTaskStore.getState().setTasks('sess-1', []);
        expect(selectHasInProgressTasks('sess-1')(useTaskStore.getState())).toBe(false);
      });

      it('returns true when all tasks are in_progress', () => {
        const tasks = [
          createMockTask({ id: 't1', status: 'in_progress' }),
          createMockTask({ id: 't2', status: 'in_progress' }),
        ];
        useTaskStore.getState().setTasks('sess-1', tasks);

        expect(selectHasInProgressTasks('sess-1')(useTaskStore.getState())).toBe(true);
      });

      it('correctly updates when tasks transition status', () => {
        const tasksWithProgress = [createMockTask({ id: 't1', status: 'in_progress' })];
        useTaskStore.getState().setTasks('sess-1', tasksWithProgress);
        expect(selectHasInProgressTasks('sess-1')(useTaskStore.getState())).toBe(true);

        const tasksAllDone = [createMockTask({ id: 't1', status: 'completed' })];
        useTaskStore.getState().setTasks('sess-1', tasksAllDone);
        expect(selectHasInProgressTasks('sess-1')(useTaskStore.getState())).toBe(false);
      });
    });
  });
});
