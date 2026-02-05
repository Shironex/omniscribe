import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { QuickAction, createLogger } from '@omniscribe/shared';

const logger = createLogger('QuickActionStore');

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
      command:
        "Create a brief implementation plan for this task:\n1. Goal: What we're accomplishing\n2. Approach: How we'll do it\n3. Files to modify and what changes\n4. Tasks (numbered list)\n5. Potential risks or gotchas",
    },
  },
];

/**
 * Quick action state
 */
interface QuickActionState {
  /** List of quick actions */
  actions: QuickAction[];
}

/**
 * Quick action store actions
 */
interface QuickActionActions {
  /** Set all actions */
  setActions: (actions: QuickAction[]) => void;
  /** Add a new action */
  addAction: (action: QuickAction) => void;
  /** Update an existing action */
  updateAction: (id: string, updates: Partial<QuickAction>) => void;
  /** Remove an action by ID */
  removeAction: (id: string) => void;
  /** Reorder actions */
  reorderActions: (fromIndex: number, toIndex: number) => void;
  /** Reset to default actions */
  resetToDefaults: () => void;
  /** Get action by ID */
  getAction: (id: string) => QuickAction | undefined;
  /** Get actions by category */
  getActionsByCategory: (category: QuickAction['category']) => QuickAction[];
  /** Get enabled actions only */
  getEnabledActions: () => QuickAction[];
}

/**
 * Combined store type
 */
type QuickActionStore = QuickActionState & QuickActionActions;

/**
 * Electron storage adapter for Zustand persist middleware
 */
const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    logger.debug('Storage getItem:', name);
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      const value = await window.electronAPI.store.get<string>(name);
      return value ?? null;
    }
    // Fallback to localStorage for web-only mode
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    logger.debug('Storage setItem:', name);
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      await window.electronAPI.store.set(name, value);
    } else {
      // Fallback to localStorage for web-only mode
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    logger.debug('Storage removeItem:', name);
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      await window.electronAPI.store.delete(name);
    } else {
      // Fallback to localStorage for web-only mode
      localStorage.removeItem(name);
    }
  },
};

/**
 * Quick action store using Zustand with persistence
 */
export const useQuickActionStore = create<QuickActionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      actions: DEFAULT_QUICK_ACTIONS,

      // Actions
      setActions: (actions: QuickAction[]) => {
        set({ actions });
      },

      addAction: (action: QuickAction) => {
        set(state => {
          // Check for duplicate ID
          if (state.actions.some(a => a.id === action.id)) {
            logger.warn('Duplicate quick action ID:', action.id);
            return state;
          }
          return { actions: [...state.actions, action] };
        });
      },

      updateAction: (id: string, updates: Partial<QuickAction>) => {
        set(state => ({
          actions: state.actions.map(action =>
            action.id === id ? { ...action, ...updates } : action
          ),
        }));
      },

      removeAction: (id: string) => {
        set(state => ({
          actions: state.actions.filter(action => action.id !== id),
        }));
      },

      reorderActions: (fromIndex: number, toIndex: number) => {
        set(state => {
          const actions = [...state.actions];
          const [removed] = actions.splice(fromIndex, 1);
          if (removed) {
            actions.splice(toIndex, 0, removed);
          }
          return { actions };
        });
      },

      resetToDefaults: () => {
        logger.info('Resetting to default actions');
        set({ actions: DEFAULT_QUICK_ACTIONS });
      },

      getAction: (id: string) => {
        return get().actions.find(action => action.id === id);
      },

      getActionsByCategory: (category: QuickAction['category']) => {
        return get().actions.filter(action => action.category === category);
      },

      getEnabledActions: () => {
        return get().actions.filter(action => action.enabled !== false);
      },
    }),
    {
      name: 'quick-actions',
      storage: createJSONStorage(() => electronStorage),
      partialize: state => ({
        actions: state.actions,
      }),
    }
  )
);

// Selectors

/**
 * Select all actions
 */
export const selectActions = (state: QuickActionStore) => state.actions;

/**
 * Select enabled actions only
 */
export const selectEnabledActions = (state: QuickActionStore) =>
  state.actions.filter(action => action.enabled !== false);

/**
 * Select actions by category
 */
export const selectActionsByCategory =
  (category: QuickAction['category']) => (state: QuickActionStore) =>
    state.actions.filter(action => action.category === category);

/**
 * Select action by ID
 */
export const selectActionById = (id: string) => (state: QuickActionStore) =>
  state.actions.find(action => action.id === id);
