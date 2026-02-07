import { Injectable, OnModuleInit } from '@nestjs/common';
import Store from 'electron-store';
import {
  QuickAction,
  ProjectTabDTO,
  UserPreferences,
  WorkspaceStateResponse,
  DEFAULT_WORKTREE_SETTINGS,
  DEFAULT_SESSION_SETTINGS,
  createLogger,
} from '@omniscribe/shared';

// Re-export WorkspaceStateResponse as WorkspaceState for backward compatibility
export type WorkspaceState = WorkspaceStateResponse;

/**
 * Store schema for type safety
 */
interface StoreSchema {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
  quickActions: QuickAction[];
  preferences: UserPreferences;
  [key: string]: unknown;
}

/**
 * Default quick actions for new installations
 */
const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'run-app',
    title: 'Run App',
    description: 'Start the application development server',
    category: 'terminal',
    icon: 'Play',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'npm run dev' },
  },
  {
    id: 'commit-push',
    title: 'Commit & Push',
    description: 'Stage all changes, commit, and push to remote',
    category: 'git',
    icon: 'GitCommit',
    enabled: true,
    handler: 'git:commit-push',
    params: {},
  },
  {
    id: 'fix-errors',
    title: 'Fix Errors',
    description: 'Ask AI to analyze and fix compilation errors',
    category: 'ai',
    icon: 'Wrench',
    enabled: true,
    handler: 'ai:fix-errors',
    params: {},
  },
  {
    id: 'lint-format',
    title: 'Lint & Format',
    description: 'Run linter and formatter on the codebase',
    category: 'terminal',
    icon: 'Sparkles',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'npm run lint && npm run format' },
  },
];

/**
 * Workspace service for managing persistent workspace state
 */
