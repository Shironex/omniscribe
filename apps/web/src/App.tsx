import { lazy, Suspense, useCallback, useMemo, useEffect } from 'react';
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
import { useUpdateToast } from '@/hooks/useUpdateToast';
import { useSessionOrderSync } from '@/hooks/useSessionOrderSync';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useSessionStore, selectProjectPaths } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { DEFAULT_WORKTREE_SETTINGS } from '@omniscribe/shared';
import { IS_ELECTRON } from '@/lib/platform';
import { cn } from '@/lib/utils';

import { SettingsModalShell } from '@/components/settings/SettingsModalShell';
import { SettingsModalSkeleton } from '@/components/settings/SettingsModalSkeleton';

const SettingsModalContent = lazy(() =>
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
const DiffPanel = lazy(() =>
  import('@/components/diff/DiffPanel').then(m => ({
    default: m.DiffPanel,
  }))
);

function App() {
  useAppInitialization();
  useUpdateToast();
  useWorkspacePreferences();
  useSessionOrderSync();

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

  // Trigger refit when switching tabs so terminals recalculate dimensions.
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
        hasActiveProject={!!activeProjectPath}
        sessionCount={terminalSessions.length}
        preLaunchSlotCount={preLaunchSlots.length}
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
                  onAddSession={handleAddSession}
                  onOpenLaunchModal={openLaunchModal}
                />
              </div>
            )
          ) : (
            <WelcomeView onOpenProject={handleSelectDirectory} onSelectProject={handleSelectTab} />
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

      {isSettingsOpen && (
        <SettingsModalShell>
          <Suspense fallback={<SettingsModalSkeleton />}>
            <SettingsModalContent />
          </Suspense>
        </SettingsModalShell>
      )}

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
