import { useEffect, useState, useCallback } from 'react';
import {
  ProjectTabs,
  TopBar,
  BottomBar,
  Tab,
  StatusCounts,
} from './components';
import { Sidebar } from './components';

type Theme = 'dark' | 'light';

function App() {
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);

  // Theme state
  const [theme, setTheme] = useState<Theme>('dark');

  // Tab state
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', label: 'Project Setup', status: 'idle' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string | null>('1');

  // Branch state
  const [currentBranch] = useState('main');

  // Session state
  const [hasActiveSessions] = useState(false);
  const [canLaunch] = useState(true);

  // Status counts for the legend
  const statusCounts: Partial<StatusCounts> = {
    idle: 1,
  };

  // Apply theme to document
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Theme toggle handler
  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Tab handlers
  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const handleNewTab = useCallback(() => {
    const newId = String(Date.now());
    const newTab: Tab = {
      id: newId,
      label: `New Session`,
      status: 'idle',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, []);

  // Sidebar handlers
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
  }, []);

  // Branch handler
  const handleBranchClick = useCallback(() => {
    // TODO: Implement branch selector modal
    console.log('Branch selector clicked');
  }, []);

  // Bottom bar handlers
  const handleSelectDirectory = useCallback(() => {
    // TODO: Implement directory selection
    console.log('Select directory clicked');
  }, []);

  const handleAddSession = useCallback(() => {
    handleNewTab();
  }, [handleNewTab]);

  const handleStopAll = useCallback(() => {
    // TODO: Implement stop all sessions
    console.log('Stop all clicked');
  }, []);

  const handleLaunch = useCallback(() => {
    // TODO: Implement launch
    console.log('Launch clicked');
  }, []);

  return (
    <div className="h-screen w-screen bg-omniscribe-bg text-omniscribe-text-primary flex flex-col overflow-hidden">
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
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center bg-omniscribe-bg">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-omniscribe-accent-primary to-omniscribe-accent-secondary bg-clip-text text-transparent">
              Omniscribe
            </h1>
            <p className="text-omniscribe-text-secondary">
              AI-powered development environment
            </p>
            {activeTabId && (
              <div className="text-sm text-omniscribe-text-muted">
                Active Tab: {tabs.find((t) => t.id === activeTabId)?.label || 'None'}
              </div>
            )}
          </div>
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
    </div>
  );
}

export default App;
