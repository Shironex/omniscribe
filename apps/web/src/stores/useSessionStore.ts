import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  SessionConfig,
  SessionStatus,
  HealthLevel,
  MAX_CONCURRENT_SESSIONS,
  createLogger,
} from '@omniscribe/shared';
import { toast } from 'sonner';
import { socket } from '@/lib/socket';

const logger = createLogger('SessionStore');
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

/**
 * Extended session config matching the backend
 */
export interface ExtendedSessionConfig extends SessionConfig {
  branch?: string;
  worktreePath?: string;
  projectPath: string;
  status: SessionStatus;
  statusMessage?: string;
  needsInputPrompt?: boolean;
  /** Terminal PTY session ID - set after session is launched */
  terminalSessionId?: number;
  /** Health level from periodic health checks */
  health?: HealthLevel;
  /** Whether session was launched with skip-permissions mode */
  skipPermissions?: boolean;
  /** Claude Code session ID (from sessions-index.json) */
  claudeSessionId?: string;
  /** Whether this session was resumed from a previous Claude Code session */
  isResumed?: boolean;
}

/**
 * Session status update payload
 */
interface SessionStatusUpdate {
  sessionId: string;
  status: SessionStatus;
  message?: string;
  needsInputPrompt?: boolean;
}

/**
 * Session store state (extends common socket state)
 */
interface SessionState extends SocketStoreState {
  /** All sessions */
  sessions: ExtendedSessionConfig[];
  /** Pending status updates for race condition handling */
  pendingStatusUpdates: Map<string, SessionStatusUpdate[]>;
  /** Set of terminal session IDs currently under backpressure */
  backpressured: Set<number>;
}

/**
 * Session store actions (extends common socket actions)
 */
interface SessionActions extends SocketStoreActions {
  /** Add a new session */
  addSession: (session: ExtendedSessionConfig) => void;
  /** Remove a session by ID */
  removeSession: (sessionId: string) => void;
  /** Update an existing session */
  updateSession: (sessionId: string, updates: Partial<ExtendedSessionConfig>) => void;
  /** Update session status */
  updateStatus: (
    sessionId: string,
    status: SessionStatus,
    message?: string,
    needsInputPrompt?: boolean
  ) => void;
  /** Set sessions list (bulk update) */
  setSessions: (sessions: ExtendedSessionConfig[]) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
  /** Process pending status updates for a session */
  processPendingUpdates: (sessionId: string) => void;
  /** Set backpressure state for a terminal */
  setBackpressure: (terminalSessionId: number, paused: boolean) => void;
}

/**
 * Combined store type
 */
type SessionStore = SessionState & SessionActions;

/**
 * Session store using Zustand
 */
