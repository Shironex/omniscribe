import { create } from 'zustand';
import { socket } from '../lib/socket';
import type {
  Theme,
  ProjectTab,
  ProjectTabDTO,
  UserPreferences,
  TabsResponse,
  TabsOnlyResponse,
  TabsUpdatedEvent,
  PreferencesUpdatedEvent,
  PreferencesResponse,
  WorkspaceStateResponse,
} from '@omniscribe/shared';
import { DEFAULT_WORKTREE_SETTINGS } from '@omniscribe/shared';
import { useSettingsStore } from './useSettingsStore';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

// Re-export types for consumers of this store
export type { ProjectTab, UserPreferences } from '@omniscribe/shared';

/**
 * Workspace state (extends common socket state)
 */
interface WorkspaceState extends SocketStoreState {
  /** Open project tabs */
  tabs: ProjectTab[];
  /** Active tab ID */
  activeTabId: string | null;
  /** User preferences */
  preferences: UserPreferences;
  /** Whether state has been restored from backend */
  isRestored: boolean;
}

/**
 * Workspace actions (extends common socket actions)
 */
interface WorkspaceActions extends SocketStoreActions {
  /** Open a project (creates new tab or focuses existing) */
  openProject: (projectPath: string, name?: string) => void;
  /** Close a tab by ID */
  closeTab: (tabId: string) => void;
  /** Select a tab by ID */
  selectTab: (tabId: string) => void;
  /** Update a tab's theme */
  updateTabTheme: (tabId: string, theme: Theme) => void;
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
  /** Restore workspace state from backend */
  restoreState: () => void;
  /** Update a preference */
  updatePreference: (key: string, value: unknown) => void;
  /** Set tabs (internal) */
  setTabs: (tabs: ProjectTab[], activeTabId: string | null) => void;
  /** Set preferences (internal) */
  setPreferences: (preferences: UserPreferences) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
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
 * Convert backend tab DTO to frontend ProjectTab (handle Date conversion)
 */
function convertBackendTab(dto: ProjectTabDTO): ProjectTab {
  return {
    ...dto,
    lastAccessedAt: new Date(dto.lastAccessedAt),
    theme: dto.theme as Theme | undefined,
  };
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  sidebarWidth: 240,
  sidebarOpen: true,
  worktree: DEFAULT_WORKTREE_SETTINGS,
};

/**
 * Workspace store using Zustand with WebSocket-based persistence
 */
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  // Create common socket actions
  const socketActions = createSocketActions<WorkspaceState>(set);

  // Create socket listeners
  const { initListeners: baseInitListeners, cleanupListeners } = createSocketListeners<WorkspaceStore>(
    get,
    set,
    {
      listeners: [
        {
          event: 'workspace:tabs-updated',
          handler: (data, get) => {
            const update = data as TabsUpdatedEvent;
            const tabs = update.tabs.map(convertBackendTab);
            get().setTabs(tabs, update.activeTabId);
          },
        },
        {
          event: 'workspace:preferences-updated',
          handler: (data, get) => {
            const update = data as PreferencesUpdatedEvent;
            get().setPreferences(update.preferences);
          },
        },
      ],
      onConnect: (get) => {
        // Restore state on reconnect
        get().restoreState();
      },
    }
  );

  // Wrap initListeners to also call restoreState on initial setup
  const initListeners = () => {
    baseInitListeners();
    // Initial state restore (only if not already restored)
    get().restoreState();
  };

  return {
    // Initial state (spread common state + custom state)
    ...initialSocketState,
    tabs: [],
    activeTabId: null,
    preferences: DEFAULT_PREFERENCES,
    isRestored: false,

    // Common socket actions
    ...socketActions,

    // Socket listeners
    initListeners,
    cleanupListeners,

    // Custom actions
    openProject: (projectPath: string, name?: string) => {
    const state = get();
    const normalizedPath = projectPath.replace(/\\/g, '/');

    // Check if project is already open
    const existingTab = state.tabs.find(
      (tab) => tab.projectPath.replace(/\\/g, '/') === normalizedPath
    );

    if (existingTab) {
      // Focus existing tab via backend
      socket.emit(
        'workspace:select-tab',
        { tabId: existingTab.id },
        (response: TabsResponse) => {
          if (response.success) {
            set({
              tabs: response.tabs.map(convertBackendTab),
              activeTabId: response.activeTabId,
            });
          }
        }
      );
      return;
    }

    // Create new tab via backend
    const tabId = generateTabId();
    const tabName = name ?? extractProjectName(projectPath);
    // New tabs inherit the current theme from settings
    const currentTheme = useSettingsStore.getState().theme;

    socket.emit(
      'workspace:add-tab',
      { id: tabId, projectPath, name: tabName, theme: currentTheme },
      (response: TabsResponse) => {
        if (response.success) {
          set({
            tabs: response.tabs.map(convertBackendTab),
            activeTabId: response.activeTabId,
          });
        }
      }
    );
  },

  closeTab: (tabId: string) => {
    socket.emit(
      'workspace:remove-tab',
      { tabId },
      (response: TabsResponse) => {
        if (response.success) {
          set({
            tabs: response.tabs.map(convertBackendTab),
            activeTabId: response.activeTabId,
          });
        }
      }
    );
  },

  selectTab: (tabId: string) => {
    socket.emit(
      'workspace:select-tab',
      { tabId },
      (response: TabsResponse) => {
        if (response.success) {
          set({
            tabs: response.tabs.map(convertBackendTab),
            activeTabId: response.activeTabId,
          });
        }
      }
    );
  },

  updateTabTheme: (tabId: string, theme: Theme) => {
    socket.emit(
      'workspace:update-tab-theme',
      { tabId, theme },
      (response: TabsOnlyResponse) => {
        if (response.success) {
          set({ tabs: response.tabs.map(convertBackendTab) });
        }
      }
    );
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

  restoreState: () => {
    const state = get();
    if (state.isRestored) {
      return; // Already restored
    }

    set({ isLoading: true });

    socket.emit(
      'workspace:get-state',
      {},
      (response: WorkspaceStateResponse) => {
        if (response) {
          const tabs = (response.tabs ?? []).map(convertBackendTab);
          // Clear session IDs on restore - they'll be re-associated
          const cleanedTabs = tabs.map((tab) => ({ ...tab, sessionIds: [] }));

          set({
            tabs: cleanedTabs,
            activeTabId: response.activeTabId,
            preferences: response.preferences ?? DEFAULT_PREFERENCES,
            isLoading: false,
            isRestored: true,
            error: null,
          });
        } else {
          set({
            isLoading: false,
            isRestored: true,
            error: null,
          });
        }
      }
    );
  },

  updatePreference: (key: string, value: unknown) => {
    socket.emit(
      'workspace:update-preference',
      { key, value },
      (response: PreferencesResponse) => {
        if (response.success) {
          set({ preferences: response.preferences });
        }
      }
    );
  },

  setTabs: (tabs: ProjectTab[], activeTabId: string | null) => {
    set({ tabs, activeTabId });
  },

  setPreferences: (preferences: UserPreferences) => {
    set({ preferences });
  },
  };
});

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

/**
 * Select preferences
 */
export const selectPreferences = (state: WorkspaceStore) => state.preferences;

/**
 * Select a specific preference
 */
export const selectPreference = <T>(key: string) => (state: WorkspaceStore) =>
  state.preferences[key] as T | undefined;

/**
 * Select whether state has been restored
 */
export const selectIsRestored = (state: WorkspaceStore) => state.isRestored;
