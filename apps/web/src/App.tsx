import { lazy, Suspense, useCallback, useMemo, useEffect, useState } from 'react';
import { TopBar } from '@/components/shared/TopBar';
import { IdleLandingView } from '@/components/shared/IdleLandingView';
import { WelcomeView } from '@/components/shared/WelcomeView';
import { PersistentProjectGrid } from '@/components/terminal/PersistentProjectGrid';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import { useWorkspaceTabs } from '@/hooks/useWorkspaceTabs';
import { useWorkspacePreferences } from '@/hooks/useWorkspacePreferences';
import { useProjectSessions } from '@/hooks/useProjectSessions';
import { usePreLaunchSlots } from '@/hooks/usePreLaunchSlots';
import { useProjectGit } from '@/hooks/useProjectGit';
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle';
import { useAppKeyboardShortcuts } from '@/hooks/useAppKeyboardShortcuts';
import { useQuickActionExecution } from '@/hooks/useQuickActionExecution';
import { useDefaultAiMode } from '@/hooks/useDefaultAiMode';
import { useUpdateToast } from '@/hooks/useUpdateToast';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { resumeSession } from '@/lib/session';
import { extractErrorMessage, DEFAULT_WORKTREE_SETTINGS, EDITOR_OPTIONS } from '@omniscribe/shared';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import { cn } from '@/lib/utils';

