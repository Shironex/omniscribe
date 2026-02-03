import { create } from 'zustand';
import { socket } from '../lib/socket';

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
 * User preferences
 */
export interface UserPreferences {
  /** Theme preference */
  theme: 'light' | 'dark' | 'system';
  /** Sidebar width */
  sidebarWidth: number;
  /** Whether sidebar is open */
  sidebarOpen: boolean;
  /** Other preferences */
  [key: string]: unknown;
}

/**
 * Backend workspace state response
 */
interface BackendWorkspaceState {
  tabs: Array<Omit<ProjectTab, 'lastAccessedAt'> & { lastAccessedAt: string }>;
  activeTabId: string | null;
  preferences: UserPreferences;
}

/**
 * Workspace state
 */
interface WorkspaceState {
  /** Open project tabs */
  tabs: ProjectTab[];
  /** Active tab ID */
  activeTabId: string | null;
  /** User preferences */
  preferences: UserPreferences;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether state has been restored from backend */
  isRestored: boolean;
  /** Whether listeners are initialized */
  listenersInitialized: boolean;
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
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
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
 * Convert backend tab to frontend tab (handle Date conversion)
 */
function convertBackendTab(tab: BackendWorkspaceState['tabs'][0]): ProjectTab {
  return {
    ...tab,
    lastAccessedAt: new Date(tab.lastAccessedAt),
  };
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  sidebarWidth: 240,
  sidebarOpen: true,
};

/**
 * Workspace store using Zustand with WebSocket-based persistence
 */
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
  preferences: DEFAULT_PREFERENCES,
  isLoading: false,
  error: null,
  isRestored: false,
  listenersInitialized: false,

  // Actions
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
        (response: { success: boolean; tabs: BackendWorkspaceState['tabs']; activeTabId: string }) => {
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

    socket.emit(
      'workspace:add-tab',
      { id: tabId, projectPath, name: tabName },
      (response: { success: boolean; tabs: BackendWorkspaceState['tabs']; activeTabId: string }) => {
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
      (response: { success: boolean; tabs: BackendWorkspaceState['tabs']; activeTabId: string | null }) => {
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
      (response: { success: boolean; tabs: BackendWorkspaceState['tabs']; activeTabId: string }) => {
        if (response.success) {
          set({
            tabs: response.tabs.map(convertBackendTab),
            activeTabId: response.activeTabId,
          });
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
      (response: BackendWorkspaceState) => {
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
      (response: { success: boolean; preferences: UserPreferences }) => {
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

  initListeners: () => {
    const state = get();

    // Prevent duplicate listener registration
    if (state.listenersInitialized) {
      return;
    }

    const { setTabs, setPreferences, setError, restoreState } = get();

    // Handle tabs update from other clients
    socket.on(
      'workspace:tabs-updated',
      (update: { tabs: BackendWorkspaceState['tabs']; activeTabId: string | null }) => {
        const tabs = update.tabs.map(convertBackendTab);
        setTabs(tabs, update.activeTabId);
      }
    );

    // Handle preferences update from other clients
    socket.on(
      'workspace:preferences-updated',
      (update: { preferences: UserPreferences }) => {
        setPreferences(update.preferences);
      }
    );

    // Handle connection error
    socket.on('connect_error', (err: Error) => {
      setError(`Connection error: ${err.message}`);
    });

    // Handle reconnection - restore workspace state
    socket.on('connect', () => {
      setError(null);
      // Restore state on reconnect
      restoreState();
    });

    set({ listenersInitialized: true });

    // Initial state restore
    restoreState();
  },

  cleanupListeners: () => {
    socket.off('workspace:tabs-updated');
    socket.off('workspace:preferences-updated');

    set({ listenersInitialized: false });
  },

  setLoading: (isLoading: boolean) => {
    set({ isLoading });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));

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
