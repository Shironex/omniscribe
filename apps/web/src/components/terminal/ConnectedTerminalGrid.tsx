import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { createLogger, DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';

const logger = createLogger('TerminalGrid');
import { TerminalGrid } from './TerminalGrid';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import { useGitStore, selectBranches, selectCurrentBranch } from '@/stores/useGitStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { createSession, removeSession } from '@/lib/session';
import { killTerminal } from '@/lib/terminal';
import { mapAiModeToBackend, mapAiModeToUI } from '@/lib/aiMode';

import { getNextAvailablePrelaunchShortcut } from '@/lib/prelaunch-shortcuts';
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
  const focusedSessionId = useTerminalStore(state => state.focusedSessionId);
  const setFocusedSessionId = useTerminalStore(state => state.setFocusedSessionId);
  const addSlotRequestCounter = useTerminalStore(state => state.addSlotRequestCounter);
  const prevAddSlotRequestRef = useRef(addSlotRequestCounter);
  const sessionOrder = useTerminalStore(state => state.sessionOrder);
  const setSessionOrder = useTerminalStore(state => state.setSessionOrder);
  const reorderSessions = useTerminalStore(state => state.reorderSessions);

  // Session store
  const sessions = useSessionStore(state => state.sessions);
  const updateSession = useSessionStore(state => state.updateSession);

  // Workspace store
  const activeTab = useWorkspaceStore(selectActiveTab);
  const activeProjectPath = activeTab?.projectPath ?? null;

  // Read Claude CLI status from settings store
  const claudeCliStatus = useSettingsStore(state => state.claudeCliStatus);

  // Read configured default AI mode from workspace preferences
  const configuredDefaultAiMode = useWorkspaceStore(
    state => state.preferences.session?.defaultMode ?? DEFAULT_SESSION_SETTINGS.defaultMode
  );

  // Fall back to 'plain' when CLI status unknown (null) or not installed
  const defaultAiMode = claudeCliStatus?.installed ? configuredDefaultAiMode : 'plain';

  // Git store
  const gitBranches = useGitStore(selectBranches);
  const currentGitBranch = useGitStore(selectCurrentBranch);
  const fetchBranches = useGitStore(state => state.fetchBranches);
  const setGitProjectPath = useGitStore(state => state.setProjectPath);

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
      setPreLaunchSlots(prev => {
        const shortcutKey = getNextAvailablePrelaunchShortcut(prev.map(slot => slot.shortcutKey));
        if (!shortcutKey) return prev;

        const newSlot: PreLaunchSlot = {
          id: `slot-${Date.now()}`,
          aiMode: defaultAiMode,
          branch: currentBranch,
          shortcutKey,
        };

        return [...prev, newSlot];
      });
    }
    prevAddSlotRequestRef.current = addSlotRequestCounter;
  }, [addSlotRequestCounter, currentBranch, defaultAiMode]);

  // Filter sessions for the active project
  const activeProjectSessions = useMemo(() => {
    if (!activeProjectPath) return [];
    return sessions.filter(s => s.projectPath === activeProjectPath);
  }, [sessions, activeProjectPath]);

  // Convert sessions to TerminalSession format and apply ordering
  const terminalSessions: TerminalSession[] = useMemo(() => {
    const mapped = activeProjectSessions.map((session, index) => ({
      id: session.id,
      sessionNumber: index + 1,
      aiMode: mapAiModeToUI(session.aiMode),
      status: mapSessionStatus(session.status),
      branch: session.branch,
      statusMessage: session.statusMessage,
      terminalSessionId: session.terminalSessionId,
      worktreePath: session.worktreePath,
    }));

    // Apply custom ordering if available
    if (sessionOrder.length > 0) {
      const orderMap = new Map(sessionOrder.map((id, idx) => [id, idx]));
      return [...mapped].sort((a, b) => {
        const aIdx = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      });
    }

    return mapped;
  }, [activeProjectSessions, sessionOrder]);

  // Sync session order when sessions change
  useEffect(() => {
    const currentIds = terminalSessions.map(s => s.id);
    const currentOrderSet = new Set(sessionOrder);
    const currentIdsSet = new Set(currentIds);

    // Add new sessions not in order
    const newIds = currentIds.filter(id => !currentOrderSet.has(id));
    // Remove stale sessions from order
    const validOrder = sessionOrder.filter(id => currentIdsSet.has(id));

    if (newIds.length > 0 || validOrder.length !== sessionOrder.length) {
      setSessionOrder([...validOrder, ...newIds]);
    }
  }, [terminalSessions, sessionOrder, setSessionOrder]);

  // Convert git branches to Branch format
  const branches: Branch[] = useMemo(() => {
    return gitBranches.map(b => ({
      name: b.name,
      isRemote: b.isRemote,
      isCurrent: currentGitBranch?.name === b.name,
    }));
  }, [gitBranches, currentGitBranch]);

  // Add session (pre-launch slot) handler
  const handleAddSlot = useCallback(() => {
    setPreLaunchSlots(prev => {
      const shortcutKey = getNextAvailablePrelaunchShortcut(prev.map(slot => slot.shortcutKey));
      if (!shortcutKey) return prev;

      const newSlot: PreLaunchSlot = {
        id: `slot-${Date.now()}`,
        aiMode: defaultAiMode,
        branch: currentBranch,
        shortcutKey,
      };

      return [...prev, newSlot];
    });
  }, [currentBranch, defaultAiMode]);

  // Remove pre-launch slot handler
  const handleRemoveSlot = useCallback((slotId: string) => {
    setPreLaunchSlots(prev => prev.filter(s => s.id !== slotId));
  }, []);

  // Update pre-launch slot handler
  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => {
      setPreLaunchSlots(prev =>
        prev.map(slot => (slot.id === slotId ? { ...slot, ...updates } : slot))
      );
    },
    []
  );

  // Launch a single slot handler
  const handleLaunch = useCallback(
    async (slotId: string) => {
      if (!activeProjectPath) {
        logger.warn('No active project to launch session');
        return;
      }

      const slot = preLaunchSlots.find(s => s.id === slotId);
      if (!slot) return;

      try {
        logger.info('Launching session for slot', slotId);
        // Create the session via socket
        const backendAiMode = mapAiModeToBackend(slot.aiMode);
        const session = await createSession(backendAiMode, activeProjectPath, slot.branch);

        // The session:created event arrives before terminalSessionId is set,
        // so we update the store with the complete session from the response
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }

        // Remove the pre-launch slot
        setPreLaunchSlots(prev => prev.filter(s => s.id !== slotId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to launch session';
        logger.error('Failed to launch session:', error);
        toast.error(message);
      }
    },
    [activeProjectPath, preLaunchSlots, updateSession]
  );

  // Kill a session handler
  const handleKill = useCallback(
    async (sessionId: string) => {
      logger.info('Killing session', sessionId);
      try {
        const session = sessions.find(s => s.id === sessionId);
        if (session?.terminalSessionId !== undefined) {
          killTerminal(session.terminalSessionId);
        }
        await removeSession(sessionId);
      } catch (error) {
        logger.error('Failed to kill session', sessionId, error);
      }
    },
    [sessions]
  );

  // Handle session close from terminal
  const handleSessionClose = useCallback((_sessionId: string, _exitCode: number) => {
    // Session will be removed by the socket event handler
  }, []);

  // Focus session handler
  const handleFocusSession = useCallback(
    (sessionId: string) => {
      setFocusedSessionId(sessionId);
    },
    [setFocusedSessionId]
  );

  // Reorder handler
  const handleReorderSessions = useCallback(
    (activeId: string, overId: string) => {
      reorderSessions(activeId, overId);
    },
    [reorderSessions]
  );

  return (
    <TerminalGrid
      sessions={terminalSessions}
      preLaunchSlots={preLaunchSlots}
      branches={branches}
      claudeAvailable={claudeCliStatus?.installed ?? false}
      focusedSessionId={focusedSessionId}
      onFocusSession={handleFocusSession}
      onAddSlot={handleAddSlot}
      onRemoveSlot={handleRemoveSlot}
      onUpdateSlot={handleUpdateSlot}
      onLaunch={handleLaunch}
      onKill={handleKill}
      onSessionClose={handleSessionClose}
      onReorderSessions={handleReorderSessions}
      className={className}
    />
  );
}
