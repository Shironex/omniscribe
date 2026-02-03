import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { QuickAction } from '@omniscribe/shared';

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
        set((state) => {
          // Check for duplicate ID
          if (state.actions.some((a) => a.id === action.id)) {
            console.warn(`Quick action with ID "${action.id}" already exists`);
            return state;
          }
          return { actions: [...state.actions, action] };
        });
      },

      updateAction: (id: string, updates: Partial<QuickAction>) => {
        set((state) => ({
          actions: state.actions.map((action) =>
            action.id === id ? { ...action, ...updates } : action
          ),
        }));
      },

      removeAction: (id: string) => {
        set((state) => ({
          actions: state.actions.filter((action) => action.id !== id),
        }));
      },

      reorderActions: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const actions = [...state.actions];
          const [removed] = actions.splice(fromIndex, 1);
          if (removed) {
            actions.splice(toIndex, 0, removed);
          }
          return { actions };
        });
      },

      resetToDefaults: () => {
        set({ actions: DEFAULT_QUICK_ACTIONS });
      },

      getAction: (id: string) => {
        return get().actions.find((action) => action.id === id);
      },

      getActionsByCategory: (category: QuickAction['category']) => {
        return get().actions.filter((action) => action.category === category);
      },

      getEnabledActions: () => {
        return get().actions.filter((action) => action.enabled !== false);
      },
    }),
    {
      name: 'quick-actions',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
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
  state.actions.filter((action) => action.enabled !== false);

/**
 * Select actions by category
 */
export const selectActionsByCategory =
  (category: QuickAction['category']) => (state: QuickActionStore) =>
    state.actions.filter((action) => action.category === category);

/**
 * Select action by ID
 */
export const selectActionById = (id: string) => (state: QuickActionStore) =>
  state.actions.find((action) => action.id === id);
