import {
  ProjectTabs,
  TopBar,
  BottomBar,
  Sidebar,
} from './components';
import { TerminalGrid } from './components/terminal/TerminalGrid';
import { IdleLandingView } from './components/shared/IdleLandingView';
import { SettingsModal } from './components/settings';
import {
  useAppInitialization,
  useWorkspaceTabs,
  useWorkspacePreferences,
  useProjectSessions,
  usePreLaunchSlots,
  useProjectGit,
  useSessionLifecycle,
} from './hooks';

function App() {
  // Initialize app (socket and store listeners)
  useAppInitialization();

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

  // Workspace preferences (sidebar and theme sync)
  const {
    sidebarOpen,
    sidebarWidth,
    handleToggleSidebar,
    handleSidebarWidthChange,
  } = useWorkspacePreferences();

  // Project git (branches and MCP discovery on project change)
  const { branches, currentBranch, handleBranchClick } = useProjectGit(activeProjectPath);

  // Pre-launch slots (needs currentBranch from git hook)
  // Note: updateSession is passed from sessions hook, but we need to call useProjectSessions first
  // to get it, so we use a two-phase approach with a temporary placeholder
  const sessionsHookResult = useProjectSessions(activeProjectPath, []);

  // Now create pre-launch slots with the updateSession function
  const {
    preLaunchSlots,
    canLaunch,
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

  // Determine whether to show IdleLandingView or TerminalGrid
  const hasContent = terminalSessions.length > 0 || preLaunchSlots.length > 0;

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Project tabs / title bar */}
      <ProjectTabs
        tabs={tabs}
        activeTabId={activeTabId}
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
