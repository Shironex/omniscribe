import { useCallback } from 'react';
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
  // Stop all sessions handler
  const handleStopAll = useCallback(async () => {
    // Stop all active sessions for the current project
    for (const session of activeProjectSessions) {
      if (session.status !== 'idle' && session.status !== 'disconnected') {
        try {
          // Kill the terminal process
          const sessionIdNum = parseInt(session.id, 10);
          if (!isNaN(sessionIdNum)) {
            killTerminal(sessionIdNum);
          }
          // Remove the session
          await removeSession(session.id);
        } catch (error) {
          console.error(`Failed to stop session ${session.id}:`, error);
        }
      }
    }
  }, [activeProjectSessions]);

  // Kill a session handler
  const handleKillSession = useCallback(async (sessionId: string) => {
    try {
      const sessionIdNum = parseInt(sessionId, 10);
      if (!isNaN(sessionIdNum)) {
        killTerminal(sessionIdNum);
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
