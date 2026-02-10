import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  SessionStatus,
  HealthLevel,
  MAX_CONCURRENT_SESSIONS,
  createLogger,
  SessionEvents,
  TerminalEvents,
  ZombieEvents,
  type ExtendedSessionConfig,
  type SessionStatusUpdate,
  type ClaudeSessionIdCapturedEvent,
} from '@omniscribe/shared';
import { toast } from 'sonner';
import { socket } from '@/lib/socket';

const logger = createLogger('SessionStore');

/** Convert date fields from ISO strings (JSON serialization) to Date objects */
function convertBackendSession(session: FrontendSessionConfig): FrontendSessionConfig {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    lastActiveAt: new Date(session.lastActiveAt),
  };
}
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
  createMemoizedSelector,
} from './utils';

/**
 * Frontend session config with UI-specific fields
 */
export interface FrontendSessionConfig extends ExtendedSessionConfig {
  /** Health level from periodic health checks */
  health?: HealthLevel;
}

/**
 * Session store state (extends common socket state)
 */
interface SessionState extends SocketStoreState {
  /** All sessions */
  sessions: FrontendSessionConfig[];
  /** Pending status updates for race condition handling */
  pendingStatusUpdates: Record<string, SessionStatusUpdate[]>;
  /** Terminal session IDs currently under backpressure */
  backpressured: Record<number, true>;
}

/**
 * Session store actions (extends common socket actions)
 */
interface SessionActions extends SocketStoreActions {
  /** Add a new session */
  addSession: (session: FrontendSessionConfig) => void;
  /** Remove a session by ID */
  removeSession: (sessionId: string) => void;
  /** Update an existing session */
  updateSession: (sessionId: string, updates: Partial<FrontendSessionConfig>) => void;
  /** Update session status */
  updateStatus: (
    sessionId: string,
    status: SessionStatus,
    message?: string,
    needsInputPrompt?: boolean
  ) => void;
  /** Set sessions list (bulk update) */
  setSessions: (sessions: FrontendSessionConfig[]) => void;
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
              event: SessionEvents.CREATED,
              handler: (data, get) => {
                const session = convertBackendSession(data as FrontendSessionConfig);
                logger.debug(SessionEvents.CREATED, session.id);
                get().addSession(session);
              },
            },
            {
              event: SessionEvents.STATUS,
              handler: (data, get) => {
                const update = data as SessionStatusUpdate;
                logger.debug(SessionEvents.STATUS, update.sessionId, update.status);
                get().updateStatus(
                  update.sessionId,
                  update.status,
                  update.message,
                  update.needsInputPrompt
                );
              },
            },
            {
              event: SessionEvents.REMOVED,
              handler: (data, get) => {
                const payload = data as { sessionId: string };
                logger.debug(SessionEvents.REMOVED, payload.sessionId);
                get().removeSession(payload.sessionId);
              },
            },
            {
              event: TerminalEvents.BACKPRESSURE,
              handler: (data, get) => {
                const payload = data as { sessionId: number; paused: boolean };
                logger.debug(TerminalEvents.BACKPRESSURE, payload.sessionId, payload.paused);
                get().setBackpressure(payload.sessionId, payload.paused);
              },
            },
            {
              event: SessionEvents.HEALTH,
              handler: (data, get) => {
                const payload = data as { sessionId: string; health: HealthLevel; reason?: string };
                logger.debug(SessionEvents.HEALTH, payload.sessionId, payload.health);
                get().updateSession(payload.sessionId, { health: payload.health });
              },
            },
            {
              event: SessionEvents.CLAUDE_ID_CAPTURED,
              handler: (data, get) => {
                const payload = data as ClaudeSessionIdCapturedEvent;
                logger.debug(
                  SessionEvents.CLAUDE_ID_CAPTURED,
                  payload.sessionId,
                  payload.claudeSessionId
                );
                get().updateSession(payload.sessionId, {
                  claudeSessionId: payload.claudeSessionId,
                });
              },
            },
            {
              event: ZombieEvents.CLEANUP,
              handler: data => {
                const payload = data as { sessionId: string; sessionName: string; reason: string };
                logger.warn(ZombieEvents.CLEANUP, payload.sessionId, payload.reason);
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
            socket.emit(SessionEvents.LIST, {}, (sessions: FrontendSessionConfig[]) => {
              if (Array.isArray(sessions)) {
                get().setSessions(sessions.map(convertBackendSession));
                // Rejoin terminal rooms for all sessions with active terminals
                // so output resumes after reconnection when CSR fails
                for (const session of sessions) {
                  if (session.terminalSessionId !== undefined) {
                    logger.debug('Rejoining terminal room', session.terminalSessionId);
                    socket.emit(TerminalEvents.JOIN, { sessionId: session.terminalSessionId });
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
        pendingStatusUpdates: {},
        backpressured: {},

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
            state => {
              const { [sessionId]: _pending, ...restPending } = state.pendingStatusUpdates;
              return {
                sessions: state.sessions.filter(s => s.id !== sessionId),
                pendingStatusUpdates: restPending,
              };
            },
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
                const pending = state.pendingStatusUpdates[sessionId] ?? [];
                return {
                  pendingStatusUpdates: {
                    ...state.pendingStatusUpdates,
                    [sessionId]: [...pending, { sessionId, status, message, needsInputPrompt }],
                  },
                };
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
          const pending = state.pendingStatusUpdates[sessionId];

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
              const { [sessionId]: _cleared, ...rest } = state.pendingStatusUpdates;
              return { pendingStatusUpdates: rest };
            },
            undefined,
            'session/clearPendingUpdates'
          );
        },

        setBackpressure: (terminalSessionId, paused) => {
          set(
            state => {
              if (paused) {
                return {
                  backpressured: { ...state.backpressured, [terminalSessionId]: true as const },
                };
              }
              const { [terminalSessionId]: _removed, ...rest } = state.backpressured;
              return { backpressured: rest as Record<number, true> };
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
export const selectActiveSessions = createMemoizedSelector((state: SessionStore) =>
  state.sessions.filter(session => session.status !== 'idle' && session.status !== 'disconnected')
);

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
