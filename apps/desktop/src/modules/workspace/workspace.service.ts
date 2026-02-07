import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Store from 'electron-store';
import {
  QuickAction,
  ProjectTabDTO,
  UserPreferences,
  WorkspaceStateResponse,
  DEFAULT_WORKTREE_SETTINGS,
  DEFAULT_SESSION_SETTINGS,
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
  // Git Actions (AI Prompts)
  {
    id: 'git-commit',
    title: 'Git Commit',
    description: 'Generate a conventional commit message and commit changes',
    category: 'git',
    icon: 'GitCommit',
    enabled: true,
    handler: 'terminal:execute',
    params: {
      command:
        'Generate a conventional commit message for the staged changes and commit them. Use the format: type: short description. Types: feat, fix, refactor, docs, chore, style, test, perf, ci, build.',
    },
  },
  {
    id: 'git-commit-push',
    title: 'Commit & Push',
    description:
      'Analyze changes, generate a conventional commit message, commit, and push to remote',
    category: 'git',
    icon: 'GitCommitVertical',
    enabled: true,
    handler: 'terminal:execute',
    params: {
      command:
        'Analyze the current changes, generate a conventional commit message (feat/fix/refactor/etc.), ' +
        'stage all changes, commit with the generated message, and push to the remote repository. ' +
        'Handle any errors autonomously (e.g., resolve push conflicts, retry after fixing issues).',
    },
  },
  {
    id: 'git-push',
    title: 'Git Push',
    description: 'Push committed changes to remote',
    category: 'git',
    icon: 'ArrowUp',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'git push' },
  },
  {
    id: 'git-pull',
    title: 'Git Pull',
    description: 'Pull latest changes from remote',
    category: 'git',
    icon: 'ArrowDown',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'git pull' },
  },
  {
    id: 'git-status',
    title: 'Git Status',
    description: 'Show the working tree status',
    category: 'git',
    icon: 'Info',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'git status' },
  },
  {
    id: 'resolve-conflicts',
    title: 'Resolve Conflicts',
    description: 'AI-assisted merge conflict resolution',
    category: 'git',
    icon: 'GitMerge',
    enabled: true,
    handler: 'terminal:execute',
    params: {
      command:
        'Resolve merge conflicts in the current branch. Examine each conflicted file, understand both sides of the conflict, and resolve them appropriately. After resolving all conflicts, ensure the code compiles and tests pass, then stage and commit the resolved changes.',
    },
  },
  {
    id: 'address-pr-comments',
    title: 'Address PR Comments',
    description: 'Review and address PR feedback',
    category: 'git',
    icon: 'MessageSquare',
    enabled: true,
    handler: 'terminal:execute',
    params: {
      command:
        "Read the review comments on the current PR and address any feedback. Review the PR diff, understand the reviewer's concerns, and make the necessary changes to address their feedback.",
    },
  },
  // Terminal Actions
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
    id: 'lint-format',
    title: 'Lint & Format',
    description: 'Run linter and formatter on the codebase',
    category: 'terminal',
    icon: 'Sparkles',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'npm run lint && npm run format' },
  },
  // AI Actions
  {
    id: 'fix-errors',
    title: 'Fix Errors',
    description: 'Ask AI to analyze and fix compilation errors',
    category: 'ai',
    icon: 'Wrench',
    enabled: true,
    handler: 'terminal:execute',
    params: {
      command:
        'Analyze and fix any compilation errors or warnings in the codebase. Run the build/compile command, identify issues, and fix them.',
    },
  },
  {
    id: 'plan-implementation',
    title: 'Plan Implementation',
    description: 'Create a brief implementation plan for a task',
    category: 'ai',
    icon: 'ListTodo',
    enabled: true,
    handler: 'terminal:execute',
    params: {
      command: `Create a brief implementation plan for this task:
1. Goal: What we're accomplishing
2. Approach: How we'll do it
3. Files to modify and what changes
4. Tasks (numbered list)
5. Potential risks or gotchas`,
    },
  },
];

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  worktree: DEFAULT_WORKTREE_SETTINGS,
  session: DEFAULT_SESSION_SETTINGS,
};

/**
 * Workspace service for managing persistent workspace state
 */
@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceService.name);
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'workspace',
      defaults: {
        tabs: [],
        activeTabId: null,
        quickActions: DEFAULT_QUICK_ACTIONS,
        preferences: DEFAULT_PREFERENCES,
      },
    });
  }

  /**
   * Initialize default values on module init
   */
  onModuleInit(): void {
    this.logger.log('Initializing workspace service');
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
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...this.store.get('preferences', DEFAULT_PREFERENCES),
      },
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
    return { ...DEFAULT_PREFERENCES, ...this.store.get('preferences', DEFAULT_PREFERENCES) };
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
    this.logger.log('Clearing all workspace data');
    this.store.clear();
  }

  /**
   * Get the store path (useful for debugging)
   */
  getStorePath(): string {
    return this.store.path;
  }
}
