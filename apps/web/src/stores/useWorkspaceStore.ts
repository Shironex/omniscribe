import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  createLogger,
  extractErrorMessage,
  DEFAULT_PREFERENCES,
  WorkspaceEvents,
  normalizePath,
} from '@omniscribe/shared';
import { getSocket } from '@/lib/socket';
import { emitAsync } from '@/lib/socketHelpers';

const logger = createLogger('WorkspaceStore');
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
  /** Reorder tabs */
  reorderTabs: (tabIds: string[]) => void;
  /** Add a session to a tab */
  addSessionToTab: (tabId: string, sessionId: string) => void;
  /** Remove a session from a tab */
  removeSessionFromTab: (tabId: string, sessionId: string) => void;
  /** Clear stale session references (called on rehydrate) */
  clearStaleSessions: (validSessionIds: string[]) => void;
  /** Restore workspace state from backend */
  restoreState: () => Promise<void>;
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
  const parts = normalizePath(projectPath).split('/');
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
 * Workspace store using Zustand with WebSocket-based persistence
 */
export const useWorkspaceStore = create<WorkspaceStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<WorkspaceState>(set, 'workspace');

      // Create socket listeners
      const { initListeners: baseInitListeners, cleanupListeners } =
        createSocketListeners<WorkspaceStore>(get, set, 'workspace', {
          listeners: [
            {
              event: WorkspaceEvents.TABS_UPDATED,
              handler: (data, get) => {
                const update = data as TabsUpdatedEvent;
                logger.debug(WorkspaceEvents.TABS_UPDATED, update.tabs.length, 'tabs');
                const tabs = update.tabs.map(convertBackendTab);
                get().setTabs(tabs, update.activeTabId);
              },
            },
            {
              event: WorkspaceEvents.PREFERENCES_UPDATED,
              handler: (data, get) => {
                const update = data as PreferencesUpdatedEvent;
                logger.debug(WorkspaceEvents.PREFERENCES_UPDATED);
                get().setPreferences(update.preferences);
              },
            },
          ],
          onConnect: get => {
            // Restore state on reconnect
            get().restoreState();
          },
        });

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
          logger.info('Opening project', projectPath);
          const state = get();
          const normalizedPath = normalizePath(projectPath);

          // Check if project is already open
          const existingTab = state.tabs.find(
            tab => normalizePath(tab.projectPath) === normalizedPath
          );

          if (existingTab) {
            // Focus existing tab via backend
            getSocket().emit(
              WorkspaceEvents.SELECT_TAB,
              { tabId: existingTab.id },
              (response: TabsResponse) => {
                if (response.success) {
                  set(
                    {
                      tabs: response.tabs.map(convertBackendTab),
                      activeTabId: response.activeTabId,
                    },
                    undefined,
                    'workspace/focusExistingTab'
                  );
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

          getSocket().emit(
            WorkspaceEvents.ADD_TAB,
            { id: tabId, projectPath, name: tabName, theme: currentTheme },
            (response: TabsResponse) => {
              if (response.success) {
                set(
                  {
                    tabs: response.tabs.map(convertBackendTab),
                    activeTabId: response.activeTabId,
                  },
                  undefined,
                  'workspace/openProject'
                );
              }
            }
          );
        },

        closeTab: (tabId: string) => {
          logger.debug('closeTab', tabId);
          getSocket().emit(WorkspaceEvents.REMOVE_TAB, { tabId }, (response: TabsResponse) => {
            if (response.success) {
              set(
                {
                  tabs: response.tabs.map(convertBackendTab),
                  activeTabId: response.activeTabId,
                },
                undefined,
                'workspace/closeTab'
              );
            }
          });
        },

        selectTab: (tabId: string) => {
          logger.debug('selectTab', tabId);
          const previousTabId = get().activeTabId;
          // Optimistic update: set activeTabId immediately to prevent race conditions
          // This ensures activeTab computed value is accurate before socket response
          set({ activeTabId: tabId }, undefined, 'workspace/selectTabOptimistic');

          getSocket().emit(WorkspaceEvents.SELECT_TAB, { tabId }, (response: TabsResponse) => {
            if (response.success) {
              set(
                {
                  tabs: response.tabs.map(convertBackendTab),
                  activeTabId: response.activeTabId,
                },
                undefined,
                'workspace/selectTab'
              );
            } else {
              // Rollback on failure - restore previous active tab
              logger.warn('selectTab rollback for', tabId);
              set({ activeTabId: previousTabId }, undefined, 'workspace/selectTabRollback');
            }
          });
        },

        reorderTabs: (tabIds: string[]) => {
          logger.debug('reorderTabs', tabIds);
          const previousTabs = get().tabs;

          // Optimistic reorder
          const tabMap = new Map(previousTabs.map(t => [t.id, t]));
          const reordered = tabIds.map(id => tabMap.get(id)).filter(Boolean) as ProjectTab[];
          set({ tabs: reordered }, undefined, 'workspace/reorderTabsOptimistic');

          getSocket().emit(WorkspaceEvents.REORDER_TABS, { tabIds }, (response: TabsResponse) => {
            if (response.success) {
              set(
                {
                  tabs: response.tabs.map(convertBackendTab),
                  activeTabId: response.activeTabId,
                },
                undefined,
                'workspace/reorderTabs'
              );
            } else {
              // Rollback on failure
              logger.warn('reorderTabs rollback');
              set({ tabs: previousTabs }, undefined, 'workspace/reorderTabsRollback');
            }
          });
        },

        updateTabTheme: (tabId: string, theme: Theme) => {
          logger.debug('updateTabTheme', tabId, theme);
          getSocket().emit(
            WorkspaceEvents.UPDATE_TAB_THEME,
            { tabId, theme },
            (response: TabsOnlyResponse) => {
              if (response.success) {
                set(
                  { tabs: response.tabs.map(convertBackendTab) },
                  undefined,
                  'workspace/updateTabTheme'
                );
              }
            }
          );
        },

        addSessionToTab: (tabId: string, sessionId: string) => {
          logger.debug('addSessionToTab', tabId, sessionId);
          set(
            state => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && !tab.sessionIds.includes(sessionId)
                  ? { ...tab, sessionIds: [...tab.sessionIds, sessionId] }
                  : tab
              ),
            }),
            undefined,
            'workspace/addSessionToTab'
          );
        },

        removeSessionFromTab: (tabId: string, sessionId: string) => {
          logger.debug('removeSessionFromTab', tabId, sessionId);
          set(
            state => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId
                  ? { ...tab, sessionIds: tab.sessionIds.filter(id => id !== sessionId) }
                  : tab
              ),
            }),
            undefined,
            'workspace/removeSessionFromTab'
          );
        },

        clearStaleSessions: (validSessionIds: string[]) => {
          logger.debug('clearStaleSessions', { validSessionIds });
          set(
            state => ({
              tabs: state.tabs.map(tab => ({
                ...tab,
                sessionIds: tab.sessionIds.filter(id => validSessionIds.includes(id)),
              })),
            }),
            undefined,
            'workspace/clearStaleSessions'
          );
        },

        restoreState: async () => {
          const state = get();
          if (state.isRestored || state.isLoading) {
            return; // Already restored or in progress
          }

          set({ isLoading: true }, undefined, 'workspace/restoreStateStart');

          try {
            const response = await emitAsync<object, WorkspaceStateResponse>(
              WorkspaceEvents.GET_STATE,
              {},
              { timeout: 10_000 }
            );

            if (response) {
              const tabs = (response.tabs ?? []).map(convertBackendTab);
              // Clear session IDs on restore - they'll be re-associated
              const cleanedTabs = tabs.map(tab => ({ ...tab, sessionIds: [] }));

              logger.info('Restored state:', cleanedTabs.length, 'tabs');
              set(
                {
                  tabs: cleanedTabs,
                  activeTabId: response.activeTabId,
                  preferences: response.preferences ?? DEFAULT_PREFERENCES,
                  isLoading: false,
                  isRestored: true,
                  error: null,
                },
                undefined,
                'workspace/restoreState'
              );
            } else {
              logger.warn('Empty restore response');
              set(
                {
                  isLoading: false,
                  isRestored: true,
                  error: null,
                },
                undefined,
                'workspace/restoreStateEmpty'
              );
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Restore timed out');
            set(
              { isLoading: false, isRestored: true, error: message },
              undefined,
              'workspace/restoreStateError'
            );
          }
        },

        updatePreference: (key: string, value: unknown) => {
          logger.debug('updatePreference', key);
          getSocket().emit(
            WorkspaceEvents.UPDATE_PREFERENCE,
            { key, value },
            (response: PreferencesResponse) => {
              if (response.success) {
                set({ preferences: response.preferences }, undefined, 'workspace/updatePreference');
              }
            }
          );
        },

        setTabs: (tabs: ProjectTab[], activeTabId: string | null) => {
          logger.debug('setTabs', tabs.length, 'tabs, active:', activeTabId);
          set({ tabs, activeTabId }, undefined, 'workspace/setTabs');
        },

        setPreferences: (preferences: UserPreferences) => {
          logger.debug('setPreferences');
          set({ preferences }, undefined, 'workspace/setPreferences');
        },
      };
    },
    { name: 'workspace' }
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
  state.tabs.find(tab => tab.id === state.activeTabId);

/**
 * Select tab by project path
 */
export const selectTabByProjectPath = (projectPath: string) => (state: WorkspaceStore) => {
  const normalizedPath = normalizePath(projectPath);
  return state.tabs.find(tab => normalizePath(tab.projectPath) === normalizedPath);
};

/**
 * Select preferences
 */
export const selectPreferences = (state: WorkspaceStore) => state.preferences;

/**
 * Select a specific preference
 */
export const selectPreference =
  <T>(key: string) =>
  (state: WorkspaceStore) =>
    state.preferences[key] as T | undefined;

/**
 * Select whether state has been restored
 */
export const selectIsRestored = (state: WorkspaceStore) => state.isRestored;
