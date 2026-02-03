import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ProjectTabs,
  TopBar,
  BottomBar,
  Tab,
  StatusCounts,
} from './components';
import { Sidebar } from './components';
import { TerminalGrid, TerminalSession, PreLaunchSlot } from './components/terminal/TerminalGrid';
import { IdleLandingView } from './components/shared/IdleLandingView';
import { SettingsModal } from './components/settings';
import { useSessionStore } from './stores/useSessionStore';
import { useWorkspaceStore } from './stores/useWorkspaceStore';
import { useGitStore } from './stores/useGitStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { connectSocket } from './lib/socket';
import { createSession, removeSession } from './lib/session';
import { killTerminal } from './lib/terminal';
import type { Branch } from './components/shared/BranchSelector';
import type { AIMode } from './components/terminal/TerminalHeader';
import { mapSessionStatus, type AiMode, type UISessionStatus, type Theme } from '@omniscribe/shared';

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
      return 'openai'; // Map codex to openai
    case 'plain':
      return 'local'; // Map plain to local
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
      return 'codex'; // Map openai to codex in UI
    case 'local':
    case 'custom':
      return 'plain'; // Map local/custom to plain
    default:
      return 'plain';
  }
}

function App() {
  // Note: Sidebar and theme state now come from workspace preferences
  // Local state is used as fallback and for immediate UI updates

  // Pre-launch slots state (sessions waiting to be launched)
  const [preLaunchSlots, setPreLaunchSlots] = useState<PreLaunchSlot[]>([]);

  // Focused session state
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  // Session store
  const sessions = useSessionStore((state) => state.sessions);
  const updateSession = useSessionStore((state) => state.updateSession);
  const initSessionListeners = useSessionStore((state) => state.initListeners);
  const cleanupSessionListeners = useSessionStore((state) => state.cleanupListeners);

  // Workspace store
  const workspaceTabs = useWorkspaceStore((state) => state.tabs);
  const activeWorkspaceTabId = useWorkspaceStore((state) => state.activeTabId);
  const workspacePreferences = useWorkspaceStore((state) => state.preferences);
  const openProject = useWorkspaceStore((state) => state.openProject);
  const closeWorkspaceTab = useWorkspaceStore((state) => state.closeTab);
  const selectWorkspaceTab = useWorkspaceStore((state) => state.selectTab);
  const getActiveTab = useWorkspaceStore((state) => state.getActiveTab);
  const initWorkspaceListeners = useWorkspaceStore((state) => state.initListeners);
  const cleanupWorkspaceListeners = useWorkspaceStore((state) => state.cleanupListeners);
  const updatePreference = useWorkspaceStore((state) => state.updatePreference);

  // Settings store
  const settingsTheme = useSettingsStore((state) => state.theme);
  const setSettingsTheme = useSettingsStore((state) => state.setTheme);

  // Git store
  const gitBranches = useGitStore((state) => state.branches);
  const currentGitBranch = useGitStore((state) => state.currentBranch);
  const initGitListeners = useGitStore((state) => state.initListeners);
  const cleanupGitListeners = useGitStore((state) => state.cleanupListeners);
  const fetchBranches = useGitStore((state) => state.fetchBranches);
  const clearGitState = useGitStore((state) => state.clear);

  // Get active project path
  const activeTab = getActiveTab();
  const activeProjectPath = activeTab?.projectPath ?? null;

  // Derive sidebar from workspace preferences
  const sidebarOpen = workspacePreferences.sidebarOpen ?? true;
  const sidebarWidth = workspacePreferences.sidebarWidth ?? 240;

  // Use settings store theme (synced with workspace preferences below)
  const theme = settingsTheme;

  // Track previous project path for change detection
  const prevProjectPathRef = useRef<string | null>(null);

  // Track if initial theme sync from workspace has happened
  const hasInitialThemeSyncRef = useRef(false);

  // Convert workspace tabs to UI tabs format
  const tabs: Tab[] = useMemo(() => {
    return workspaceTabs.map((tab) => {
      // Count sessions for this project
      const projectSessions = sessions.filter((s) => s.projectPath === tab.projectPath);
      const hasActive = projectSessions.some(
        (s) => s.status !== 'idle' && s.status !== 'disconnected'
      );

      return {
        id: tab.id,
        label: tab.name,
        status: hasActive ? ('working' as UISessionStatus) : ('idle' as UISessionStatus),
      };
    });
  }, [workspaceTabs, sessions]);

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

  // Convert git branches to Branch format
  const branches: Branch[] = useMemo(() => {
    return gitBranches.map((b) => ({
      name: b.name,
      isRemote: b.isRemote,
      isCurrent: currentGitBranch?.name === b.name,
    }));
  }, [gitBranches, currentGitBranch]);

  // Current branch name
  const currentBranch = currentGitBranch?.name ?? 'main';

  // Check if we have active sessions
  const hasActiveSessions = activeProjectSessions.some(
    (s) => s.status !== 'idle' && s.status !== 'disconnected'
  );

  // Can launch if we have a project selected and have pre-launch slots or can add more
  const canLaunch = activeProjectPath !== null && preLaunchSlots.length > 0;

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

  // Initialize stores and socket on mount
  useEffect(() => {
    const init = async () => {
      try {
        await connectSocket();
        initSessionListeners();
        initGitListeners();
        initWorkspaceListeners();
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    init();

    return () => {
      cleanupSessionListeners();
      cleanupGitListeners();
      cleanupWorkspaceListeners();
    };
  }, [initSessionListeners, cleanupSessionListeners, initGitListeners, cleanupGitListeners, initWorkspaceListeners, cleanupWorkspaceListeners]);

  // Fetch git data when active project changes
  useEffect(() => {
    const prevProjectPath = prevProjectPathRef.current;
    prevProjectPathRef.current = activeProjectPath;

    // If project path changed, clear old state and fetch new data
    if (activeProjectPath !== prevProjectPath) {
      // Clear old git data first to avoid showing stale branch in top bar
      clearGitState();
      if (activeProjectPath) {
        // Fetch fresh data for the new project
        fetchBranches(activeProjectPath);
      }
    }
  }, [activeProjectPath, clearGitState, fetchBranches]);

  // Get workspace restored state
  const isWorkspaceRestored = useWorkspaceStore((state) => state.isRestored);

  // Sync workspace theme preference with settings store (only on initial load after restore)
  useEffect(() => {
    // Only sync once after workspace state is restored from backend
    if (hasInitialThemeSyncRef.current || !isWorkspaceRestored) {
      return;
    }

    const workspaceTheme = workspacePreferences.theme;
    if (workspaceTheme) {
      hasInitialThemeSyncRef.current = true;
      if (workspaceTheme !== settingsTheme) {
        setSettingsTheme(workspaceTheme as Theme);
      }
    }
  }, [workspacePreferences.theme, settingsTheme, setSettingsTheme, isWorkspaceRestored]);

  // Sync settings theme changes back to workspace preferences
  useEffect(() => {
    // Skip initial sync - only persist user-initiated changes
    if (!hasInitialThemeSyncRef.current) {
      return;
    }

    if (settingsTheme !== workspacePreferences.theme) {
      updatePreference('theme', settingsTheme);
    }
  }, [settingsTheme, workspacePreferences.theme, updatePreference]);

  // Tab handlers
  const handleSelectTab = useCallback((tabId: string) => {
    selectWorkspaceTab(tabId);
  }, [selectWorkspaceTab]);

  const handleCloseTab = useCallback((tabId: string) => {
    closeWorkspaceTab(tabId);
  }, [closeWorkspaceTab]);

  // Directory selection handler
  const handleSelectDirectory = useCallback(async () => {
    if (!window.electronAPI?.dialog) {
      console.warn('Electron dialog API not available');
      return;
    }

    try {
      const selectedPath = await window.electronAPI.dialog.openDirectory();
      if (selectedPath) {
        // Validate the project path if available
        if (window.electronAPI.app?.isValidProject) {
          const result = await window.electronAPI.app.isValidProject(selectedPath);
          if (!result.valid) {
            console.warn('Invalid project:', result.reason);
            // Could show a dialog here
          }
        }

        // Open the project in workspace
        openProject(selectedPath);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  }, [openProject]);

  const handleNewTab = useCallback(() => {
    // For new tab, open directory selector
    handleSelectDirectory();
  }, [handleSelectDirectory]);

  // Sidebar handlers
  const handleToggleSidebar = useCallback(() => {
    updatePreference('sidebarOpen', !sidebarOpen);
  }, [sidebarOpen, updatePreference]);

  const handleSidebarWidthChange = useCallback((width: number) => {
    updatePreference('sidebarWidth', width);
  }, [updatePreference]);

  // Branch handler - fetch fresh branches when clicked
  const handleBranchClick = useCallback(() => {
    if (activeProjectPath) {
      fetchBranches(activeProjectPath);
    }
  }, [activeProjectPath, fetchBranches]);

  // Add session (pre-launch slot) handler
  const handleAddSession = useCallback(() => {
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
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch' | 'mcpServers'>>) => {
      setPreLaunchSlots((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
      );
    },
    []
  );

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

  // Launch a single slot handler
  const handleLaunchSlot = useCallback(
    async (slotId: string) => {
      if (!activeProjectPath) {
        console.warn('No active project to launch session');
        return;
      }

      const slot = preLaunchSlots.find((s) => s.id === slotId);
      if (!slot) return;

      try {
        // Create the session via socket (map UI aiMode to backend AiMode)
        const backendAiMode = mapAiModeToBackend(slot.aiMode);
        const session = await createSession(backendAiMode, activeProjectPath, slot.branch, {
          mcpServers: slot.mcpServers,
        });

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

  // Launch all pre-launch slots
  const handleLaunch = useCallback(async () => {
    for (const slot of preLaunchSlots) {
      await handleLaunchSlot(slot.id);
    }
  }, [preLaunchSlots, handleLaunchSlot]);

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

  // Handle session close from terminal
  const handleSessionClose = useCallback(
    async (sessionId: string, exitCode: number) => {
      console.log(`Session ${sessionId} closed with exit code ${exitCode}`);
      // Session will be removed by the socket event handler
    },
    []
  );

  // Focus session handler
  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
  }, []);

  // Determine whether to show IdleLandingView or TerminalGrid
  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Project tabs / title bar */}
      <ProjectTabs
        tabs={tabs}
        activeTabId={activeWorkspaceTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* Top bar with branch and status */}
      <TopBar
        currentBranch={currentBranch}
        onBranchClick={handleBranchClick}
        statusCounts={statusCounts}
      />

      {/* Main content area with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={!sidebarOpen}
          width={sidebarWidth}
          onWidthChange={handleSidebarWidthChange}
        />

        {/* Main content */}
        <main className="flex-1 flex overflow-hidden bg-background">
          {activeProjectPath ? (
            hasContent ? (
              <TerminalGrid
                sessions={terminalSessions}
                preLaunchSlots={preLaunchSlots}
                branches={branches}
                focusedSessionId={focusedSessionId}
                onFocusSession={handleFocusSession}
                onAddSlot={handleAddSession}
                onRemoveSlot={handleRemoveSlot}
                onUpdateSlot={handleUpdateSlot}
                onLaunch={handleLaunchSlot}
                onKill={handleKillSession}
                onSessionClose={handleSessionClose}
              />
            ) : (
              <IdleLandingView onAddSession={handleAddSession} />
            )
          ) : (
            <IdleLandingView onAddSession={handleSelectDirectory} />
          )}
        </main>
      </div>

      {/* Bottom bar */}
      <BottomBar
        onSelectDirectory={handleSelectDirectory}
        onAddSession={handleAddSession}
        onStopAll={handleStopAll}
        onLaunch={handleLaunch}
        canLaunch={canLaunch}
        hasActiveSessions={hasActiveSessions}
      />

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
}

export default App;
