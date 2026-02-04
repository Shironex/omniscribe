import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TerminalGrid } from './TerminalGrid';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import { useGitStore, selectBranches, selectCurrentBranch } from '@/stores/useGitStore';
import { useTerminalControlStore } from '@/stores/useTerminalControlStore';
import { createSession, removeSession } from '@/lib/session';
import { killTerminal } from '@/lib/terminal';
import { mapAiModeToBackend, mapAiModeToUI } from '@/lib/aiMode';
import type { TerminalSession } from './TerminalHeader';
import type { PreLaunchSlot } from './PreLaunchBar';
import type { Branch } from '@/components/shared/BranchSelector';
import { mapSessionStatus } from '@omniscribe/shared';

interface ConnectedTerminalGridProps {
  className?: string;
}

/**
 * ConnectedTerminalGrid - A container component that wires up TerminalGrid
 * to all the necessary stores (Session, Workspace, Git)
 */
export function ConnectedTerminalGrid({ className }: ConnectedTerminalGridProps) {
  // Local state for pre-launch slots
  const [preLaunchSlots, setPreLaunchSlots] = useState<PreLaunchSlot[]>([]);

  // Shared terminal control store for focus state
  const focusedSessionId = useTerminalControlStore((state) => state.focusedSessionId);
  const setFocusedSessionId = useTerminalControlStore((state) => state.setFocusedSessionId);
  const addSlotRequestCounter = useTerminalControlStore((state) => state.addSlotRequestCounter);
  const prevAddSlotRequestRef = useRef(addSlotRequestCounter);

  // Session store
  const sessions = useSessionStore((state) => state.sessions);
  const updateSession = useSessionStore((state) => state.updateSession);

  // Workspace store
  const activeTab = useWorkspaceStore(selectActiveTab);
  const activeProjectPath = activeTab?.projectPath ?? null;

  // Git store
  const gitBranches = useGitStore(selectBranches);
  const currentGitBranch = useGitStore(selectCurrentBranch);
  const fetchBranches = useGitStore((state) => state.fetchBranches);
  const setGitProjectPath = useGitStore((state) => state.setProjectPath);

  // Current branch name
  const currentBranch = currentGitBranch?.name ?? 'main';

  // Note: Store listeners are initialized centrally in useAppInitialization

  // Fetch git data when active project changes
  useEffect(() => {
    if (activeProjectPath) {
      setGitProjectPath(activeProjectPath);
      fetchBranches(activeProjectPath);
    }
  }, [activeProjectPath, setGitProjectPath, fetchBranches]);

  // Listen for add slot requests from sidebar (via shared store)
  useEffect(() => {
    if (addSlotRequestCounter > prevAddSlotRequestRef.current) {
      const newSlot: PreLaunchSlot = {
        id: `slot-${Date.now()}`,
        aiMode: 'claude',
        branch: currentBranch,
      };
      setPreLaunchSlots((prev) => [...prev, newSlot]);
    }
    prevAddSlotRequestRef.current = addSlotRequestCounter;
  }, [addSlotRequestCounter, currentBranch]);

  // Filter sessions for the active project
  const activeProjectSessions = useMemo(() => {
    if (!activeProjectPath) return [];
    return sessions.filter((s) => s.projectPath === activeProjectPath);
  }, [sessions, activeProjectPath]);

  // Convert sessions to TerminalSession format
  const terminalSessions: TerminalSession[] = useMemo(() => {
    return activeProjectSessions.map((session, index) => ({
      id: session.id,
      sessionNumber: index + 1,
      aiMode: mapAiModeToUI(session.aiMode),
      status: mapSessionStatus(session.status),
      branch: session.branch,
      statusMessage: session.statusMessage,
      terminalSessionId: session.terminalSessionId,
      worktreePath: session.worktreePath,
    }));
  }, [activeProjectSessions]);

  // Convert git branches to Branch format
  const branches: Branch[] = useMemo(() => {
    return gitBranches.map((b) => ({
      name: b.name,
      isRemote: b.isRemote,
      isCurrent: currentGitBranch?.name === b.name,
    }));
  }, [gitBranches, currentGitBranch]);

  // Add session (pre-launch slot) handler
  const handleAddSlot = useCallback(() => {
    const newSlot: PreLaunchSlot = {
      id: `slot-${Date.now()}`,
      aiMode: 'claude',
      branch: currentBranch,
    };
    setPreLaunchSlots((prev) => [...prev, newSlot]);
  }, [currentBranch]);

  // Remove pre-launch slot handler
  const handleRemoveSlot = useCallback((slotId: string) => {
    setPreLaunchSlots((prev) => prev.filter((s) => s.id !== slotId));
  }, []);

  // Update pre-launch slot handler
  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => {
      setPreLaunchSlots((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
      );
    },
    []
  );

  // Launch a single slot handler
  const handleLaunch = useCallback(
    async (slotId: string) => {
      if (!activeProjectPath) {
        console.warn('No active project to launch session');
        return;
      }

      const slot = preLaunchSlots.find((s) => s.id === slotId);
      if (!slot) return;

      try {
        // Create the session via socket
        const backendAiMode = mapAiModeToBackend(slot.aiMode);
        const session = await createSession(backendAiMode, activeProjectPath, slot.branch);

        // The session:created event arrives before terminalSessionId is set,
        // so we update the store with the complete session from the response
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }

        // Remove the pre-launch slot
        setPreLaunchSlots((prev) => prev.filter((s) => s.id !== slotId));
      } catch (error) {
        console.error('Failed to launch session:', error);
      }
    },
    [activeProjectPath, preLaunchSlots, updateSession]
  );

  // Kill a session handler
  const handleKill = useCallback(async (sessionId: string) => {
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

  // Handle session close from terminal
  const handleSessionClose = useCallback((_sessionId: string, _exitCode: number) => {
    // Session will be removed by the socket event handler
  }, []);

  // Focus session handler
  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
  }, [setFocusedSessionId]);

  return (
    <TerminalGrid
      sessions={terminalSessions}
      preLaunchSlots={preLaunchSlots}
      branches={branches}
      focusedSessionId={focusedSessionId}
      onFocusSession={handleFocusSession}
      onAddSlot={handleAddSlot}
      onRemoveSlot={handleRemoveSlot}
      onUpdateSlot={handleUpdateSlot}
      onLaunch={handleLaunch}
      onKill={handleKill}
      onSessionClose={handleSessionClose}
      className={className}
    />
  );
}
