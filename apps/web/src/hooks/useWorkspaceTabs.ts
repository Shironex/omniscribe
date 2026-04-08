import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { arrayMove } from '@dnd-kit/sortable';
import { createLogger, mapSessionStatus, type UISessionStatus } from '@omniscribe/shared';
import { useWorkspaceStore, type ProjectTab } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import type { SessionStatus } from '@/components/shared/StatusLegend';

export interface Tab {
  id: string;
  label: string;
  projectPath: string;
  status?: SessionStatus;
  thumbnailUrl?: string;
}

const logger = createLogger('WorkspaceTabs');

const STATUS_PRIORITY: Record<UISessionStatus, number> = {
  idle: 0,
  done: 1,
  starting: 2,
  planning: 3,
  working: 4,
  needsInput: 5,
  error: 6,
};

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
  /** Handler to reorder tabs via drag-and-drop */
  handleReorderTabs: (activeId: string, overId: string) => void;
}

/**
 * Hook for workspace tabs management.
 * Handles workspace store connections and tab operations.
 */
export function useWorkspaceTabs(): UseWorkspaceTabsReturn {
  // Workspace store
  const workspaceTabs = useWorkspaceStore(state => state.tabs);
  const activeWorkspaceTabId = useWorkspaceStore(state => state.activeTabId);
  const openProject = useWorkspaceStore(state => state.openProject);
  const closeWorkspaceTab = useWorkspaceStore(state => state.closeTab);
  const selectWorkspaceTab = useWorkspaceStore(state => state.selectTab);
  const reorderWorkspaceTabs = useWorkspaceStore(state => state.reorderTabs);

  // Session store for status — shallow compare to avoid re-renders when
  // session fields unrelated to tab status change.
  const sessions = useSessionStore(useShallow(state => state.sessions));

  // Get active tab and project path using useMemo to avoid recalculating on every render
  const activeTab = useMemo(() => {
    if (!activeWorkspaceTabId) return undefined;
    return workspaceTabs.find(tab => tab.id === activeWorkspaceTabId);
  }, [workspaceTabs, activeWorkspaceTabId]);
  const activeProjectPath = activeTab?.projectPath ?? null;

  // Convert workspace tabs to UI tabs format
  const tabs: Tab[] = useMemo(() => {
    return workspaceTabs.map(tab => {
      const thumbnailUrl = tab.thumbnailFileName
        ? `omniscribe-thumb://${tab.thumbnailFileName}`
        : undefined;

      const projectSessions = sessions.filter(s => s.projectPath === tab.projectPath);
      if (projectSessions.length === 0) {
        return {
          id: tab.id,
          label: tab.name,
          projectPath: tab.projectPath,
          status: undefined,
          thumbnailUrl,
        };
      }

      // Pick the highest-priority status across all sessions
      let topStatus: UISessionStatus = 'idle';
      for (const session of projectSessions) {
        const uiStatus = mapSessionStatus(session.status);
        if (STATUS_PRIORITY[uiStatus] > STATUS_PRIORITY[topStatus]) {
          topStatus = uiStatus;
        }
      }

      return {
        id: tab.id,
        label: tab.name,
        projectPath: tab.projectPath,
        status: topStatus,
        thumbnailUrl,
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
      logger.warn('Electron dialog API not available');
      return;
    }

    try {
      const selectedPath = await window.electronAPI.dialog.openDirectory();
      if (selectedPath) {
        logger.info('Directory selected:', selectedPath);
        // Validate the project path if available
        if (window.electronAPI.app?.isValidProject) {
          const result = await window.electronAPI.app.isValidProject(selectedPath);
          if (!result.valid) {
            logger.warn('Invalid project directory:', result.reason);
            // Could show a dialog here
          }
        }

        logger.info('Opening project', selectedPath);
        // Open the project in workspace
        openProject(selectedPath);
      }
    } catch (error) {
      logger.error('Failed to select directory:', error);
    }
  }, [openProject]);

  const handleNewTab = useCallback(() => {
    // For new tab, open directory selector
    handleSelectDirectory();
  }, [handleSelectDirectory]);

  const handleReorderTabs = useCallback(
    (activeId: string, overId: string) => {
      const tabIds = workspaceTabs.map(t => t.id);
      const oldIndex = tabIds.indexOf(activeId);
      const newIndex = tabIds.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(tabIds, oldIndex, newIndex);
      reorderWorkspaceTabs(newOrder);
    },
    [workspaceTabs, reorderWorkspaceTabs]
  );

  return {
    tabs,
    activeTabId: activeWorkspaceTabId,
    activeTab,
    activeProjectPath,
    handleSelectTab,
    handleCloseTab,
    handleNewTab,
    handleSelectDirectory,
    handleReorderTabs,
  };
}
