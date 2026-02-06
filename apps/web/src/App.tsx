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
  useAppKeyboardShortcuts,
  useQuickActionExecution,
} from '@/hooks';
import { useUpdateToast } from '@/hooks/useUpdateToast';
import { useTerminalStore, useWorkspaceStore } from '@/stores';

function App() {
  useAppInitialization();
  useUpdateToast();
  useWorkspacePreferences();

  const {
    tabs,
    activeTabId,
    activeProjectPath,
    handleSelectTab,
    handleCloseTab,
    handleNewTab,
    handleSelectDirectory,
  } = useWorkspaceTabs();

  const { branches, currentBranch } = useProjectGit(activeProjectPath);

  const sessionsHookResult = useProjectSessions(activeProjectPath, []);

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

  const {
    terminalSessions,
    activeProjectSessions,
    hasActiveSessions,
    statusCounts,
    focusedSessionId,
    handleFocusSession,
    handleSessionClose,
  } = useProjectSessions(activeProjectPath, preLaunchSlots);

  const sessionOrder = useTerminalStore(state => state.sessionOrder);
  const setSessionOrder = useTerminalStore(state => state.setSessionOrder);

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

  const { handleStopAll, handleKillSession } = useSessionLifecycle(activeProjectSessions);

  useEffect(() => {
    const currentIds = terminalSessions.map(session => session.id);
    const currentIdSet = new Set(currentIds);
    const validOrder = sessionOrder.filter(id => currentIdSet.has(id));
    const newIds = currentIds.filter(id => !sessionOrder.includes(id));

    if (newIds.length > 0 || validOrder.length !== sessionOrder.length) {
      setSessionOrder([...validOrder, ...newIds]);
    }
  }, [terminalSessions, sessionOrder, setSessionOrder]);

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

  const { quickActionsForTerminal, handleQuickAction } = useQuickActionExecution(terminalSessions);

  const workspaceTabs = useWorkspaceStore(state => state.tabs);
  const recentProjects = useMemo(
    () =>
      [...workspaceTabs].sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()),
    [workspaceTabs]
  );

  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  useAppKeyboardShortcuts({
    canLaunch,
    isLaunching,
    hasActiveSessions,
    terminalSessionCount: terminalSessions.length,
    preLaunchSlots,
    launchingSlotIds,
    activeProjectPath,
    handleAddSession,
    handleLaunch,
    handleLaunchSlot,
    handleStopAll,
  });

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      <ProjectTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
      />

      <TopBar currentBranch={currentBranch} statusCounts={statusCounts} />

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

      <BottomBar
        onStopAll={handleStopAll}
        onLaunch={handleLaunch}
        canLaunch={canLaunch}
        isLaunching={isLaunching}
        hasActiveSessions={hasActiveSessions}
      />

      <SettingsModal />
    </div>
  );
}

export default App;
