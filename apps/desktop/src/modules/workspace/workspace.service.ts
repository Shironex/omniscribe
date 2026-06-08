import { Injectable, OnModuleInit } from '@nestjs/common';
import Store from 'electron-store';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  QuickAction,
  ProjectTabDTO,
  UserPreferences,
  WorkspaceStateResponse,
  SessionHistoryEntry,
  CustomCommand,
  CustomCommandInput,
  CustomCommandUpdate,
  DEFAULT_PREFERENCES,
  createLogger,
  normalizePath,
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
  sessionHistory: SessionHistoryEntry[];
  /** Maps normalized project path → thumbnail filename (persists across tab close/reopen) */
  projectThumbnails: Record<string, string>;
  /** Maps normalized project path → enabled MCP capability IDs */
  projectCapabilities: Record<string, string[]>;
  /** Maps normalized project path → user's own Electron app CDP port */
  projectElectronCdpPort: Record<string, number>;
  /** Maps normalized project path → user-defined custom commands */
  projectCustomCommands: Record<string, CustomCommand[]>;
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

/**
 * Workspace service for managing persistent workspace state
 */
@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly logger = createLogger('WorkspaceService');
  private store: Store<StoreSchema>;

  constructor() {
    try {
      this.store = new Store<StoreSchema>({
        name: 'workspace',
        defaults: {
          tabs: [],
          activeTabId: null,
          quickActions: DEFAULT_QUICK_ACTIONS,
          preferences: DEFAULT_PREFERENCES,
          sessionHistory: [],
          projectThumbnails: {},
          projectCapabilities: {},
          projectElectronCdpPort: {},
          projectCustomCommands: {},
        },
      });
      this.logger.debug(`Store initialized at ${this.store.path}`);
    } catch (error) {
      this.logger.error('Failed to initialize workspace store, resetting to defaults:', error);
      // Preserve the bad file before clearInvalidConfig wipes the user's entire
      // workspace (tabs, history, preferences, capabilities) — best-effort.
      this.backupCorruptStore();
      // Corruption or schema mismatch — clear and retry
      try {
        this.store = new Store<StoreSchema>({
          name: 'workspace',
          clearInvalidConfig: true,
          defaults: {
            tabs: [],
            activeTabId: null,
            quickActions: DEFAULT_QUICK_ACTIONS,
            preferences: DEFAULT_PREFERENCES,
            sessionHistory: [],
            projectThumbnails: {},
            projectCapabilities: {},
            projectElectronCdpPort: {},
            projectCustomCommands: {},
          },
        });
      } catch (retryError) {
        this.logger.error('Failed to initialize workspace store on retry:', retryError);
        throw retryError;
      }
    }
  }

  /**
   * Best-effort copy of the workspace store file before clearInvalidConfig
   * wipes it, so a user can recover corrupted or hand-edited state.
   */
  private backupCorruptStore(): void {
    try {
      // Lazy require: WorkspaceService is transitively imported by many specs;
      // a static `import from 'electron'` would force them all to mock electron.
      const { app } = require('electron') as typeof import('electron');
      const userData = app.getPath('userData');
      const src = path.join(userData, 'workspace.json');
      if (!fs.existsSync(src)) {
        return;
      }
      const backup = path.join(userData, `workspace.corrupt-${Date.now()}.json`);
      fs.copyFileSync(src, backup);
      this.logger.warn(`Backed up corrupt workspace store to ${backup}`);
    } catch (backupError) {
      this.logger.warn('Failed to back up corrupt workspace store', backupError);
    }
  }

  /**
   * Initialize default values on module init
   */
  onModuleInit(): void {
    this.logger.log('Initializing workspace service');
    // Ensure quick actions exist
    const quickActions = this.store.get('quickActions');
    if (!quickActions || quickActions.length === 0) {
      this.logger.debug('No quick actions found, applying defaults');
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
      t => normalizePath(t.projectPath) === normalizePath(tab.projectPath)
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

    // Restore thumbnail from project map if available
    const projectKey = normalizePath(tab.projectPath);
    const thumbnailMap = this.store.get('projectThumbnails', {});
    const savedThumbnail = thumbnailMap[projectKey];

    // Deactivate all existing tabs
    const updatedTabs = tabs.map(t => ({ ...t, isActive: false }));
    // Add new tab as active, restoring thumbnail if available
    updatedTabs.push({
      ...tab,
      isActive: true,
      ...(savedThumbnail ? { thumbnailFileName: savedThumbnail } : {}),
    });
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
    this.logger.debug(`[selectTab] tabId=${tabId}`);
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
   * Reorder tabs to match the given ID order
   */
  reorderTabs(tabIds: string[]): ProjectTabDTO[] {
    this.logger.debug(`[reorderTabs] newOrder=${tabIds.join(',')}`);
    const tabs = this.getTabs();
    const tabMap = new Map(tabs.map(t => [t.id, t]));
    const reordered: ProjectTabDTO[] = [];

    for (const id of tabIds) {
      const tab = tabMap.get(id);
      if (tab) {
        reordered.push(tab);
        tabMap.delete(id);
      }
    }

    // Append any tabs not in the provided list (safety net)
    for (const tab of tabMap.values()) {
      reordered.push(tab);
    }

    this.setTabs(reordered);
    return reordered;
  }

  /**
   * Update a tab's thumbnail and persist the association by project path
   */
  updateTabThumbnail(tabId: string, thumbnailFileName: string | null): ProjectTabDTO[] {
    this.logger.debug(`[updateTabThumbnail] tabId=${tabId}, file=${thumbnailFileName}`);
    const tabs = this.getTabs();
    const tab = tabs.find(t => t.id === tabId);

    // Persist thumbnail association by project path so it survives tab close/reopen
    if (tab) {
      const projectKey = normalizePath(tab.projectPath);
      const map = this.store.get('projectThumbnails', {});
      if (thumbnailFileName) {
        map[projectKey] = thumbnailFileName;
      } else {
        delete map[projectKey];
      }
      this.store.set('projectThumbnails', map);
    }

    const updatedTabs = tabs.map(t =>
      t.id === tabId ? { ...t, thumbnailFileName: thumbnailFileName ?? undefined } : t
    );
    this.setTabs(updatedTabs);
    return updatedTabs;
  }

  /**
   * Update a tab's theme
   */
  updateTabTheme(tabId: string, theme: string): ProjectTabDTO[] {
    this.logger.debug(`[updateTabTheme] tabId=${tabId}, theme=${theme}`);
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
    this.logger.debug(`[setQuickActions] count=${actions.length}`);
    this.store.set('quickActions', actions);
  }

  /**
   * Reset quick actions to defaults
   */
  resetQuickActionsToDefaults(): void {
    this.logger.debug('[resetQuickActionsToDefaults] resetting');
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
    this.logger.debug('[setPreferences] updating preferences');
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
    this.logger.debug(`[setPreference] key=${key}`);
    const preferences = this.getPreferences();
    preferences[key] = value;
    this.store.set('preferences', preferences);
    return preferences;
  }

  /**
   * Delete a preference
   */
  deletePreference(key: string): void {
    this.logger.debug(`[deletePreference] key=${key}`);
    const preferences = this.getPreferences();
    delete preferences[key];
    this.store.set('preferences', preferences);
  }

  // ============================================
  // Session History Management
  // ============================================

  /** Maximum number of session history entries to retain */
  private static readonly MAX_SESSION_HISTORY = 200;

  /**
   * Add a session history entry.
   * Prunes oldest entries when exceeding MAX_SESSION_HISTORY.
   */
  addSessionHistory(entry: SessionHistoryEntry): void {
    // Guard: dedup keys on claudeSessionId, so an entry without one would collapse
    // every other id-less entry via `undefined === undefined`. Callers must capture
    // the id before recording history.
    if (!entry.claudeSessionId) {
      this.logger.warn('Ignoring session history entry with no claudeSessionId');
      return;
    }

    const history = this.store.get('sessionHistory', []);

    // Avoid duplicates (same claudeSessionId)
    const filtered = history.filter(h => h.claudeSessionId !== entry.claudeSessionId);

    filtered.unshift(entry); // Newest first

    // Prune to max entries
    if (filtered.length > WorkspaceService.MAX_SESSION_HISTORY) {
      filtered.length = WorkspaceService.MAX_SESSION_HISTORY;
    }

    this.store.set('sessionHistory', filtered);
    this.logger.debug(
      `Added session history entry for ${entry.claudeSessionId} (total: ${filtered.length})`
    );
  }

  /**
   * Get session history entries, optionally filtered by project path.
   */
  getSessionHistory(projectPath?: string): SessionHistoryEntry[] {
    const history = this.store.get('sessionHistory', []);

    if (projectPath) {
      const normalizedPath = normalizePath(projectPath);
      return history.filter(h => normalizePath(h.projectPath) === normalizedPath);
    }

    return history;
  }

  /**
   * Update an existing session history entry by Claude session ID.
   * Merges the provided partial updates into the existing entry.
   */
  updateSessionHistory(claudeSessionId: string, updates: Partial<SessionHistoryEntry>): void {
    const history = this.store.get('sessionHistory', []);
    const index = history.findIndex(h => h.claudeSessionId === claudeSessionId);

    if (index === -1) {
      this.logger.debug(`No session history entry found for ${claudeSessionId}`);
      return;
    }

    history[index] = { ...history[index], ...updates };
    this.store.set('sessionHistory', history);
    this.logger.debug(`Updated session history entry for ${claudeSessionId}`);
  }

  // ============================================
  // Project Capabilities (MCP)
  // ============================================

  /**
   * Get enabled MCP capability IDs for a project, or `undefined` if no
   * explicit value has been stored (caller should fall back to defaults).
   */
  getProjectCapabilities(projectPath: string): string[] | undefined {
    const map = this.store.get('projectCapabilities', {});
    const key = normalizePath(projectPath);
    if (!Object.prototype.hasOwnProperty.call(map, key)) return undefined;
    return [...map[key]];
  }

  /**
   * Persist enabled MCP capability IDs for a project.
   */
  setProjectCapabilities(projectPath: string, ids: string[]): void {
    const key = normalizePath(projectPath);
    const map = this.store.get('projectCapabilities', {});
    map[key] = [...ids];
    this.store.set('projectCapabilities', map);
  }

  /**
   * Get the user-configured CDP port for the user's own Electron app
   * running inside this project, or `undefined` if none has been set.
   */
  getProjectElectronCdpPort(projectPath: string): number | undefined {
    const map = this.store.get('projectElectronCdpPort', {});
    const key = normalizePath(projectPath);
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  }

  /**
   * Persist the user's Electron app CDP port for a project.
   */
  setProjectElectronCdpPort(projectPath: string, port: number): void {
    const key = normalizePath(projectPath);
    const map = this.store.get('projectElectronCdpPort', {});
    map[key] = port;
    this.store.set('projectElectronCdpPort', map);
  }

  // ============================================
  // Project Custom Commands
  // ============================================

  /**
   * Get all custom commands defined for a project. Returns an empty array when
   * none have been stored — there are no defaults.
   */
  getProjectCustomCommands(projectPath: string): CustomCommand[] {
    const map = this.store.get('projectCustomCommands', {});
    const key = normalizePath(projectPath);
    const list = map[key];
    return list ? list.map(cmd => ({ ...cmd })) : [];
  }

  /**
   * Replace the full custom command list for a project.
   */
  setProjectCustomCommands(projectPath: string, commands: CustomCommand[]): void {
    const key = normalizePath(projectPath);
    const map = this.store.get('projectCustomCommands', {});
    map[key] = commands.map(cmd => ({ ...cmd }));
    this.store.set('projectCustomCommands', map);
  }

  /**
   * Append a new custom command to a project's list. Generates a stable id
   * and createdAt/updatedAt timestamps. Returns the materialized command.
   */
  addProjectCustomCommand(projectPath: string, input: CustomCommandInput): CustomCommand {
    const now = new Date().toISOString();
    const command: CustomCommand = {
      id: crypto.randomUUID(),
      label: input.label,
      icon: input.icon,
      command: input.command,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.getProjectCustomCommands(projectPath);
    list.push(command);
    this.setProjectCustomCommands(projectPath, list);
    return command;
  }

  /**
   * Apply a partial update to one custom command in a project. Refreshes
   * updatedAt. Returns the updated command, or null when the id is unknown.
   */
  updateProjectCustomCommand(
    projectPath: string,
    id: string,
    updates: CustomCommandUpdate
  ): CustomCommand | null {
    const list = this.getProjectCustomCommands(projectPath);
    const index = list.findIndex(cmd => cmd.id === id);
    if (index === -1) return null;
    const next: CustomCommand = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    list[index] = next;
    this.setProjectCustomCommands(projectPath, list);
    return next;
  }

  /**
   * Remove a custom command from a project's list by id.
   * Returns true when a command was removed, false when the id was not found.
   */
  removeProjectCustomCommand(projectPath: string, id: string): boolean {
    const list = this.getProjectCustomCommands(projectPath);
    const next = list.filter(cmd => cmd.id !== id);
    if (next.length === list.length) return false;
    this.setProjectCustomCommands(projectPath, next);
    return true;
  }

  /**
   * Look up a single custom command by id within a project's list.
   */
  getProjectCustomCommand(projectPath: string, id: string): CustomCommand | undefined {
    return this.getProjectCustomCommands(projectPath).find(cmd => cmd.id === id);
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