export const useSessionStore = create<SessionStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<SessionState>(set, 'session');

      // Create socket listeners
      const { initListeners, cleanupListeners } = createSocketListeners<SessionStore>(
        get,
        set,
        'session',
        {
          listeners: [
            {
              event: 'session:created',
              handler: (data, get) => {
                const session = data as ExtendedSessionConfig;
                logger.debug('session:created', session.id);
                get().addSession(session);
              },
            },
            {
              event: 'session:status',
              handler: (data, get) => {
                const update = data as SessionStatusUpdate;
                logger.debug('session:status', update.sessionId, update.status);
                get().updateStatus(
                  update.sessionId,
                  update.status,
                  update.message,
                  update.needsInputPrompt
                );
              },
            },
            {
              event: 'session:removed',
              handler: (data, get) => {
                const payload = data as { sessionId: string };
                logger.debug('session:removed', payload.sessionId);
                get().removeSession(payload.sessionId);
              },
            },
            {
              event: 'terminal:backpressure',
              handler: (data, get) => {
                const payload = data as { sessionId: number; paused: boolean };
                logger.debug('terminal:backpressure', payload.sessionId, payload.paused);
                get().setBackpressure(payload.sessionId, payload.paused);
              },
            },
            {
              event: 'session:health',
              handler: (data, get) => {
                const payload = data as { sessionId: string; health: HealthLevel; reason?: string };
                logger.debug('session:health', payload.sessionId, payload.health);
                get().updateSession(payload.sessionId, { health: payload.health });
              },
            },
            {
              event: 'session:claude-id-captured',
              handler: (data, get) => {
                const payload = data as { sessionId: string; claudeSessionId: string };
                logger.debug(
                  'session:claude-id-captured',
                  payload.sessionId,
                  payload.claudeSessionId
                );
                get().updateSession(payload.sessionId, {
                  claudeSessionId: payload.claudeSessionId,
                });
              },
            },
            {
              event: 'zombie:cleanup',
              handler: data => {
                const payload = data as { sessionId: string; sessionName: string; reason: string };
                logger.warn('zombie:cleanup', payload.sessionId, payload.reason);
                const sessionName =
                  typeof payload.sessionName === 'string'
                    ? payload.sessionName
                    : payload.sessionId || 'Unknown session';
                toast.error(`Session "${sessionName}" terminated unexpectedly`, {
                  description: payload.reason,
                  duration: 10000,
                });
              },
            },
          ],
          onConnect: get => {
            // Request fresh session list on reconnect
            logger.info('Refreshing session list on reconnect');
            socket.emit('session:list', {}, (sessions: ExtendedSessionConfig[]) => {
              if (Array.isArray(sessions)) {
                get().setSessions(sessions);
                // Rejoin terminal rooms for all sessions with active terminals
                // so output resumes after reconnection when CSR fails
                for (const session of sessions) {
                  if (session.terminalSessionId !== undefined) {
                    logger.debug('Rejoining terminal room', session.terminalSessionId);
                    socket.emit('terminal:join', { sessionId: session.terminalSessionId });
                  }
                }
              }
            });
          },
        }
      );

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
        sessions: [],
        pendingStatusUpdates: new Map(),
        backpressured: new Set(),

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Custom actions
        addSession: session => {
          set(
            state => {
              // Check if session already exists
              const exists = state.sessions.some(s => s.id === session.id);
              if (exists) {
                return state;
              }

              logger.debug('addSession', session.id);
              const newSessions = [...state.sessions, session];

              // Process any pending status updates for this session
              setTimeout(() => get().processPendingUpdates(session.id), 0);

              return { sessions: newSessions };
            },
            undefined,
            'session/addSession'
          );
        },

        removeSession: sessionId => {
          logger.debug('removeSession', sessionId);
          set(
            state => ({
              sessions: state.sessions.filter(s => s.id !== sessionId),
              pendingStatusUpdates: (() => {
                const newMap = new Map(state.pendingStatusUpdates);
                newMap.delete(sessionId);
                return newMap;
              })(),
            }),
            undefined,
            'session/removeSession'
          );
        },

        updateSession: (sessionId, updates) => {
          set(
            state => ({
              sessions: state.sessions.map(session =>
                session.id === sessionId
                  ? { ...session, ...updates, lastActiveAt: new Date() }
                  : session
              ),
            }),
            undefined,
            'session/updateSession'
          );
        },

        updateStatus: (sessionId, status, message, needsInputPrompt) => {
          logger.debug('updateStatus', sessionId, status);
          set(
            state => {
              const sessionExists = state.sessions.some(s => s.id === sessionId);

              if (!sessionExists) {
                // Buffer the status update for later
                logger.debug('Buffering pending update for unknown session', sessionId);
                const pending = state.pendingStatusUpdates.get(sessionId) ?? [];
                const newPending = [...pending, { sessionId, status, message, needsInputPrompt }];
                const newMap = new Map(state.pendingStatusUpdates);
                newMap.set(sessionId, newPending);

                return { pendingStatusUpdates: newMap };
              }

              return {
                sessions: state.sessions.map(session =>
                  session.id === sessionId
                    ? {
                        ...session,
                        status,
                        // Only update statusMessage if a new message is provided
                        statusMessage: message ?? session.statusMessage,
                        needsInputPrompt,
                        lastActiveAt: new Date(),
                      }
                    : session
                ),
              };
            },
            undefined,
            'session/updateStatus'
          );
        },

        setSessions: sessions => {
          set({ sessions }, undefined, 'session/setSessions');
        },

        processPendingUpdates: sessionId => {
          const state = get();
          const pending = state.pendingStatusUpdates.get(sessionId);

          if (!pending || pending.length === 0) {
            return;
          }

          // Apply all pending updates in order
          for (const update of pending) {
            state.updateStatus(
              update.sessionId,
              update.status,
              update.message,
              update.needsInputPrompt
            );
          }

          // Clear pending updates for this session
          set(
            state => {
              const newMap = new Map(state.pendingStatusUpdates);
              newMap.delete(sessionId);
              return { pendingStatusUpdates: newMap };
            },
            undefined,
            'session/clearPendingUpdates'
          );
        },

        setBackpressure: (terminalSessionId, paused) => {
          set(
            state => {
              const next = new Set(state.backpressured);
              if (paused) {
                next.add(terminalSessionId);
              } else {
                next.delete(terminalSessionId);
              }
              return { backpressured: next };
            },
            undefined,
            'session/setBackpressure'
          );
        },
      };
    },
    { name: 'session' }
  )
);

// Selectors

/**
 * Select sessions for a specific project
 */
export const selectSessionsForProject = (projectPath: string) => (state: SessionStore) =>
  state.sessions.filter(session => session.projectPath === projectPath);

/**
 * Select a specific session by ID
 */
export const selectSession = (sessionId: string) => (state: SessionStore) =>
  state.sessions.find(session => session.id === sessionId);

/**
 * Select sessions by status
 */
export const selectSessionsByStatus = (status: SessionStatus) => (state: SessionStore) =>
  state.sessions.filter(session => session.status === status);

/**
 * Select active sessions (not idle or disconnected)
 */
export const selectActiveSessions = () => (state: SessionStore) =>
  state.sessions.filter(session => session.status !== 'idle' && session.status !== 'disconnected');

/**
 * Get count of running sessions (those with active terminals).
 * Only sessions with a terminalSessionId are considered "running".
 * Done/Error sessions without terminals do not count.
 */
export const selectRunningSessionCount = (state: SessionStore) =>
  state.sessions.filter(s => s.terminalSessionId !== undefined).length;

/**
 * Check if the concurrent session limit has been reached.
 */
export const selectIsAtSessionLimit = (state: SessionStore) =>
  selectRunningSessionCount(state) >= MAX_CONCURRENT_SESSIONS;