const SettingsModal = lazy(() =>
  import('@/components/settings/SettingsModal').then(m => ({ default: m.SettingsModal }))
);
const LaunchPresetsModal = lazy(() =>
  import('@/components/terminal/LaunchPresetsModal').then(m => ({
    default: m.LaunchPresetsModal,
  }))
);
const SessionHistoryPanel = lazy(() =>
  import('@/components/shared/SessionHistoryPanel').then(m => ({
    default: m.SessionHistoryPanel,
  }))
);

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
    handleReorderTabs,
  } = useWorkspaceTabs();

  const { branches, currentBranch } = useProjectGit(activeProjectPath);

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
  } = usePreLaunchSlots(activeProjectPath, currentBranch);

  const {
    terminalSessions,
    activeProjectSessions,
    hasActiveSessions,
    statusCounts,
    handleSessionClose,
  } = useProjectSessions(activeProjectPath, preLaunchSlots);

  // Stable store action for handleResume (no need for a second hook call)
  const updateSession = useSessionStore(state => state.updateSession);

  // Session order reconciliation — use ALL sessions to preserve order across tab switches
  const allSessions = useSessionStore(state => state.sessions);
  const setSessionOrder = useTerminalStore(state => state.setSessionOrder);

  useEffect(() => {
    const currentOrder = useTerminalStore.getState().sessionOrder;
    const allIds = allSessions.map(session => session.id);
    const allIdSet = new Set(allIds);
    const validOrder = currentOrder.filter(id => allIdSet.has(id));
    const newIds = allIds.filter(id => !currentOrder.includes(id));

    if (newIds.length > 0 || validOrder.length !== currentOrder.length) {
      setSessionOrder([...validOrder, ...newIds]);
    }
  }, [allSessions, setSessionOrder]);

  const { handleStopAll, handleKillSession } = useSessionLifecycle(activeProjectSessions);

  const { quickActionsForTerminal, handleQuickAction } = useQuickActionExecution(terminalSessions);

  const workspaceTabs = useWorkspaceStore(state => state.tabs);
  const recentProjects = useMemo(
    () =>
      [...workspaceTabs].sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()),
    [workspaceTabs]
  );

  // Unique project paths that need a persistent grid (sessions or pre-launch slots)
  const projectPathsWithGrids = useMemo(() => {
    const paths = new Set<string>();
    for (const session of allSessions) {
      paths.add(session.projectPath);
    }
    // Include active project when it has pre-launch slots (before any sessions exist)
    if (activeProjectPath && preLaunchSlots.length > 0) {
      paths.add(activeProjectPath);
    }
    return [...paths];
  }, [allSessions, activeProjectPath, preLaunchSlots.length]);

  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  // Launch presets modal state
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const handleOpenLaunchModal = useCallback(() => setIsLaunchModalOpen(true), []);

  // Session history panel state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const handleToggleHistory = useCallback(() => setIsHistoryOpen(prev => !prev), []);

  // Settings modal open state (for lazy-load gating)
  const isSettingsOpen = useSettingsStore(state => state.isOpen);

  // Toggle settings modal
  const handleToggleSettings = useCallback(() => {
    const { isOpen, openSettings, closeSettings } = useSettingsStore.getState();
    if (isOpen) {
      closeSettings();
    } else {
      openSettings();
    }
  }, []);

  // Close current tab
  const handleCloseCurrentTab = useCallback(() => {
    if (activeTabId) {
      handleCloseTab(activeTabId);
    }
  }, [activeTabId, handleCloseTab]);

  // Switch tab by index
  const handleSelectTabByIndex = useCallback(
    (index: number) => {
      const { tabs: currentTabs } = useWorkspaceStore.getState();
      if (index >= 0 && index < currentTabs.length) {
        handleSelectTab(currentTabs[index].id);
      }
    },
    [handleSelectTab]
  );

  // Default AI mode for modal
  const { defaultAiMode, claudeAvailable } = useDefaultAiMode();

  // Worktree mode (for conditional branch selector visibility)
  const worktreeMode = useWorkspaceStore(
    state => (state.preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS).mode
  );

  // Resume session handler
  const handleResume = useCallback(
    async (sessionId: string) => {
      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
      if (!session?.claudeSessionId || !session.projectPath) return;
      try {
        const resumed = await resumeSession(
          session.claudeSessionId,
          session.projectPath,
          session.branch
        );
        if (resumed.terminalSessionId !== undefined) {
          updateSession(resumed.id, {
            terminalSessionId: resumed.terminalSessionId,
          });
        }
        toast.success('Session resumed');
      } catch (error) {
        const msg = extractErrorMessage(error, 'Failed to resume');
        toast.error(msg);
      }
    },
    [updateSession]
  );

  // Open in editor handler
  const handleOpenInEditor = useCallback(
    async (sessionId: string) => {
      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
      const folderPath = session?.worktreePath ?? activeProjectPath;
      if (!folderPath) {
        toast.error('No project path available');
        return;
      }

      const editorProtocol = useTerminalStore.getState().editorProtocol;
      const editor = EDITOR_OPTIONS.find(e => e.id === editorProtocol);
      if (!editor) {
        toast.error('No editor configured. Set one in Settings → Terminal.');
        return;
      }

      try {
        await window.electronAPI?.app?.openInEditor(editorProtocol, folderPath);
      } catch (error) {
        const msg = extractErrorMessage(error, 'Failed to open in editor');
        toast.error(msg);
      }
    },
    [activeProjectPath]
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
    handleToggleSettings,
    handleToggleHistory,
    handleCloseCurrentTab,
    handleSelectTabByIndex,
  });

  // Trigger refit when switching tabs so terminals recalculate dimensions.
  // Use double-rAF to ensure CSS visibility change has painted before refitting.
  useEffect(() => {
    if (activeProjectPath) {
      let rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('terminal-refit-all'));
        });
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [activeProjectPath]);

  return (
    <div
      data-testid="app-ready"
      className={cn(
        'h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden',
        IS_ELECTRON && 'rounded-t-[10px]'
      )}
    >
      <TopBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onReorderTabs={handleReorderTabs}
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
        {/* Main content area — relative container for stacked persistent grids */}
        <div className="flex-1 min-w-0 relative">
          {/* Persistent terminal grids for all projects with sessions */}
          {projectPathsWithGrids.map(projectPath => {
            const isActiveGrid = projectPath === activeProjectPath;
            return (
              <PersistentProjectGrid
                key={projectPath}
                projectPath={projectPath}
                isActive={isActiveGrid}
                preLaunchSlots={isActiveGrid ? preLaunchSlots : undefined}
                launchingSlotIds={isActiveGrid ? launchingSlotIds : undefined}
                branches={isActiveGrid ? branches : undefined}
                worktreeMode={isActiveGrid ? worktreeMode : undefined}
                quickActions={isActiveGrid ? quickActionsForTerminal : undefined}
                onAddSlot={handleAddSession}
                onOpenLaunchModal={handleOpenLaunchModal}
                onRemoveSlot={handleRemoveSlot}
                onUpdateSlot={handleUpdateSlot}
                onLaunch={handleLaunchSlot}
                onKill={handleKillSession}
                onSessionClose={handleSessionClose}
                onQuickAction={handleQuickAction}
                onResume={handleResume}
                onOpenInEditor={handleOpenInEditor}
              />
            );
          })}

          {/* Overlay views shown on top of grids when appropriate */}
          {activeProjectPath ? (
            !hasContent && (
              <div className="absolute inset-0 z-20">
                <IdleLandingView
                  onAddSession={handleAddSession}
                  onOpenLaunchModal={handleOpenLaunchModal}
                />
              </div>
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
        {isHistoryOpen && (
          <Suspense fallback={null}>
            <SessionHistoryPanel
              isOpen={isHistoryOpen}
              onClose={() => setIsHistoryOpen(false)}
              projectPath={activeProjectPath}
              currentBranch={currentBranch}
            />
          </Suspense>
        )}
      </main>

      {isSettingsOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />}>
          <SettingsModal />
        </Suspense>
      )}

      {isLaunchModalOpen && (
        <Suspense fallback={null}>
          <LaunchPresetsModal
            open={isLaunchModalOpen}
            onOpenChange={setIsLaunchModalOpen}
            branches={branches}
            claudeAvailable={claudeAvailable}
            currentBranch={currentBranch}
            defaultAiMode={defaultAiMode}
            existingSessionCount={terminalSessions.length}
            worktreeMode={worktreeMode}
            onCreateSessions={handleBatchAddSessions}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
