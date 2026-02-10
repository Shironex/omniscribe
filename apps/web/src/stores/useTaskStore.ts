import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger, SessionEvents } from '@omniscribe/shared';
import type { TaskItem, SessionTasksUpdate, SessionRemovePayload } from '@omniscribe/shared';
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
  tasksBySession: Record<string, TaskItem[]>;
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
              event: SessionEvents.TASKS,
              handler: (data, get) => {
                const update = data as SessionTasksUpdate;
                logger.debug(SessionEvents.TASKS, update.sessionId, update.tasks.length);
                get().setTasks(update.sessionId, update.tasks);
              },
            },
            {
              event: SessionEvents.REMOVED,
              handler: (data, get) => {
                const { sessionId } = data as SessionRemovePayload;
                logger.debug(SessionEvents.REMOVED, '-- clearing tasks', sessionId);
                get().clearTasks(sessionId);
              },
            },
          ],
        }
      );

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
        tasksBySession: {},

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Custom actions
        setTasks: (sessionId: string, tasks: TaskItem[]) => {
          set(
            state => ({
              tasksBySession: { ...state.tasksBySession, [sessionId]: tasks },
            }),
            undefined,
            'task/setTasks'
          );
        },

        clearTasks: (sessionId: string) => {
          set(
            state => {
              const rest = Object.fromEntries(
                Object.entries(state.tasksBySession).filter(([key]) => key !== sessionId)
              );
              return { tasksBySession: rest };
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

/** Stable empty array to avoid new references when a session has no tasks */
const EMPTY_TASKS: TaskItem[] = [];

/**
 * Select tasks for a specific session
 */
export const selectTasksForSession = (sessionId: string) => (state: TaskStore) =>
  state.tasksBySession[sessionId] ?? EMPTY_TASKS;

/**
 * Select total task count for a session
 */
export const selectTaskCountForSession = (sessionId: string) => (state: TaskStore) =>
  state.tasksBySession[sessionId]?.length ?? 0;

/**
 * Select whether a session has any in-progress tasks
 */
export const selectHasInProgressTasks = (sessionId: string) => (state: TaskStore) =>
  state.tasksBySession[sessionId]?.some(t => t.status === 'in_progress') ?? false;
