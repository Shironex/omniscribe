import { useState, useCallback, useMemo } from 'react';
import { createLogger, mapSessionStatus } from '@omniscribe/shared';
import { useSessionStore, type FrontendSessionConfig } from '@/stores/useSessionStore';
import { mapToTerminalSessions } from '@/lib/session-mappers';

const logger = createLogger('ProjectSessions');
import type { StatusCounts } from '@/components/shared/StatusLegend';
import type { TerminalSession, PreLaunchSlot } from '@/components/terminal/TerminalGrid';

interface UseProjectSessionsReturn {
  /** All sessions from store */
  sessions: FrontendSessionConfig[];
  /** Terminal sessions formatted for TerminalGrid */
  terminalSessions: TerminalSession[];
  /** Sessions filtered for the active project */
  activeProjectSessions: FrontendSessionConfig[];
  /** Whether there are any active sessions */
  hasActiveSessions: boolean;
  /** Status counts for the active project */
  statusCounts: Partial<StatusCounts>;
  /** Currently focused session ID */
  focusedSessionId: string | null;
  /** Handler to focus a session */
  handleFocusSession: (sessionId: string) => void;
  /** Handler for session close */
  handleSessionClose: (sessionId: string, exitCode: number) => Promise<void>;
  /** Update session function from store */
  updateSession: (sessionId: string, updates: Partial<FrontendSessionConfig>) => void;
}

/**
 * Hook for project sessions management.
 * Handles session store connections and all session-related derived values.
 */
export function useProjectSessions(
  activeProjectPath: string | null,
  preLaunchSlots: PreLaunchSlot[]
): UseProjectSessionsReturn {
  // Session store
  const sessions = useSessionStore(state => state.sessions);
  const updateSession = useSessionStore(state => state.updateSession);
  const customTitles = useSessionStore(state => state.customTitles);

  // Focused session state
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  // Filter sessions for the active project
  const activeProjectSessions = useMemo(() => {
    if (!activeProjectPath) return [];
    return sessions.filter(s => s.projectPath === activeProjectPath);
  }, [sessions, activeProjectPath]);

  // Convert sessions to TerminalSession format for TerminalGrid
  const terminalSessions: TerminalSession[] = useMemo(() => {
    return mapToTerminalSessions(activeProjectSessions, customTitles);
  }, [activeProjectSessions, customTitles]);

  // Check if we have any running sessions (sessions with a terminal)
  const hasActiveSessions = useMemo(
    () =>
      activeProjectSessions.some(
        s => s.terminalSessionId !== undefined && s.status !== 'disconnected'
      ),
    [activeProjectSessions]
  );

  // Compute status counts (mapping backend status to UI status)
  const statusCounts: Partial<StatusCounts> = useMemo(() => {
    const counts: Partial<StatusCounts> = {};
    for (const session of activeProjectSessions) {
      const uiStatus = mapSessionStatus(session.status);
      counts[uiStatus] = (counts[uiStatus] ?? 0) + 1;
    }
    // Add pre-launch slots as idle
    if (preLaunchSlots.length > 0) {
      counts.idle = (counts.idle ?? 0) + preLaunchSlots.length;
    }
    return counts;
  }, [activeProjectSessions, preLaunchSlots]);

  // Focus session handler
  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
  }, []);

  // Handle session close from terminal
  const handleSessionClose = useCallback(async (sessionId: string, exitCode: number) => {
    logger.info('Session closed', sessionId, 'exit code:', exitCode);
    // Session will be removed by the socket event handler
  }, []);

  return {
    sessions,
    terminalSessions,
    activeProjectSessions,
    hasActiveSessions,
    statusCounts,
    focusedSessionId,
    handleFocusSession,
    handleSessionClose,
    updateSession,
  };
}
