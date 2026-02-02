import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { WorkspaceTab } from '@omniscribe/shared';

/**
 * Project tab represents an open project in the workspace
 */
export interface ProjectTab {
  /** Unique tab identifier */
  id: string;
  /** Project path */
  projectPath: string;
  /** Project name (directory name) */
  name: string;
  /** Session IDs associated with this project */
  sessionIds: string[];
  /** Whether this tab is selected */
  isActive: boolean;
  /** Last accessed timestamp */
  lastAccessedAt: Date;
}

/**
 * Workspace state
 */
interface WorkspaceState {
  /** Open project tabs */
  tabs: ProjectTab[];
  /** Active tab ID */
  activeTabId: string | null;
}

/**
 * Workspace actions
 */
interface WorkspaceActions {
  /** Open a project (creates new tab or focuses existing) */
  openProject: (projectPath: string, name?: string) => void;
  /** Close a tab by ID */
  closeTab: (tabId: string) => void;
  /** Select a tab by ID */
  selectTab: (tabId: string) => void;
  /** Add a session to a tab */
  addSessionToTab: (tabId: string, sessionId: string) => void;
  /** Remove a session from a tab */
  removeSessionFromTab: (tabId: string, sessionId: string) => void;
  /** Clear stale session references (called on rehydrate) */
  clearStaleSessions: (validSessionIds: string[]) => void;
  /** Get tab by project path */
  getTabByProjectPath: (projectPath: string) => ProjectTab | undefined;
  /** Get active tab */
  getActiveTab: () => ProjectTab | undefined;
}

/**
 * Combined store type
 */
type WorkspaceStore = WorkspaceState & WorkspaceActions;

/**
 * Generate unique tab ID
 */
function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract project name from path
 */
function extractProjectName(projectPath: string): string {
  const parts = projectPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || projectPath;
}

/**
 * Electron storage adapter for Zustand persist middleware
 */
const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      const value = await window.electronAPI.store.get<string>(name);
      return value ?? null;
    }
    // Fallback to localStorage for web-only mode
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      await window.electronAPI.store.set(name, value);
    } else {
      // Fallback to localStorage for web-only mode
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      await window.electronAPI.store.delete(name);
    } else {
      // Fallback to localStorage for web-only mode
      localStorage.removeItem(name);
    }
  },
};

/**
 * Workspace store using Zustand with persistence
 */
export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      // Initial state
      tabs: [],
      activeTabId: null,

      // Actions
      openProject: (projectPath: string, name?: string) => {
        const state = get();
        const normalizedPath = projectPath.replace(/\\/g, '/');

        // Check if project is already open
        const existingTab = state.tabs.find(
          (tab) => tab.projectPath.replace(/\\/g, '/') === normalizedPath
        );

        if (existingTab) {
          // Focus existing tab
          set({
            tabs: state.tabs.map((tab) => ({
              ...tab,
              isActive: tab.id === existingTab.id,
              lastAccessedAt: tab.id === existingTab.id ? new Date() : tab.lastAccessedAt,
            })),
            activeTabId: existingTab.id,
          });
          return;
        }

        // Create new tab
        const newTab: ProjectTab = {
          id: generateTabId(),
          projectPath,
          name: name ?? extractProjectName(projectPath),
          sessionIds: [],
          isActive: true,
          lastAccessedAt: new Date(),
        };

        set({
          tabs: [
            ...state.tabs.map((tab) => ({ ...tab, isActive: false })),
            newTab,
          ],
          activeTabId: newTab.id,
        });
      },

      closeTab: (tabId: string) => {
        const state = get();
        const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);

        if (tabIndex === -1) return;

        const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
        let newActiveTabId = state.activeTabId;

        // If closing the active tab, select an adjacent tab
        if (state.activeTabId === tabId) {
          if (newTabs.length === 0) {
            newActiveTabId = null;
          } else if (tabIndex >= newTabs.length) {
            newActiveTabId = newTabs[newTabs.length - 1].id;
          } else {
            newActiveTabId = newTabs[tabIndex].id;
          }
        }

        set({
          tabs: newTabs.map((tab) => ({
            ...tab,
            isActive: tab.id === newActiveTabId,
          })),
          activeTabId: newActiveTabId,
        });
      },

      selectTab: (tabId: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => ({
            ...tab,
            isActive: tab.id === tabId,
            lastAccessedAt: tab.id === tabId ? new Date() : tab.lastAccessedAt,
          })),
          activeTabId: tabId,
        }));
      },

      addSessionToTab: (tabId: string, sessionId: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && !tab.sessionIds.includes(sessionId)
              ? { ...tab, sessionIds: [...tab.sessionIds, sessionId] }
              : tab
          ),
        }));
      },

      removeSessionFromTab: (tabId: string, sessionId: string) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, sessionIds: tab.sessionIds.filter((id) => id !== sessionId) }
              : tab
          ),
        }));
      },

      clearStaleSessions: (validSessionIds: string[]) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => ({
            ...tab,
            sessionIds: tab.sessionIds.filter((id) => validSessionIds.includes(id)),
          })),
        }));
      },

      getTabByProjectPath: (projectPath: string) => {
        const normalizedPath = projectPath.replace(/\\/g, '/');
        return get().tabs.find(
          (tab) => tab.projectPath.replace(/\\/g, '/') === normalizedPath
        );
      },

      getActiveTab: () => {
        const state = get();
        return state.tabs.find((tab) => tab.id === state.activeTabId);
      },
    }),
    {
      name: 'omniscribe-workspace',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        tabs: state.tabs.map((tab) => ({
          ...tab,
          // Clear session IDs on persist - they'll be re-associated on app start
          sessionIds: [],
        })),
        activeTabId: state.activeTabId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Mark all tabs as needing session refresh
          // The app should call clearStaleSessions with actual valid session IDs
          state.tabs = state.tabs.map((tab) => ({
            ...tab,
            sessionIds: [], // Clear stale session references
            lastAccessedAt: new Date(tab.lastAccessedAt), // Ensure Date objects
          }));
        }
      },
    }
  )
);

// Selectors

/**
 * Select all tabs
 */
export const selectTabs = (state: WorkspaceStore) => state.tabs;

/**
 * Select active tab
 */
export const selectActiveTab = (state: WorkspaceStore) =>
  state.tabs.find((tab) => tab.id === state.activeTabId);

/**
 * Select tab by project path
 */
export const selectTabByProjectPath = (projectPath: string) => (state: WorkspaceStore) => {
  const normalizedPath = projectPath.replace(/\\/g, '/');
  return state.tabs.find(
    (tab) => tab.projectPath.replace(/\\/g, '/') === normalizedPath
  );
};
