import { lazy, Suspense, useCallback, useMemo, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ContentToolbar } from '@/components/sidebar/ContentToolbar';
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
import { useUpdateToast } from '@/hooks/useUpdateToast';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { useSessionOrderSync } from '@/hooks/useSessionOrderSync';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useSessionStore, selectProjectPaths } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { DEFAULT_WORKTREE_SETTINGS } from '@omniscribe/shared';
import { IS_ELECTRON } from '@/lib/platform';
import { cn } from '@/lib/utils';

const SettingsView = lazy(() =>
  import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView }))
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
const DiffPanel = lazy(() =>
  import('@/components/diff/DiffPanel').then(m => ({
    default: m.DiffPanel,
  }))
);

function App() {
  useAppInitialization();
  useUpdateToast();
  useNotificationNavigation();
  useWorkspacePreferences();
  useSessionOrderSync();

  const {
    tabs,
    activeTabId,
    activeProjectPath,
    handleSelectTab: handleSelectTabRaw,
    handleCloseTab,
    handleNewTab,
    handleSelectDirectory,
    handleReorderTabs,
  } = useWorkspaceTabs();

  // Selecting a project from the sidebar should always return the user to
  // the workspace view — close the Settings overlay if it's open.
  const handleSelectTab = useCallback(
    (tabId: string) => {
      const settings = useSettingsStore.getState();
      if (settings.isOpen) {
        settings.closeSettings();
      }
      handleSelectTabRaw(tabId);
    },
    [handleSelectTabRaw]
  );

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

  const sessionProjectPaths = useSessionStore(selectProjectPaths);

  const { handleStopAll, handleKillSession } = useSessionLifecycle(activeProjectSessions);
  const { quickActionsForTerminal, handleQuickAction } = useQuickActionExecution(terminalSessions);
  const { handleResume, handleOpenInEditor } = useSessionActions(activeProjectPath);

  // Unique project paths that need a persistent grid (sessions or pre-launch slots)
  const projectPathsWithGrids = useMemo(() => {
    const paths = new Set(sessionProjectPaths);
    if (activeProjectPath && preLaunchSlots.length > 0) {
      paths.add(activeProjectPath);
    }
    return [...paths];
  }, [sessionProjectPaths, activeProjectPath, preLaunchSlots.length]);

  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  // Worktree mode (for PersistentProjectGrid)
  const worktreeMode = useWorkspaceStore(
    state => (state.preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS).mode
  );

  // UI store state (for lazy-load gating)
  const isHistoryOpen = useAppUIStore(state => state.isHistoryOpen);
  const isDiffPanelOpen = useAppUIStore(state => state.isDiffPanelOpen);
  const isLaunchModalOpen = useAppUIStore(state => state.isLaunchModalOpen);
  const openLaunchModal = useAppUIStore(state => state.openLaunchModal);

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
    handleToggleSettings,
    handleCloseCurrentTab,
    handleSelectTabByIndex,
  });

  // Active project name for toolbar breadcrumb
  const activeProjectName = useMemo(() => {
    if (!activeTabId) return null;
    const tab = tabs.find(t => t.id === activeTabId);
    return tab?.label ?? null;
  }, [tabs, activeTabId]);

  // Dispatch terminal-refit-all after two animation frames to ensure layout
  // has settled (e.g. after sidebar transition or tab switch).
  const dispatchRefitAfterLayout = useCallback(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      });
    });
    return id;
  }, []);

  // Trigger terminal refit on sidebar transition end
  const handleSidebarTransitionEnd = useCallback(() => {
    dispatchRefitAfterLayout();
  }, [dispatchRefitAfterLayout]);

  // Trigger refit when switching tabs so terminals recalculate dimensions.
  useEffect(() => {
    if (activeProjectPath) {
      const rafId = dispatchRefitAfterLayout();
      return () => cancelAnimationFrame(rafId);
    }
  }, [activeProjectPath, dispatchRefitAfterLayout]);

  return (
    <div
      data-testid="app-ready"
      className={cn(
        'h-screen w-screen bg-background text-foreground flex flex-row overflow-hidden',
        IS_ELECTRON && 'rounded-t-[10px]'
      )}
    >
      {/* Left sidebar */}
      <Sidebar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onReorderTabs={handleReorderTabs}
        currentBranch={currentBranch}
        onTransitionEnd={handleSidebarTransitionEnd}
      />

      {/* Right content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ContentToolbar
          activeProjectName={activeProjectName}
          activeProjectPath={activeProjectPath}
          statusCounts={statusCounts}
          hasActiveProject={!!activeProjectPath}
          sessionCount={terminalSessions.length}
          preLaunchSlotCount={preLaunchSlots.length}
          onAddSlot={handleAddSession}
          onStopAll={handleStopAll}
          onLaunch={handleLaunch}
          canLaunch={canLaunch}
          isLaunching={isLaunching}
          hasActiveSessions={hasActiveSessions}
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
                  onOpenLaunchModal={openLaunchModal}
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
                    projectPath={activeProjectPath}
                    onAddSession={handleAddSession}
                    onOpenLaunchModal={openLaunchModal}
                  />
                </div>
              )
            ) : (
              <WelcomeView
                onOpenProject={handleSelectDirectory}
                onSelectProject={handleSelectTab}
              />
            )}

            {/* Settings view replaces the workspace pane while open. Mounted
                here so the project rail + top toolbar stay visible. */}
            {isSettingsOpen && (
              <Suspense fallback={null}>
                <SettingsView />
              </Suspense>
            )}
          </div>

          {/* Session History Panel */}
          {isHistoryOpen && (
            <Suspense fallback={null}>
              <SessionHistoryPanel projectPath={activeProjectPath} currentBranch={currentBranch} />
            </Suspense>
          )}

          {/* Diff Panel */}
          {isDiffPanelOpen && (
            <Suspense fallback={null}>
              <DiffPanel />
            </Suspense>
          )}
        </main>
      </div>

      {isLaunchModalOpen && (
        <Suspense fallback={null}>
          <LaunchPresetsModal
            projectPath={activeProjectPath}
            onCreateSessions={handleBatchAddSessions}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
