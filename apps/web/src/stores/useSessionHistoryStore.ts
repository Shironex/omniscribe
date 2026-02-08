import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger } from '@omniscribe/shared';
import type { ClaudeSessionEntry, ClaudeSessionHistoryResponse } from '@omniscribe/shared';
import { socket } from '@/lib/socket';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('SessionHistoryStore');

/**
 * Session history store state (extends common socket state)
 */
interface SessionHistoryState extends SocketStoreState {
  /** Claude Code sessions from sessions-index.json */
  sessions: ClaudeSessionEntry[];
  /** Sessions that can be resumed (crashed with claudeSessionId) */
  resumableSessions: Map<string, { claudeSessionId: string; sessionName: string }>;
}

/**
 * Session history store actions (extends common socket actions)
 */
interface SessionHistoryActions extends SocketStoreActions {
  /** Set sessions list */
  setSessions: (sessions: ClaudeSessionEntry[]) => void;
  /** Fetch Claude Code session history for a project */
  fetchHistory: (projectPath: string) => void;
  /** Mark a session as resumable */
  addResumable: (sessionId: string, claudeSessionId: string, sessionName: string) => void;
  /** Remove a session from the resumable set */
  removeResumable: (sessionId: string) => void;
  /** Clear all session history */
  clearHistory: () => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
}

/**
 * Combined store type
 */
type SessionHistoryStore = SessionHistoryState & SessionHistoryActions;

/**
 * Session history store using Zustand — manages Claude Code session history
 * and resumable session tracking.
 */
export const useSessionHistoryStore = create<SessionHistoryStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<SessionHistoryState>(set, 'sessionHistory');

      // Create socket listeners
      const { initListeners, cleanupListeners } = createSocketListeners<SessionHistoryStore>(
        get,
        set,
        'sessionHistory',
        {
          listeners: [
            {
              event: 'session:resumable',
              handler: (data, get) => {
                const payload = data as {
                  sessionId: string;
                  claudeSessionId: string;
                  sessionName: string;
                };
                logger.debug(
                  'session:resumable',
                  payload.sessionId,
                  payload.claudeSessionId,
                  payload.sessionName
                );
                get().addResumable(payload.sessionId, payload.claudeSessionId, payload.sessionName);
              },
            },
          ],
        }
      );

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
        sessions: [],
        resumableSessions: new Map(),

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Custom actions
        setSessions: (sessions: ClaudeSessionEntry[]) => {
          set({ sessions }, undefined, 'sessionHistory/setSessions');
        },

        fetchHistory: (projectPath: string) => {
          set({ isLoading: true }, undefined, 'sessionHistory/fetchHistory');
          socket.emit(
            'session:history',
            { projectPath },
            (response: ClaudeSessionHistoryResponse) => {
              if (response.error) {
                set(
                  { error: response.error, isLoading: false },
                  undefined,
                  'sessionHistory/fetchHistoryError'
                );
              } else {
                set(
                  { sessions: response.sessions ?? [], isLoading: false, error: null },
                  undefined,
                  'sessionHistory/fetchHistorySuccess'
                );
              }
            }
          );
        },

        addResumable: (sessionId: string, claudeSessionId: string, sessionName: string) => {
          set(
            state => {
              const newMap = new Map(state.resumableSessions);
              newMap.set(sessionId, { claudeSessionId, sessionName });
              return { resumableSessions: newMap };
            },
            undefined,
            'sessionHistory/addResumable'
          );
        },

        removeResumable: (sessionId: string) => {
          set(
            state => {
              const newMap = new Map(state.resumableSessions);
              newMap.delete(sessionId);
              return { resumableSessions: newMap };
            },
            undefined,
            'sessionHistory/removeResumable'
          );
        },

        clearHistory: () => {
          set(
            { sessions: [], resumableSessions: new Map() },
            undefined,
            'sessionHistory/clearHistory'
          );
        },
      };
    },
    { name: 'sessionHistory' }
  )
);

// Selectors

/**
 * Select all session history entries
 */
export const selectSessionHistory = (state: SessionHistoryStore) => state.sessions;

/**
 * Select all resumable sessions
 */
export const selectResumableSessions = (state: SessionHistoryStore) => state.resumableSessions;

/**
 * Select whether a specific session is resumable
 */
export const selectIsResumable = (sessionId: string) => (state: SessionHistoryStore) =>
  state.resumableSessions.has(sessionId);
