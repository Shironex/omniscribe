import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger } from '@omniscribe/shared';
import type { TaskItem, SessionTasksUpdate } from '@omniscribe/shared';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('TaskStore');

/**
 * Task store state (extends common socket state)
 */
interface TaskState extends SocketStoreState {
  /** Tasks indexed by session ID */
  tasksBySession: Map<string, TaskItem[]>;
}

/**
 * Task store actions (extends common socket actions)
 */
interface TaskActions extends SocketStoreActions {
  /** Set tasks for a session (complete snapshot replacement) */
  setTasks: (sessionId: string, tasks: TaskItem[]) => void;
  /** Clear tasks for a session (on session removal) */
  clearTasks: (sessionId: string) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
}

/**
 * Combined store type
 */
type TaskStore = TaskState & TaskActions;

/**
 * Task store using Zustand — manages per-session task lists
 * received via MCP tool reports over socket events.
 */
export const useTaskStore = create<TaskStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<TaskState>(set, 'task');

      // Create socket listeners
      const { initListeners, cleanupListeners } = createSocketListeners<TaskStore>(
        get,
        set,
        'task',
        {
          listeners: [
            {
              event: 'session:tasks',
              handler: (data, get) => {
                const update = data as SessionTasksUpdate;
                logger.debug('session:tasks', update.sessionId, update.tasks.length);
                get().setTasks(update.sessionId, update.tasks);
              },
            },
            {
              event: 'session:removed',
              handler: (data, get) => {
                const { sessionId } = data as { sessionId: string };
                logger.debug('session:removed — clearing tasks', sessionId);
                get().clearTasks(sessionId);
              },
            },
          ],
        }
      );

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
        tasksBySession: new Map(),

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Custom actions
        setTasks: (sessionId: string, tasks: TaskItem[]) => {
          set(
            state => {
              const newMap = new Map(state.tasksBySession);
              newMap.set(sessionId, tasks);
              return { tasksBySession: newMap };
            },
            undefined,
            'task/setTasks'
          );
        },

        clearTasks: (sessionId: string) => {
          set(
            state => {
              const newMap = new Map(state.tasksBySession);
              newMap.delete(sessionId);
              return { tasksBySession: newMap };
            },
            undefined,
            'task/clearTasks'
          );
        },
      };
    },
    { name: 'task' }
  )
);

// Selectors

/**
 * Select tasks for a specific session
 */
export const selectTasksForSession = (sessionId: string) => (state: TaskStore) =>
  state.tasksBySession.get(sessionId) ?? [];

/**
 * Select total task count for a session
 */
export const selectTaskCountForSession = (sessionId: string) => (state: TaskStore) =>
  state.tasksBySession.get(sessionId)?.length ?? 0;

/**
 * Select whether a session has any in-progress tasks
 */
export const selectHasInProgressTasks = (sessionId: string) => (state: TaskStore) =>
  state.tasksBySession.get(sessionId)?.some(t => t.status === 'in_progress') ?? false;
