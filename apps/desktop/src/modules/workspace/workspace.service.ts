import { Injectable, OnModuleInit } from '@nestjs/common';
import Store from 'electron-store';
import { WorkspaceTab, QuickAction } from '@omniscribe/shared';

/**
 * Store schema for type safety
 */
interface StoreSchema {
  tabs: WorkspaceTab[];
  quickActions: QuickAction[];
  preferences: Record<string, unknown>;
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
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'workspace',
      defaults: {
        tabs: [],
        quickActions: DEFAULT_QUICK_ACTIONS,
        preferences: {},
      },
    });
  }

  /**
   * Initialize default values on module init
   */
  onModuleInit(): void {
    // Ensure quick actions exist
    const quickActions = this.store.get('quickActions');
    if (!quickActions || quickActions.length === 0) {
      this.store.set('quickActions', DEFAULT_QUICK_ACTIONS);
    }
  }

  // ============================================
  // Tabs Management
  // ============================================

  /**
   * Get all workspace tabs
   */
  getTabs(): WorkspaceTab[] {
    return this.store.get('tabs', []);
  }

  /**
   * Set workspace tabs
   */
  setTabs(tabs: WorkspaceTab[]): void {
    this.store.set('tabs', tabs);
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
  getPreferences(): Record<string, unknown> {
    return this.store.get('preferences', {});
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
  setPreference(key: string, value: unknown): void {
    const preferences = this.getPreferences();
    preferences[key] = value;
    this.store.set('preferences', preferences);
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
    this.store.clear();
  }

  /**
   * Get the store path (useful for debugging)
   */
  getStorePath(): string {
    return this.store.path;
  }
}
