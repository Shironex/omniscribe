import { useCallback, useMemo, useEffect, useState } from 'react';
import {
  TopBar,
  TerminalGrid,
  IdleLandingView,
  WelcomeView,
  SettingsModal,
  LaunchPresetsModal,
  SessionHistoryPanel,
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
  useDefaultAiMode,
} from '@/hooks';
import { useUpdateToast } from '@/hooks/useUpdateToast';
import { useTerminalStore, useWorkspaceStore } from '@/stores';
import { resumeSession } from '@/lib/session';
import { toast } from 'sonner';

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
    handleBatchAddSessions,
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

  // Launch presets modal state
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const handleOpenLaunchModal = useCallback(() => setIsLaunchModalOpen(true), []);

  // Session history panel state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const handleToggleHistory = useCallback(() => setIsHistoryOpen(prev => !prev), []);

  // Default AI mode for modal
  const { defaultAiMode, claudeAvailable } = useDefaultAiMode();

  // Resume session handler
  const handleResume = useCallback(
    async (sessionId: string) => {
      const session = sessionsHookResult.sessions.find(s => s.id === sessionId);
      if (!session?.claudeSessionId || !activeProjectPath) return;
      try {
        const resumed = await resumeSession(
          session.claudeSessionId,
          activeProjectPath,
          session.branch
        );
        if (resumed.terminalSessionId !== undefined) {
          sessionsHookResult.updateSession(resumed.id, {
            terminalSessionId: resumed.terminalSessionId,
          });
        }
        toast.success('Session resumed');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to resume';
        toast.error(msg);
      }
    },
    [sessionsHookResult, activeProjectPath]
  );

  useAppKeyboardShortcuts({
    canLaunch,
    isLaunching,
    hasActiveSessions,
    terminalSessionCount: terminalSessions.length,
    preLaunchSlots,
    launchingSlotIds,
    activeProjectPath,
    handleAddSession,
    handleOpenLaunchModal,
    handleLaunch,
    handleLaunchSlot,
    handleStopAll,
  });

  return (
    <div
      data-testid="app-ready"
      className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden"
    >
      <TopBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        currentBranch={currentBranch}
        statusCounts={statusCounts}
        onAddSlot={handleAddSession}
        onOpenLaunchModal={handleOpenLaunchModal}
        hasActiveProject={!!activeProjectPath}
        sessionCount={terminalSessions.length}
        preLaunchSlotCount={preLaunchSlots.length}
        onStopAll={handleStopAll}
        onLaunch={handleLaunch}
        canLaunch={canLaunch}
        isLaunching={isLaunching}
        hasActiveSessions={hasActiveSessions}
        onToggleHistory={handleToggleHistory}
        isHistoryOpen={isHistoryOpen}
      />

      <main className="flex-1 flex overflow-hidden bg-background">
        {/* Main content area */}
        <div className="flex-1 min-w-0">
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
                onOpenLaunchModal={handleOpenLaunchModal}
                onRemoveSlot={handleRemoveSlot}
                onUpdateSlot={handleUpdateSlot}
                onLaunch={handleLaunchSlot}
                onKill={handleKillSession}
                onSessionClose={handleSessionClose}
                onQuickAction={handleQuickAction}
                onResume={handleResume}
                onReorderSessions={handleReorderSessions}
              />
            ) : (
              <IdleLandingView
                onAddSession={handleAddSession}
                onOpenLaunchModal={handleOpenLaunchModal}
              />
            )
          ) : (
            <WelcomeView
              recentProjects={recentProjects}
              onOpenProject={handleSelectDirectory}
              onSelectProject={handleSelectTab}
            />
          )}
        </div>

        {/* Session History Panel */}
        <SessionHistoryPanel
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          projectPath={activeProjectPath}
        />
      </main>

      <SettingsModal />

      <LaunchPresetsModal
        open={isLaunchModalOpen}
        onOpenChange={setIsLaunchModalOpen}
        branches={branches}
        claudeAvailable={claudeAvailable}
        currentBranch={currentBranch}
        defaultAiMode={defaultAiMode}
        existingSessionCount={terminalSessions.length}
        onCreateSessions={handleBatchAddSessions}
      />
    </div>
  );
}

export default App;
