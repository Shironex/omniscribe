import { useState, useEffect, useCallback, useMemo } from 'react';
import { TerminalGrid } from './TerminalGrid';
import { useSessionStore } from '../../stores/useSessionStore';
import { useWorkspaceStore, selectActiveTab } from '../../stores/useWorkspaceStore';
import { useGitStore, selectBranches, selectCurrentBranch } from '../../stores/useGitStore';
import { useMcpStore, selectEnabledServers } from '../../stores/useMcpStore';
import { createSession, removeSession } from '../../lib/session';
import { killTerminal } from '../../lib/terminal';
import type { TerminalSession, AIMode } from './TerminalHeader';
import type { PreLaunchSlot } from './PreLaunchCard';
import type { Branch } from '../shared/BranchSelector';
import type { SessionStatus as BackendSessionStatus, AiMode } from '@omniscribe/shared';
import type { SessionStatus as UISessionStatus } from '../shared/StatusLegend';

/**
 * Extended PreLaunchSlot with MCP server IDs
 */
export interface ExtendedPreLaunchSlot extends PreLaunchSlot {
  mcpServers?: string[];
}

/**
 * Maps backend session status to UI session status
 */
function mapSessionStatus(backendStatus: BackendSessionStatus): UISessionStatus {
  switch (backendStatus) {
    case 'idle':
    case 'disconnected':
      return 'idle';
    case 'connecting':
      return 'starting';
    case 'active':
    case 'executing':
      return 'working';
    case 'thinking':
      return 'working';
    case 'paused':
      return 'needsInput';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

/**
 * Maps UI AIMode to backend AiMode
 */
function mapAiModeToBackend(uiMode: AIMode): AiMode {
  switch (uiMode) {
    case 'claude':
      return 'claude';
    case 'gemini':
      return 'gemini';
    case 'codex':
      return 'openai';
    case 'plain':
      return 'local';
    default:
      return 'claude';
  }
}

/**
 * Maps backend AiMode to UI AIMode
 */
function mapAiModeToUI(backendMode: AiMode): AIMode {
  switch (backendMode) {
    case 'claude':
      return 'claude';
    case 'gemini':
      return 'gemini';
    case 'openai':
      return 'codex';
    case 'local':
    case 'custom':
      return 'plain';
    default:
      return 'plain';
  }
}

interface ConnectedTerminalGridProps {
  className?: string;
}

/**
 * ConnectedTerminalGrid - A container component that wires up TerminalGrid
 * to all the necessary stores (Session, Workspace, Git, MCP)
 */
export function ConnectedTerminalGrid({ className }: ConnectedTerminalGridProps) {
  // Local state for pre-launch slots and focus
  const [preLaunchSlots, setPreLaunchSlots] = useState<ExtendedPreLaunchSlot[]>([]);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  // Session store
  const sessions = useSessionStore((state) => state.sessions);
  const initSessionListeners = useSessionStore((state) => state.initListeners);
  const cleanupSessionListeners = useSessionStore((state) => state.cleanupListeners);

  // Workspace store
  const activeTab = useWorkspaceStore(selectActiveTab);
  const activeProjectPath = activeTab?.projectPath ?? null;

  // Git store
  const gitBranches = useGitStore(selectBranches);
  const currentGitBranch = useGitStore(selectCurrentBranch);
  const fetchBranches = useGitStore((state) => state.fetchBranches);
  const fetchCurrentBranch = useGitStore((state) => state.fetchCurrentBranch);
  const setGitProjectPath = useGitStore((state) => state.setProjectPath);
  const initGitListeners = useGitStore((state) => state.initListeners);
  const cleanupGitListeners = useGitStore((state) => state.cleanupListeners);

  // MCP store
  const enabledMcpServers = useMcpStore(selectEnabledServers);
  const discoverServers = useMcpStore((state) => state.discoverServers);
  const initMcpListeners = useMcpStore((state) => state.initListeners);
  const cleanupMcpListeners = useMcpStore((state) => state.cleanupListeners);

  // Current branch name
  const currentBranch = currentGitBranch?.name ?? 'main';

  // Initialize stores on mount
  useEffect(() => {
    initSessionListeners();
    initGitListeners();
    initMcpListeners();
    discoverServers();

    return () => {
      cleanupSessionListeners();
      cleanupGitListeners();
      cleanupMcpListeners();
    };
  }, [
    initSessionListeners,
    cleanupSessionListeners,
    initGitListeners,
    cleanupGitListeners,
    initMcpListeners,
    cleanupMcpListeners,
    discoverServers,
  ]);

  // Fetch git data when active project changes
  useEffect(() => {
    if (activeProjectPath) {
      setGitProjectPath(activeProjectPath);
      fetchBranches(activeProjectPath);
      fetchCurrentBranch(activeProjectPath);
    }
  }, [activeProjectPath, setGitProjectPath, fetchBranches, fetchCurrentBranch]);

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
    // Get enabled MCP server IDs
    const enabledServerIds = enabledMcpServers.map((s) => s.id);

    const newSlot: ExtendedPreLaunchSlot = {
      id: `slot-${Date.now()}`,
      aiMode: 'claude',
      branch: currentBranch,
      mcpServers: enabledServerIds,
    };
    setPreLaunchSlots((prev) => [...prev, newSlot]);
  }, [currentBranch, enabledMcpServers]);

  // Remove pre-launch slot handler
  const handleRemoveSlot = useCallback((slotId: string) => {
    setPreLaunchSlots((prev) => prev.filter((s) => s.id !== slotId));
  }, []);

  // Update pre-launch slot handler
  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch' | 'mcpServers'>>) => {
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
        await createSession(backendAiMode, activeProjectPath, slot.branch, {
          mcpServers: slot.mcpServers,
        });

        // Remove the pre-launch slot
        setPreLaunchSlots((prev) => prev.filter((s) => s.id !== slotId));
      } catch (error) {
        console.error('Failed to launch session:', error);
      }
    },
    [activeProjectPath, preLaunchSlots]
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
  const handleSessionClose = useCallback((sessionId: string, exitCode: number) => {
    console.log(`Session ${sessionId} closed with exit code ${exitCode}`);
    // Session will be removed by the socket event handler
  }, []);

  // Focus session handler
  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
  }, []);

  // Convert extended slots to base PreLaunchSlot for TerminalGrid
  const basePreLaunchSlots: PreLaunchSlot[] = preLaunchSlots.map(({ id, aiMode, branch, mcpServers }) => ({
    id,
    aiMode,
    branch,
    mcpServers,
  }));

  return (
    <TerminalGrid
      sessions={terminalSessions}
      preLaunchSlots={basePreLaunchSlots}
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
