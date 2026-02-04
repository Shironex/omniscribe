import { useCallback, useRef, useEffect } from 'react';
import type { ExtendedSessionConfig } from '@/stores/useSessionStore';
import { removeSession } from '@/lib/session';
import { killTerminal } from '@/lib/terminal';

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
  activeProjectSessions: ExtendedSessionConfig[]
): UseSessionLifecycleReturn {
  // Use a ref to always access the latest sessions, avoiding stale closure issues
  const sessionsRef = useRef(activeProjectSessions);
  useEffect(() => {
    sessionsRef.current = activeProjectSessions;
  }, [activeProjectSessions]);

  // Stop all sessions handler
  const handleStopAll = useCallback(async () => {
    // Capture current sessions at execution time to avoid stale closure
    const sessions = [...sessionsRef.current];

    // Use Promise.all for parallel execution to avoid race conditions with re-renders
    await Promise.all(
      sessions.map(async (session) => {
        // Skip only disconnected sessions (already closed)
        // Note: 'idle' status means Claude is waiting for input - still a running session
        if (session.status === 'disconnected') {
          return;
        }
        try {
          // Kill the terminal process using the correct terminalSessionId
          if (session.terminalSessionId !== undefined) {
            killTerminal(session.terminalSessionId);
          }
          // Remove the session
          await removeSession(session.id);
        } catch (error) {
          console.error(`Failed to stop session ${session.id}:`, error);
        }
      })
    );
  }, []);

  // Kill a session handler
  const handleKillSession = useCallback(async (sessionId: string) => {
    try {
      // Find the session to get the correct terminalSessionId
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (session?.terminalSessionId !== undefined) {
        killTerminal(session.terminalSessionId);
      }
      await removeSession(sessionId);
    } catch (error) {
      console.error(`Failed to kill session ${sessionId}:`, error);
    }
  }, []);

  return {
    handleStopAll,
    handleKillSession,
  };
}
