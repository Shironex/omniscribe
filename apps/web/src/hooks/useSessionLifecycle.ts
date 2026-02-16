import { useCallback, useRef, useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useSessionStore, type FrontendSessionConfig } from '@/stores/useSessionStore';
import { removeSession } from '@/lib/session';
import { killTerminal } from '@/lib/terminal';

const logger = createLogger('SessionLifecycle');

interface UseSessionLifecycleReturn {
  /** Handler to stop all active sessions */
  handleStopAll: () => Promise<void>;
  /** Handler to kill a specific session */
  handleKillSession: (sessionId: string) => Promise<void>;
}

/**
 * Hook for session lifecycle operations.
 * Handles stop all and kill session functionality.
 */
export function useSessionLifecycle(
  activeProjectSessions: FrontendSessionConfig[]
): UseSessionLifecycleReturn {
  // Use a ref to always access the latest sessions, avoiding stale closure issues
  const sessionsRef = useRef(activeProjectSessions);
  useEffect(() => {
    sessionsRef.current = activeProjectSessions;
  }, [activeProjectSessions]);

  // Stop all sessions handler
  const handleStopAll = useCallback(async () => {
    logger.info('Stopping all sessions');
    // Capture current sessions at execution time to avoid stale closure
    const sessions = [...sessionsRef.current];

    // Use Promise.all for parallel execution to avoid race conditions with re-renders
    await Promise.all(
      sessions.map(async session => {
        // Skip only disconnected sessions (already closed)
        // Note: 'idle' status means Claude is waiting for input - still a running session
        if (session.status === 'disconnected') {
          logger.debug('Skipping disconnected session', session.id);
          return;
        }
        try {
          // Kill the terminal process using the correct terminalSessionId
          if (session.terminalSessionId !== undefined) {
            killTerminal(session.terminalSessionId);
          }
          // Remove the session
          await removeSession(session.id);
          logger.debug('Stopped session', session.id);
        } catch (error) {
          logger.error('Failed to stop session', session.id, error);
        }
      })
    );
  }, []);

  // Kill a session handler — searches all sessions from the store
  // so it works for background (non-active) project sessions too
  const handleKillSession = useCallback(async (sessionId: string) => {
    logger.info('Killing session', sessionId);
    try {
      // Search all sessions from the store, not just active project sessions
      const allSessions = useSessionStore.getState().sessions;
      const session = allSessions.find(s => s.id === sessionId);
      if (session?.terminalSessionId !== undefined) {
        killTerminal(session.terminalSessionId);
      }
      await removeSession(sessionId);
      logger.debug('Killed session', sessionId);
    } catch (error) {
      logger.error('Failed to kill session', sessionId, error);
    }
  }, []);

  return {
    handleStopAll,
    handleKillSession,
  };
}
