import { useCallback, useMemo, useEffect } from 'react';
import {
  ProjectTabs,
  TopBar,
  BottomBar,
  TerminalGrid,
  IdleLandingView,
  WelcomeView,
  SettingsModal,
} from '@/components';
import {
  useAppInitialization,
  useWorkspaceTabs,
  useWorkspacePreferences,
  useProjectSessions,
  usePreLaunchSlots,
  useProjectGit,
  useSessionLifecycle,
} from '@/hooks';
import { useQuickActionStore, useWorkspaceStore } from '@/stores';
import { writeToTerminal } from '@/lib/terminal';

function App() {
  // Initialize app (socket and store listeners)
  useAppInitialization();

  // Theme synchronization between project tabs and settings
  useWorkspacePreferences();

  // Workspace tabs (must come first as other hooks depend on activeProjectPath)
  const {
    tabs,
    activeTabId,
    activeProjectPath,
    handleSelectTab,
    handleCloseTab,
    handleNewTab,
    handleSelectDirectory,
  } = useWorkspaceTabs();

  // Project git (branches and MCP discovery on project change)
  const { branches, currentBranch } = useProjectGit(activeProjectPath);

  // Pre-launch slots (needs currentBranch from git hook)
  // Note: updateSession is passed from sessions hook, but we need to call useProjectSessions first
  // to get it, so we use a two-phase approach with a temporary placeholder
  const sessionsHookResult = useProjectSessions(activeProjectPath, []);

  // Now create pre-launch slots with the updateSession function
  const {
    preLaunchSlots,
    canLaunch,
    isLaunching,
    launchingSlotIds,
    handleAddSession,
    handleRemoveSlot,
    handleUpdateSlot,
    handleLaunchSlot,
    handleLaunch,
  } = usePreLaunchSlots(activeProjectPath, currentBranch, sessionsHookResult.updateSession);

  // Re-call project sessions with actual preLaunchSlots for accurate status counts
  const {
    terminalSessions,
    activeProjectSessions,
    hasActiveSessions,
    statusCounts,
    focusedSessionId,
    handleFocusSession,
    handleSessionClose,
  } = useProjectSessions(activeProjectPath, preLaunchSlots);

  // Session lifecycle (stop all, kill session)
  const { handleStopAll, handleKillSession } = useSessionLifecycle(activeProjectSessions);

  // Quick actions - use raw actions and filter with useMemo to avoid infinite loop
  const allQuickActions = useQuickActionStore((state) => state.actions);
  const quickActions = useMemo(() =>
    allQuickActions.filter((a) => a.enabled !== false),
    [allQuickActions]
  );

  // Quick actions for terminal header dropdown (with icon and category)
  const quickActionsForTerminal = useMemo(() =>
    quickActions.map(a => ({ id: a.id, label: a.title, icon: a.icon, category: a.category })),
    [quickActions]
  );

  // Handle quick action execution (writes command to terminal)
  const handleQuickAction = useCallback((sessionId: string, actionId: string) => {
    const action = quickActions.find(a => a.id === actionId);
    if (!action) return;

    // Find the session to get terminalSessionId
    const session = terminalSessions.find(s => s.id === sessionId);
    if (!session?.terminalSessionId) {
      console.warn('[App] No terminal session for quick action');
      return;
    }

    // Build command based on handler type
    const params = action.params ?? {};
    let command = '';
    if (action.handler === 'terminal:execute' || action.handler === 'shell') {
      command = String(params.command ?? params.cmd ?? '');
    } else if (action.handler === 'script') {
      command = String(params.path ?? params.script ?? '');
    } else {
      // For other handlers, use command param or action id
      command = String(params.command ?? params.cmd ?? action.id);
    }

    if (command) {
      writeToTerminal(session.terminalSessionId, command + '\n');
    }
  }, [quickActions, terminalSessions]);

  // Recent projects for welcome view (sorted by last accessed)
  const workspaceTabs = useWorkspaceStore((state) => state.tabs);
  const recentProjects = useMemo(
    () => [...workspaceTabs].sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()),
    [workspaceTabs]
  );

  // Determine whether to show IdleLandingView or TerminalGrid
  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  // Keyboard shortcuts for session management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const key = e.key.toLowerCase();
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K - Kill all sessions (works even when typing)
      if (isMod && key === 'k' && hasActiveSessions) {
        e.preventDefault();
        handleStopAll();
        return;
      }

      // Below shortcuts only work when not typing and no modifier keys
      if (isTyping || isMod || e.altKey) {
        return;
      }

      // N - Add new session slot (max 6)
      const canAddMore = terminalSessions.length + preLaunchSlots.length < 6;
      if (key === 'n' && canAddMore && activeProjectPath) {
        e.preventDefault();
        handleAddSession();
        return;
      }

      // L - Launch all pre-launch slots
      if (key === 'l' && canLaunch && !isLaunching) {
        e.preventDefault();
        handleLaunch();
        return;
      }

      // 1-6 - Launch individual slot by index
      if (/^[1-6]$/.test(key)) {
        const index = parseInt(key, 10) - 1;
        if (index < preLaunchSlots.length) {
          e.preventDefault();
          const slot = preLaunchSlots[index];
          if (!launchingSlotIds?.has(slot.id)) {
            handleLaunchSlot(slot.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canLaunch, isLaunching, hasActiveSessions, terminalSessions.length, preLaunchSlots, launchingSlotIds, activeProjectPath, handleAddSession, handleLaunch, handleLaunchSlot, handleStopAll]);

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Project tabs / title bar */}
      <ProjectTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
      />

      {/* Top bar with branch and status */}
      <TopBar
        currentBranch={currentBranch}
        statusCounts={statusCounts}
      />

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden bg-background">
        {activeProjectPath ? (
          hasContent ? (
            <TerminalGrid
              sessions={terminalSessions}
              preLaunchSlots={preLaunchSlots}
              launchingSlotIds={launchingSlotIds}
              branches={branches}
              quickActions={quickActionsForTerminal}
              focusedSessionId={focusedSessionId}
              onFocusSession={handleFocusSession}
              onAddSlot={handleAddSession}
              onRemoveSlot={handleRemoveSlot}
              onUpdateSlot={handleUpdateSlot}
              onLaunch={handleLaunchSlot}
              onKill={handleKillSession}
              onSessionClose={handleSessionClose}
              onQuickAction={handleQuickAction}
            />
          ) : (
            <IdleLandingView onAddSession={handleAddSession} />
          )
        ) : (
          <WelcomeView
            recentProjects={recentProjects}
            onOpenProject={handleSelectDirectory}
            onSelectProject={handleSelectTab}
          />
        )}
      </main>

      {/* Bottom bar */}
      <BottomBar
        onStopAll={handleStopAll}
        onLaunch={handleLaunch}
        canLaunch={canLaunch}
        isLaunching={isLaunching}
        hasActiveSessions={hasActiveSessions}
      />

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
}

export default App;
