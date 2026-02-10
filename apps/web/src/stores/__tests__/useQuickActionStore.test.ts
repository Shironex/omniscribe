import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuickAction } from '@omniscribe/shared';

// Mock electron store API so persist middleware doesn't fall back to broken localStorage
const mockElectronStore = new Map<string, unknown>();
Object.defineProperty(window, 'electronAPI', {
  value: {
    store: {
      get: vi.fn(async (key: string) => mockElectronStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        mockElectronStore.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        mockElectronStore.delete(key);
      }),
    },
  },
  writable: true,
  configurable: true,
});

// Mock platform
vi.mock('@/lib/platform', () => ({ IS_WINDOWS: false, IS_MAC: true, IS_LINUX: false }));

import {
  useQuickActionStore,
  selectActions,
  selectEnabledActions,
  selectActionsByCategory,
  selectActionById,
} from '../useQuickActionStore';

/**
 * Helper to create a test QuickAction with sensible defaults.
 */
function createTestAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Action',
    description: 'A test action',
    category: 'git',
    icon: 'Wrench',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'test' },
    ...overrides,
  };
}

/**
 * Snapshot of the 8 default action IDs in expected order.
 */
const DEFAULT_ACTION_IDS = [
  'git-commit',
  'git-commit-push',
  'git-push',
  'git-pull',
  'git-status',
  'resolve-conflicts',
  'address-pr-comments',
  'fix-errors',
];

