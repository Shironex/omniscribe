import { useCallback, useMemo, useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('App');
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
import { useUpdateToast } from '@/hooks/useUpdateToast';
import { useQuickActionStore, useTerminalControlStore, useWorkspaceStore } from '@/stores';
import { writeToTerminal } from '@/lib/terminal';
import { PRELAUNCH_SHORTCUT_KEYS } from '@/lib/prelaunch-shortcuts';

/**
 * Root application component that composes workspace tabs, project controls, terminal grid, and global UI.
 *
 * Renders project navigation, top and bottom bars, the main content area (welcome view, idle landing, or terminal grid),
 * and global modals and listeners for workspace initialization, preferences, quick actions, sessions, and keyboard shortcuts.
 *
 * @returns The root application UI as a JSX element
 */
function App() {
  // Initialize app (socket and store listeners)
  useAppInitialization();

  // Toast notifications for auto-update events
  useUpdateToast();

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

  // Session ordering for drag/drop
  const sessionOrder = useTerminalControlStore(state => state.sessionOrder);
  const setSessionOrder = useTerminalControlStore(state => state.setSessionOrder);

  const orderedTerminalSessions = useMemo(() => {
    if (sessionOrder.length === 0) {
      return terminalSessions;
    }

    const orderMap = new Map(sessionOrder.map((id, idx) => [id, idx]));
    return [...terminalSessions].sort((a, b) => {
      const aIndex = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }, [terminalSessions, sessionOrder]);

  // Session lifecycle (stop all, kill session)
  const { handleStopAll, handleKillSession } = useSessionLifecycle(activeProjectSessions);

  // Keep persisted order synced with current sessions
  useEffect(() => {
    const currentIds = orderedTerminalSessions.map(session => session.id);
    const currentIdSet = new Set(currentIds);
    const validOrder = sessionOrder.filter(id => currentIdSet.has(id));
    const newIds = currentIds.filter(id => !sessionOrder.includes(id));

    if (newIds.length > 0 || validOrder.length !== sessionOrder.length) {
      setSessionOrder([...validOrder, ...newIds]);
    }
  }, [orderedTerminalSessions, sessionOrder, setSessionOrder]);

  const handleReorderSessions = useCallback(
    (activeId: string, overId: string) => {
      const currentOrder = orderedTerminalSessions.map(session => session.id);
      const oldIndex = currentOrder.indexOf(activeId);
      const newIndex = currentOrder.indexOf(overId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const nextOrder = [...currentOrder];
      const temp = nextOrder[oldIndex];
      nextOrder[oldIndex] = nextOrder[newIndex];
      nextOrder[newIndex] = temp;
      setSessionOrder(nextOrder);
    },
    [orderedTerminalSessions, setSessionOrder]
  );

  // Quick actions - use raw actions and filter with useMemo to avoid infinite loop
  const allQuickActions = useQuickActionStore(state => state.actions);
  const quickActions = useMemo(
    () => allQuickActions.filter(a => a.enabled !== false),
    [allQuickActions]
  );

  // Quick actions for terminal header dropdown (with icon and category)
  const quickActionsForTerminal = useMemo(
    () => quickActions.map(a => ({ id: a.id, label: a.title, icon: a.icon, category: a.category })),
    [quickActions]
  );

  // Handle quick action execution (writes command to terminal)
  const handleQuickAction = useCallback(
    (sessionId: string, actionId: string) => {
      const action = quickActions.find(a => a.id === actionId);
      if (!action) return;

      // Find the session to get terminalSessionId
      const session = terminalSessions.find(s => s.id === sessionId);
      if (!session?.terminalSessionId) {
        logger.warn('No terminal session for quick action');
        return;
      }

      logger.debug('Executing quick action', actionId, 'on session', sessionId);

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
    },
    [quickActions, terminalSessions]
  );

  // Recent projects for welcome view (sorted by last accessed)
  const workspaceTabs = useWorkspaceStore(state => state.tabs);
  const recentProjects = useMemo(
    () =>
      [...workspaceTabs].sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()),
    [workspaceTabs]
  );

  // Determine whether to show IdleLandingView or TerminalGrid
  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  // Keyboard shortcuts for session management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

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

      // N - Add new session slot (max 12)
      const canAddMore = terminalSessions.length + preLaunchSlots.length < 12;
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

      // Launch individual slot by assigned shortcut key
      if (PRELAUNCH_SHORTCUT_KEYS.includes(key)) {
        e.preventDefault();
        const slot = preLaunchSlots.find(candidate => candidate.shortcutKey === key);
        if (slot && !launchingSlotIds?.has(slot.id)) {
          handleLaunchSlot(slot.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canLaunch,
    isLaunching,
    hasActiveSessions,
    terminalSessions.length,
    preLaunchSlots,
    launchingSlotIds,
    activeProjectPath,
    handleAddSession,
    handleLaunch,
    handleLaunchSlot,
    handleStopAll,
  ]);

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
      <TopBar currentBranch={currentBranch} statusCounts={statusCounts} />

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden bg-background">
        {activeProjectPath ? (
          hasContent ? (
            <TerminalGrid
              sessions={orderedTerminalSessions}
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
              onReorderSessions={handleReorderSessions}
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
