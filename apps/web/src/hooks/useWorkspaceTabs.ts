import { useCallback, useMemo } from 'react';
import { useWorkspaceStore, type ProjectTab } from '../stores/useWorkspaceStore';
import { useSessionStore } from '../stores/useSessionStore';
import type { Tab } from '../components';
import type { UISessionStatus } from '@omniscribe/shared';

interface UseWorkspaceTabsReturn {
  /** All workspace tabs in UI format */
  tabs: Tab[];
  /** Active tab ID */
  activeTabId: string | null;
  /** Active tab */
  activeTab: ProjectTab | undefined;
  /** Active project path */
  activeProjectPath: string | null;
  /** Handler to select a tab */
  handleSelectTab: (tabId: string) => void;
  /** Handler to close a tab */
  handleCloseTab: (tabId: string) => void;
  /** Handler to create a new tab */
  handleNewTab: () => void;
  /** Handler to select a directory */
  handleSelectDirectory: () => Promise<void>;
}

/**
 * Hook for workspace tabs management.
 * Handles workspace store connections and tab operations.
 */
export function useWorkspaceTabs(): UseWorkspaceTabsReturn {
  // Workspace store
  const workspaceTabs = useWorkspaceStore((state) => state.tabs);
  const activeWorkspaceTabId = useWorkspaceStore((state) => state.activeTabId);
  const openProject = useWorkspaceStore((state) => state.openProject);
  const closeWorkspaceTab = useWorkspaceStore((state) => state.closeTab);
  const selectWorkspaceTab = useWorkspaceStore((state) => state.selectTab);
  const getActiveTab = useWorkspaceStore((state) => state.getActiveTab);

  // Session store for status
  const sessions = useSessionStore((state) => state.sessions);

  // Get active tab and project path
  const activeTab = getActiveTab();
  const activeProjectPath = activeTab?.projectPath ?? null;

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

  // Tab handlers
  const handleSelectTab = useCallback(
    (tabId: string) => {
      selectWorkspaceTab(tabId);
    },
    [selectWorkspaceTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeWorkspaceTab(tabId);
    },
    [closeWorkspaceTab]
  );

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

  return {
    tabs,
    activeTabId: activeWorkspaceTabId,
    activeTab,
    activeProjectPath,
    handleSelectTab,
    handleCloseTab,
    handleNewTab,
    handleSelectDirectory,
  };
}