describe('useQuickActionStore', () => {
  let defaultActions: QuickAction[];

  beforeEach(() => {
    // Reset to defaults so every test starts with a known state
    useQuickActionStore.getState().resetToDefaults();
    defaultActions = useQuickActionStore.getState().actions;
  });

  // -----------------------------------------------------------
  // 1. Initial state
  // -----------------------------------------------------------
  describe('initial state', () => {
    it('has 8 default actions', () => {
      expect(defaultActions).toHaveLength(8);
    });

    it('contains all expected default action IDs', () => {
      const ids = defaultActions.map(a => a.id);
      expect(ids).toEqual(DEFAULT_ACTION_IDS);
    });

    it('all default actions are enabled', () => {
      for (const action of defaultActions) {
        expect(action.enabled).toBe(true);
      }
    });

    it('has 7 git actions and 1 ai action', () => {
      const gitActions = defaultActions.filter(a => a.category === 'git');
      const aiActions = defaultActions.filter(a => a.category === 'ai');
      expect(gitActions).toHaveLength(7);
      expect(aiActions).toHaveLength(1);
    });

    it('every default action has a handler', () => {
      for (const action of defaultActions) {
        expect(action.handler).toBe('terminal:execute');
      }
    });
  });

  // -----------------------------------------------------------
  // 2. setActions
  // -----------------------------------------------------------
  describe('setActions', () => {
    it('replaces all actions with the provided list', () => {
      const newActions = [
        createTestAction({ id: 'custom-1' }),
        createTestAction({ id: 'custom-2' }),
      ];

      useQuickActionStore.getState().setActions(newActions);

      const state = useQuickActionStore.getState();
      expect(state.actions).toHaveLength(2);
      expect(state.actions.map(a => a.id)).toEqual(['custom-1', 'custom-2']);
    });

    it('can set an empty list', () => {
      useQuickActionStore.getState().setActions([]);

      expect(useQuickActionStore.getState().actions).toEqual([]);
    });

    it('completely removes previous actions', () => {
      // Start with defaults (8 actions)
      expect(useQuickActionStore.getState().actions).toHaveLength(8);

      const single = [createTestAction({ id: 'only-one' })];
      useQuickActionStore.getState().setActions(single);

      expect(useQuickActionStore.getState().actions).toHaveLength(1);
      expect(useQuickActionStore.getState().actions[0].id).toBe('only-one');
    });
  });

  // -----------------------------------------------------------
  // 3. addAction
  // -----------------------------------------------------------
  describe('addAction', () => {
    it('appends a new action to the end of the list', () => {
      const newAction = createTestAction({ id: 'new-action' });

      useQuickActionStore.getState().addAction(newAction);

      const actions = useQuickActionStore.getState().actions;
      expect(actions).toHaveLength(9);
      expect(actions[actions.length - 1].id).toBe('new-action');
    });

    it('prevents adding an action with a duplicate ID', () => {
      const duplicate = createTestAction({ id: 'git-commit', title: 'Duplicate!' });

      useQuickActionStore.getState().addAction(duplicate);

      const actions = useQuickActionStore.getState().actions;
      // Still 8 — duplicate was rejected
      expect(actions).toHaveLength(8);
      // Original title is preserved
      expect(actions.find(a => a.id === 'git-commit')?.title).toBe('Git Commit');
    });

    it('allows adding multiple unique actions sequentially', () => {
      useQuickActionStore.getState().addAction(createTestAction({ id: 'extra-1' }));
      useQuickActionStore.getState().addAction(createTestAction({ id: 'extra-2' }));
      useQuickActionStore.getState().addAction(createTestAction({ id: 'extra-3' }));

      expect(useQuickActionStore.getState().actions).toHaveLength(11);
    });

    it('does not modify existing actions when adding a new one', () => {
      const before = [...useQuickActionStore.getState().actions];
      useQuickActionStore.getState().addAction(createTestAction({ id: 'new-action' }));

      const after = useQuickActionStore.getState().actions;
      // The first 8 should be identical
      for (let i = 0; i < before.length; i++) {
        expect(after[i]).toEqual(before[i]);
      }
    });
  });

  // -----------------------------------------------------------
  // 4. updateAction
  // -----------------------------------------------------------
  describe('updateAction', () => {
    it('updates the title of an existing action', () => {
      useQuickActionStore.getState().updateAction('git-commit', { title: 'New Title' });

      const updated = useQuickActionStore.getState().actions.find(a => a.id === 'git-commit');
      expect(updated?.title).toBe('New Title');
    });

    it('updates the enabled flag', () => {
      useQuickActionStore.getState().updateAction('git-push', { enabled: false });

      const updated = useQuickActionStore.getState().actions.find(a => a.id === 'git-push');
      expect(updated?.enabled).toBe(false);
    });

    it('updates multiple fields at once', () => {
      useQuickActionStore.getState().updateAction('fix-errors', {
        title: 'Fix All Errors',
        description: 'Updated description',
        icon: 'Bug',
      });

      const updated = useQuickActionStore.getState().actions.find(a => a.id === 'fix-errors');
      expect(updated?.title).toBe('Fix All Errors');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.icon).toBe('Bug');
    });

    it('does not affect other actions', () => {
      const beforePush = {
        ...useQuickActionStore.getState().actions.find(a => a.id === 'git-push')!,
      };

      useQuickActionStore.getState().updateAction('git-commit', { title: 'Changed' });

      const afterPush = useQuickActionStore.getState().actions.find(a => a.id === 'git-push');
      expect(afterPush).toEqual(beforePush);
    });

    it('handles updating a non-existent action gracefully (no-op)', () => {
      const before = [...useQuickActionStore.getState().actions];

      useQuickActionStore.getState().updateAction('non-existent-id', { title: 'Ghost' });

      const after = useQuickActionStore.getState().actions;
      expect(after).toEqual(before);
    });

    it('preserves unchanged fields', () => {
      const original = {
        ...useQuickActionStore.getState().actions.find(a => a.id === 'git-status')!,
      };

      useQuickActionStore.getState().updateAction('git-status', { title: 'Status Check' });

      const updated = useQuickActionStore.getState().actions.find(a => a.id === 'git-status');
      expect(updated?.description).toBe(original.description);
      expect(updated?.category).toBe(original.category);
      expect(updated?.handler).toBe(original.handler);
      expect(updated?.icon).toBe(original.icon);
    });
  });

  // -----------------------------------------------------------
  // 5. removeAction
  // -----------------------------------------------------------
  describe('removeAction', () => {
    it('removes an action by ID', () => {
      useQuickActionStore.getState().removeAction('git-push');

      const actions = useQuickActionStore.getState().actions;
      expect(actions).toHaveLength(7);
      expect(actions.find(a => a.id === 'git-push')).toBeUndefined();
    });

    it('does not affect other actions when removing one', () => {
      useQuickActionStore.getState().removeAction('git-push');

      const ids = useQuickActionStore.getState().actions.map(a => a.id);
      expect(ids).toEqual([
        'git-commit',
        'git-commit-push',
        'git-pull',
        'git-status',
        'resolve-conflicts',
        'address-pr-comments',
        'fix-errors',
      ]);
    });

    it('handles removing a non-existent action gracefully', () => {
      useQuickActionStore.getState().removeAction('does-not-exist');

      expect(useQuickActionStore.getState().actions).toHaveLength(8);
    });

    it('can remove all actions one by one', () => {
      for (const id of DEFAULT_ACTION_IDS) {
        useQuickActionStore.getState().removeAction(id);
      }

      expect(useQuickActionStore.getState().actions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------
  // 6. reorderActions
  // -----------------------------------------------------------
  describe('reorderActions', () => {
    it('moves an action from one index to another (forward)', () => {
      // Move first item (git-commit, index 0) to index 2
      useQuickActionStore.getState().reorderActions(0, 2);

      const ids = useQuickActionStore.getState().actions.map(a => a.id);
      expect(ids[0]).toBe('git-commit-push');
      expect(ids[1]).toBe('git-push');
      expect(ids[2]).toBe('git-commit');
    });

    it('moves an action from one index to another (backward)', () => {
      // Move last item (fix-errors, index 7) to index 0
      useQuickActionStore.getState().reorderActions(7, 0);

      const ids = useQuickActionStore.getState().actions.map(a => a.id);
      expect(ids[0]).toBe('fix-errors');
      expect(ids[1]).toBe('git-commit');
    });

    it('is a no-op when fromIndex equals toIndex', () => {
      const before = useQuickActionStore.getState().actions.map(a => a.id);

      useQuickActionStore.getState().reorderActions(3, 3);

      const after = useQuickActionStore.getState().actions.map(a => a.id);
      expect(after).toEqual(before);
    });

    it('preserves the total number of actions', () => {
      useQuickActionStore.getState().reorderActions(0, 7);

      expect(useQuickActionStore.getState().actions).toHaveLength(8);
    });

    it('handles moving to the last position', () => {
      useQuickActionStore.getState().reorderActions(0, 7);

      const ids = useQuickActionStore.getState().actions.map(a => a.id);
      expect(ids[ids.length - 1]).toBe('git-commit');
    });

    it('does not lose or duplicate any actions', () => {
      useQuickActionStore.getState().reorderActions(2, 5);

      const ids = useQuickActionStore.getState().actions.map(a => a.id);
      // All IDs should be present exactly once
      expect([...ids].sort()).toEqual([...DEFAULT_ACTION_IDS].sort());
    });
  });

  // -----------------------------------------------------------
  // 7. resetToDefaults
  // -----------------------------------------------------------
  describe('resetToDefaults', () => {
    it('restores all 8 default actions after modifications', () => {
      useQuickActionStore.getState().removeAction('git-commit');
      useQuickActionStore.getState().removeAction('git-push');
      expect(useQuickActionStore.getState().actions).toHaveLength(6);

      useQuickActionStore.getState().resetToDefaults();

      expect(useQuickActionStore.getState().actions).toHaveLength(8);
      expect(useQuickActionStore.getState().actions.map(a => a.id)).toEqual(DEFAULT_ACTION_IDS);
    });

    it('restores defaults after setActions with empty list', () => {
      useQuickActionStore.getState().setActions([]);
      expect(useQuickActionStore.getState().actions).toHaveLength(0);

      useQuickActionStore.getState().resetToDefaults();

      expect(useQuickActionStore.getState().actions).toHaveLength(8);
    });

    it('restores defaults after adding custom actions', () => {
      useQuickActionStore.getState().addAction(createTestAction({ id: 'custom-1' }));
      useQuickActionStore.getState().addAction(createTestAction({ id: 'custom-2' }));
      expect(useQuickActionStore.getState().actions).toHaveLength(10);

      useQuickActionStore.getState().resetToDefaults();

      expect(useQuickActionStore.getState().actions).toHaveLength(8);
      expect(useQuickActionStore.getState().actions.map(a => a.id)).toEqual(DEFAULT_ACTION_IDS);
    });

    it('restores original action properties after updates', () => {
      useQuickActionStore.getState().updateAction('git-commit', {
        title: 'Modified',
        enabled: false,
      });

      useQuickActionStore.getState().resetToDefaults();

      const gitCommit = useQuickActionStore.getState().actions.find(a => a.id === 'git-commit');
      expect(gitCommit?.title).toBe('Git Commit');
      expect(gitCommit?.enabled).toBe(true);
    });

    it('restores original ordering after reorder', () => {
      useQuickActionStore.getState().reorderActions(0, 7);

      useQuickActionStore.getState().resetToDefaults();

      expect(useQuickActionStore.getState().actions.map(a => a.id)).toEqual(DEFAULT_ACTION_IDS);
    });
  });

  // -----------------------------------------------------------
  // 8. Selectors
  // -----------------------------------------------------------
  describe('selectors', () => {
    describe('selectActions', () => {
      it('returns all actions', () => {
        const actions = selectActions(useQuickActionStore.getState());
        expect(actions).toHaveLength(8);
        expect(actions).toEqual(useQuickActionStore.getState().actions);
      });

      it('returns empty array when no actions exist', () => {
        useQuickActionStore.getState().setActions([]);

        expect(selectActions(useQuickActionStore.getState())).toEqual([]);
      });
    });

    describe('selectEnabledActions', () => {
      it('returns all actions when all are enabled', () => {
        const enabled = selectEnabledActions(useQuickActionStore.getState());
        expect(enabled).toHaveLength(8);
      });

      it('filters out disabled actions', () => {
        useQuickActionStore.getState().updateAction('git-push', { enabled: false });
        useQuickActionStore.getState().updateAction('git-pull', { enabled: false });

        const enabled = selectEnabledActions(useQuickActionStore.getState());
        expect(enabled).toHaveLength(6);
        expect(enabled.find(a => a.id === 'git-push')).toBeUndefined();
        expect(enabled.find(a => a.id === 'git-pull')).toBeUndefined();
      });

      it('returns empty array when all actions are disabled', () => {
        for (const action of defaultActions) {
          useQuickActionStore.getState().updateAction(action.id, { enabled: false });
        }

        const enabled = selectEnabledActions(useQuickActionStore.getState());
        expect(enabled).toHaveLength(0);
      });
    });

    describe('selectActionsByCategory', () => {
      it('returns only git actions', () => {
        const gitActions = selectActionsByCategory('git')(useQuickActionStore.getState());
        expect(gitActions).toHaveLength(7);
        for (const action of gitActions) {
          expect(action.category).toBe('git');
        }
      });

      it('returns only ai actions', () => {
        const aiActions = selectActionsByCategory('ai')(useQuickActionStore.getState());
        expect(aiActions).toHaveLength(1);
        expect(aiActions[0].id).toBe('fix-errors');
      });

      it('returns empty array for a category with no actions', () => {
        const fileActions = selectActionsByCategory('file')(useQuickActionStore.getState());
        expect(fileActions).toEqual([]);
      });

      it('reflects additions to a category', () => {
        useQuickActionStore
          .getState()
          .addAction(createTestAction({ id: 'ai-refactor', category: 'ai' }));

        const aiActions = selectActionsByCategory('ai')(useQuickActionStore.getState());
        expect(aiActions).toHaveLength(2);
      });
    });

    describe('selectActionById', () => {
      it('returns the correct action by ID', () => {
        const action = selectActionById('git-commit')(useQuickActionStore.getState());
        expect(action).toBeDefined();
        expect(action?.id).toBe('git-commit');
        expect(action?.title).toBe('Git Commit');
      });

      it('returns undefined for a non-existent ID', () => {
        const action = selectActionById('non-existent')(useQuickActionStore.getState());
        expect(action).toBeUndefined();
      });

      it('returns updated data after an update', () => {
        useQuickActionStore.getState().updateAction('fix-errors', { title: 'Fix All' });

        const action = selectActionById('fix-errors')(useQuickActionStore.getState());
        expect(action?.title).toBe('Fix All');
      });

      it('returns undefined after the action is removed', () => {
        useQuickActionStore.getState().removeAction('git-status');

        const action = selectActionById('git-status')(useQuickActionStore.getState());
        expect(action).toBeUndefined();
      });
    });
  });
});
