import { create } from 'zustand';
import { SessionConfig, SessionStatus } from '@omniscribe/shared';
import { socket } from '../lib/socket';

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
 * Session store state
 */
interface SessionState {
  /** All sessions */
  sessions: ExtendedSessionConfig[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Pending status updates for race condition handling */
  pendingStatusUpdates: Map<string, SessionStatusUpdate[]>;
  /** Whether listeners are initialized */
  listenersInitialized: boolean;
}

/**
 * Session store actions
 */
interface SessionActions {
  /** Add a new session */
  addSession: (session: ExtendedSessionConfig) => void;
  /** Remove a session by ID */
  removeSession: (sessionId: string) => void;
  /** Update an existing session */
  updateSession: (sessionId: string, updates: Partial<ExtendedSessionConfig>) => void;
  /** Update session status */
  updateStatus: (sessionId: string, status: SessionStatus, message?: string, needsInputPrompt?: boolean) => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
  /** Set sessions list (bulk update) */
  setSessions: (sessions: ExtendedSessionConfig[]) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
  /** Process pending status updates for a session */
  processPendingUpdates: (sessionId: string) => void;
}

/**
 * Combined store type
 */
type SessionStore = SessionState & SessionActions;

/**
 * Session store using Zustand
 */
export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  sessions: [],
  isLoading: false,
  error: null,
  pendingStatusUpdates: new Map(),
  listenersInitialized: false,

  // Actions
  addSession: (session) => {
    set((state) => {
      // Check if session already exists
      const exists = state.sessions.some((s) => s.id === session.id);
      if (exists) {
        return state;
      }

      const newSessions = [...state.sessions, session];

      // Process any pending status updates for this session
      setTimeout(() => get().processPendingUpdates(session.id), 0);

      return { sessions: newSessions };
    });
  },

  removeSession: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      pendingStatusUpdates: (() => {
        const newMap = new Map(state.pendingStatusUpdates);
        newMap.delete(sessionId);
        return newMap;
      })(),
    }));
  },

  updateSession: (sessionId, updates) => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, ...updates, lastActiveAt: new Date() }
          : session
      ),
    }));
  },

  updateStatus: (sessionId, status, message, needsInputPrompt) => {
    set((state) => {
      const sessionExists = state.sessions.some((s) => s.id === sessionId);

      if (!sessionExists) {
        // Buffer the status update for later
        const pending = state.pendingStatusUpdates.get(sessionId) ?? [];
        const newPending = [...pending, { sessionId, status, message, needsInputPrompt }];
        const newMap = new Map(state.pendingStatusUpdates);
        newMap.set(sessionId, newPending);

        return { pendingStatusUpdates: newMap };
      }

      return {
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                status,
                statusMessage: message,
                needsInputPrompt,
                lastActiveAt: new Date(),
              }
            : session
        ),
      };
    });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error });
  },

  setSessions: (sessions) => {
    set({ sessions });
  },

  processPendingUpdates: (sessionId) => {
    const state = get();
    const pending = state.pendingStatusUpdates.get(sessionId);

    if (!pending || pending.length === 0) {
      return;
    }

    // Apply all pending updates in order
    for (const update of pending) {
      state.updateStatus(update.sessionId, update.status, update.message, update.needsInputPrompt);
    }

    // Clear pending updates for this session
    set((state) => {
      const newMap = new Map(state.pendingStatusUpdates);
      newMap.delete(sessionId);
      return { pendingStatusUpdates: newMap };
    });
  },

  initListeners: () => {
    const state = get();

    // Prevent duplicate listener registration
    if (state.listenersInitialized) {
      return;
    }

    const { addSession, removeSession, updateStatus, setSessions, setError } = get();

    // Handle session created
    socket.on('session:created', (session: ExtendedSessionConfig) => {
      addSession(session);
    });

    // Handle session status updates
    socket.on('session:status', (update: SessionStatusUpdate) => {
      updateStatus(update.sessionId, update.status, update.message, update.needsInputPrompt);
    });

    // Handle session removed
    socket.on('session:removed', (payload: { sessionId: string }) => {
      removeSession(payload.sessionId);
    });

    // Handle connection error
    socket.on('connect_error', (err: Error) => {
      setError(`Connection error: ${err.message}`);
    });

    // Handle reconnection - refresh session list
    socket.on('connect', () => {
      setError(null);
      // Request fresh session list on reconnect
      socket.emit('session:list', {}, (sessions: ExtendedSessionConfig[]) => {
        if (Array.isArray(sessions)) {
          setSessions(sessions);
        }
      });
    });

    set({ listenersInitialized: true });
  },

  cleanupListeners: () => {
    socket.off('session:created');
    socket.off('session:status');
    socket.off('session:removed');

    set({ listenersInitialized: false });
  },
}));

// Selectors

/**
 * Select sessions for a specific project
 */
export const selectSessionsForProject = (projectPath: string) => (state: SessionStore) =>
  state.sessions.filter((session) => session.projectPath === projectPath);

/**
 * Select a specific session by ID
 */
export const selectSession = (sessionId: string) => (state: SessionStore) =>
  state.sessions.find((session) => session.id === sessionId);

/**
 * Select sessions by status
 */
export const selectSessionsByStatus = (status: SessionStatus) => (state: SessionStore) =>
  state.sessions.filter((session) => session.status === status);

/**
 * Select active sessions (not idle or disconnected)
 */
export const selectActiveSessions = () => (state: SessionStore) =>
  state.sessions.filter(
    (session) => session.status !== 'idle' && session.status !== 'disconnected'
  );
