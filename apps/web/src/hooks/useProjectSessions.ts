import { useState, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger, mapSessionStatus } from '@omniscribe/shared';
import {
  useSessionStore,
  selectSessionsForProject,
  type FrontendSessionConfig,
} from '@/stores/useSessionStore';
import { mapToTerminalSessions } from '@/lib/session-mappers';
import type { StatusCounts } from '@/components/shared/StatusLegend';
import type { TerminalSession, PreLaunchSlot } from '@/components/terminal/TerminalGrid';

const EMPTY_SESSIONS: FrontendSessionConfig[] = [];

const logger = createLogger('ProjectSessions');

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
  // Use project-scoped memoized selector so this hook only re-renders when the
  // active project's sessions change, not when any session across any project updates.
  // Use project-scoped memoized selector for O(1) lookups. When no project is
  // active, return a stable empty array constant to avoid infinite re-renders
  // (a `() => []` lambda would return a new reference on every store update).
  const projectSelector = useMemo(
    () => (activeProjectPath ? selectSessionsForProject(activeProjectPath) : () => EMPTY_SESSIONS),
    [activeProjectPath]
  );
  const activeProjectSessions = useSessionStore(projectSelector);
  const sessions = useSessionStore(useShallow(state => state.sessions));
  const updateSession = useSessionStore(state => state.updateSession);
  const customTitles = useSessionStore(useShallow(state => state.customTitles));

  // Focused session state
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  // Convert sessions to TerminalSession format for App-level consumers
  // (e.g. useQuickActionExecution, session counts).
  // Note: PersistentProjectGrid independently maps its own sessions from the
  // store so that each grid re-renders only when its own project's sessions
  // change. This duplication is intentional to avoid coupling the grid to this
  // hook's broader subscription.
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