@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly logger = createLogger('WorkspaceService');
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'workspace',
      defaults: {
        tabs: [],
        activeTabId: null,
        quickActions: DEFAULT_QUICK_ACTIONS,
        preferences: {
          theme: 'dark',
          worktree: DEFAULT_WORKTREE_SETTINGS,
          session: DEFAULT_SESSION_SETTINGS,
        },
      },
    });
  }

  /**
   * Initialize default values on module init
   */
  onModuleInit(): void {
    this.logger.info('Initializing workspace service');
    // Ensure quick actions exist
    const quickActions = this.store.get('quickActions');
    if (!quickActions || quickActions.length === 0) {
      this.store.set('quickActions', DEFAULT_QUICK_ACTIONS);
    }
  }

  // ============================================
  // Complete Workspace State
  // ============================================

  /**
   * Get complete workspace state
   */
  getWorkspaceState(): WorkspaceState {
    return {
      tabs: this.store.get('tabs', []),
      activeTabId: this.store.get('activeTabId', null),
      preferences: this.store.get('preferences', {
        theme: 'dark',
        worktree: DEFAULT_WORKTREE_SETTINGS,
        session: DEFAULT_SESSION_SETTINGS,
      }),
      quickActions: this.store.get('quickActions', DEFAULT_QUICK_ACTIONS),
    };
  }

  /**
   * Save complete workspace state
   */
  saveWorkspaceState(state: Partial<WorkspaceState>): void {
    this.logger.debug('Saving workspace state');
    if (state.tabs !== undefined) {
      this.store.set('tabs', state.tabs);
    }
    if (state.activeTabId !== undefined) {
      this.store.set('activeTabId', state.activeTabId);
    }
    if (state.preferences !== undefined) {
      this.store.set('preferences', state.preferences);
    }
    if (state.quickActions !== undefined) {
      this.store.set('quickActions', state.quickActions);
    }
  }

  // ============================================
  // Tabs Management
  // ============================================

  /**
   * Get all workspace tabs
   */
  getTabs(): ProjectTabDTO[] {
    return this.store.get('tabs', []);
  }

  /**
   * Set workspace tabs
   */
  setTabs(tabs: ProjectTabDTO[]): void {
    this.store.set('tabs', tabs);
  }

  /**
   * Get active tab ID
   */
  getActiveTabId(): string | null {
    return this.store.get('activeTabId', null);
  }

  /**
   * Set active tab ID
   */
  setActiveTabId(tabId: string | null): void {
    this.store.set('activeTabId', tabId);
  }

  /**
   * Add a new tab
   */
  addTab(tab: ProjectTabDTO): ProjectTabDTO[] {
    this.logger.debug(`Adding tab: ${tab.id} (${tab.projectPath})`);
    const tabs = this.getTabs();
    // Check if project is already open
    const existingIndex = tabs.findIndex(
      t => t.projectPath.replace(/\\/g, '/') === tab.projectPath.replace(/\\/g, '/')
    );

    if (existingIndex !== -1) {
      // Update existing tab and make it active
      tabs[existingIndex] = {
        ...tabs[existingIndex],
        isActive: true,
        lastAccessedAt: new Date().toISOString(),
      };
      // Deactivate other tabs
      for (let i = 0; i < tabs.length; i++) {
        if (i !== existingIndex) {
          tabs[i].isActive = false;
        }
      }
      this.setTabs(tabs);
      this.setActiveTabId(tabs[existingIndex].id);
      return tabs;
    }

    // Deactivate all existing tabs
    const updatedTabs = tabs.map(t => ({ ...t, isActive: false }));
    // Add new tab as active
    updatedTabs.push({ ...tab, isActive: true });
    this.setTabs(updatedTabs);
    this.setActiveTabId(tab.id);
    return updatedTabs;
  }

  /**
   * Remove a tab
   */
  removeTab(tabId: string): { tabs: ProjectTabDTO[]; activeTabId: string | null } {
    this.logger.debug(`Removing tab: ${tabId}`);
    const tabs = this.getTabs();
    const tabIndex = tabs.findIndex(t => t.id === tabId);

    if (tabIndex === -1) {
      return { tabs, activeTabId: this.getActiveTabId() };
    }

    const isActiveTab = tabs[tabIndex].isActive;
    const newTabs = tabs.filter(t => t.id !== tabId);
    let newActiveTabId = this.getActiveTabId();

    // If we removed the active tab, select an adjacent one
    if (isActiveTab && newTabs.length > 0) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
      newTabs[newActiveIndex].isActive = true;
      newActiveTabId = newTabs[newActiveIndex].id;
    } else if (newTabs.length === 0) {
      newActiveTabId = null;
    }

    this.setTabs(newTabs);
    this.setActiveTabId(newActiveTabId);
    return { tabs: newTabs, activeTabId: newActiveTabId };
  }

  /**
   * Select a tab
   */
  selectTab(tabId: string): ProjectTabDTO[] {
    const tabs = this.getTabs();
    const updatedTabs = tabs.map(t => ({
      ...t,
      isActive: t.id === tabId,
      lastAccessedAt: t.id === tabId ? new Date().toISOString() : t.lastAccessedAt,
    }));
    this.setTabs(updatedTabs);
    this.setActiveTabId(tabId);
    return updatedTabs;
  }

  /**
   * Update a tab's theme
   */
  updateTabTheme(tabId: string, theme: string): ProjectTabDTO[] {
    const tabs = this.getTabs();
    const updatedTabs = tabs.map(t => (t.id === tabId ? { ...t, theme } : t));
    this.setTabs(updatedTabs);
    return updatedTabs;
  }

  // ============================================
  // Quick Actions Management
  // ============================================

  /**
   * Get all quick actions
   */
  getQuickActions(): QuickAction[] {
    return this.store.get('quickActions', DEFAULT_QUICK_ACTIONS);
  }

  /**
   * Set quick actions
   */
  setQuickActions(actions: QuickAction[]): void {
    this.store.set('quickActions', actions);
  }

  /**
   * Reset quick actions to defaults
   */
  resetQuickActionsToDefaults(): void {
    this.store.set('quickActions', DEFAULT_QUICK_ACTIONS);
  }

  // ============================================
  // Preferences Management
  // ============================================

  /**
   * Get all preferences
   */
  getPreferences(): UserPreferences {
    return this.store.get('preferences', {
      theme: 'dark',
      worktree: DEFAULT_WORKTREE_SETTINGS,
      session: DEFAULT_SESSION_SETTINGS,
    });
  }

  /**
   * Set all preferences
   */
  setPreferences(preferences: UserPreferences): void {
    this.store.set('preferences', preferences);
  }

  /**
   * Get a single preference by key
   */
  getPreference<T>(key: string): T | undefined {
    const preferences = this.getPreferences();
    return preferences[key] as T | undefined;
  }

  /**
   * Set a single preference
   */
  setPreference(key: string, value: unknown): UserPreferences {
    const preferences = this.getPreferences();
    preferences[key] = value;
    this.store.set('preferences', preferences);
    return preferences;
  }

  /**
   * Delete a preference
   */
  deletePreference(key: string): void {
    const preferences = this.getPreferences();
    delete preferences[key];
    this.store.set('preferences', preferences);
  }

  // ============================================
  // Generic Store Operations
  // ============================================

  /**
   * Get a value from the store
   */
  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  /**
   * Set a value in the store
   */
  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  /**
   * Delete a key from the store
   */
  delete(key: string): void {
    this.store.delete(key as keyof StoreSchema);
  }

  /**
   * Check if a key exists in the store
   */
  has(key: string): boolean {
    return this.store.has(key as keyof StoreSchema);
  }

  /**
   * Clear all data from the store
   */
  clear(): void {
    this.logger.info('Clearing all workspace data');
    this.store.clear();
  }

  /**
   * Get the store path (useful for debugging)
   */
  getStorePath(): string {
    return this.store.path;
  }
}
