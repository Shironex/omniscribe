import { useState, useCallback, useMemo } from 'react';
import { useSessionStore, type ExtendedSessionConfig } from '@/stores/useSessionStore';
import type { StatusCounts } from '@/components';
import type { TerminalSession, PreLaunchSlot } from '@/components/terminal/TerminalGrid';
import { mapSessionStatus } from '@omniscribe/shared';
import { mapAiModeToUI } from '@/lib/aiMode';

interface UseProjectSessionsReturn {
  /** All sessions from store */
  sessions: ExtendedSessionConfig[];
  /** Terminal sessions formatted for TerminalGrid */
  terminalSessions: TerminalSession[];
  /** Sessions filtered for the active project */
  activeProjectSessions: ExtendedSessionConfig[];
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
  updateSession: (sessionId: string, updates: Partial<ExtendedSessionConfig>) => void;
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
  const sessions = useSessionStore((state) => state.sessions);
  const updateSession = useSessionStore((state) => state.updateSession);

  // Focused session state
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  // Filter sessions for the active project
  const activeProjectSessions = useMemo(() => {
    if (!activeProjectPath) return [];
    return sessions.filter((s) => s.projectPath === activeProjectPath);
  }, [sessions, activeProjectPath]);

  // Convert sessions to TerminalSession format for TerminalGrid
  const terminalSessions: TerminalSession[] = useMemo(() => {
    return activeProjectSessions.map((session, index) => ({
      id: session.id,
      sessionNumber: index + 1,
      aiMode: mapAiModeToUI(session.aiMode),
      status: mapSessionStatus(session.status),
      branch: session.branch,
      statusMessage: session.statusMessage,
      terminalSessionId: session.terminalSessionId,
    }));
  }, [activeProjectSessions]);

  // Check if we have any running sessions (sessions with a terminal)
  const hasActiveSessions = activeProjectSessions.some(
    (s) => s.terminalSessionId !== undefined && s.status !== 'disconnected'
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
    console.log(`Session ${sessionId} closed with exit code ${exitCode}`);
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
