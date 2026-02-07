import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from './workspace.service';
import type { ProjectTabDTO, QuickAction } from '@omniscribe/shared';

// Mock electron-store with an in-memory implementation
jest.mock('electron-store', () => {
  return {
    __esModule: true,
    default: class MockStore {
      private data: Map<string, unknown>;
      readonly path = '/mock/store/path.json';

      constructor(options?: { name?: string; defaults?: Record<string, unknown> }) {
        this.data = new Map();
        if (options?.defaults) {
          for (const [key, value] of Object.entries(options.defaults)) {
            this.data.set(key, JSON.parse(JSON.stringify(value)));
          }
        }
      }

      get(key: string, defaultValue?: unknown): unknown {
        if (this.data.has(key)) {
          return JSON.parse(JSON.stringify(this.data.get(key)));
        }
        return defaultValue;
      }

      set(key: string, value: unknown): void {
        this.data.set(key, JSON.parse(JSON.stringify(value)));
      }

      has(key: string): boolean {
        return this.data.has(key);
      }

      delete(key: string): void {
        this.data.delete(key);
      }

      clear(): void {
        this.data.clear();
      }
    },
  };
});

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkspaceService],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  describe('onModuleInit', () => {
    it('should ensure quick actions exist after init', () => {
      service.onModuleInit();

      const quickActions = service.getQuickActions();
      expect(quickActions.length).toBeGreaterThan(0);
    });
  });

  describe('tabs management', () => {
    const mockTab: ProjectTabDTO = {
      id: 'tab-1',
      projectPath: '/project/one',
      name: 'Project One',
      sessionIds: [],
      isActive: false,
      lastAccessedAt: new Date().toISOString(),
    };

    it('should return empty tabs initially', () => {
      expect(service.getTabs()).toEqual([]);
    });

    it('should add a tab and make it active', () => {
      const tabs = service.addTab(mockTab);

      expect(tabs).toHaveLength(1);
      expect(tabs[0].isActive).toBe(true);
      expect(service.getActiveTabId()).toBe('tab-1');
    });

    it('should not duplicate tabs for the same project path', () => {
      service.addTab(mockTab);
      const tabs = service.addTab({ ...mockTab, id: 'tab-1-dup' });

      // Should still be 1 tab (updated, not duplicated)
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe('tab-1');
    });

    it('should deactivate other tabs when adding a new one', () => {
      service.addTab(mockTab);
      const tabs = service.addTab({
        id: 'tab-2',
        projectPath: '/project/two',
        name: 'Project Two',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });

      const active = tabs.filter(t => t.isActive);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('tab-2');
    });

    it('should remove a tab', () => {
      service.addTab(mockTab);
      const { tabs, activeTabId } = service.removeTab('tab-1');

      expect(tabs).toHaveLength(0);
      expect(activeTabId).toBeNull();
    });

    it('should select an adjacent tab when removing the active tab', () => {
      service.addTab(mockTab);
      service.addTab({
        id: 'tab-2',
        projectPath: '/project/two',
        name: 'Project Two',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });

      const { tabs, activeTabId } = service.removeTab('tab-2');

      expect(tabs).toHaveLength(1);
      expect(activeTabId).toBe('tab-1');
      expect(tabs[0].isActive).toBe(true);
    });

    it('should select a tab', () => {
      service.addTab(mockTab);
      service.addTab({
        id: 'tab-2',
        projectPath: '/project/two',
        name: 'Project Two',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });

      const tabs = service.selectTab('tab-1');

      const active = tabs.filter(t => t.isActive);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('tab-1');
    });

    it('should update a tab theme', () => {
      service.addTab(mockTab);
      const tabs = service.updateTabTheme('tab-1', 'monokai');

      expect(tabs[0].theme).toBe('monokai');
    });
  });

  describe('quick actions', () => {
    it('should return default quick actions', () => {
      const actions = service.getQuickActions();

      expect(actions.length).toBe(11);
      expect(actions.map(a => a.id)).toEqual([
        'git-commit',
        'git-commit-push',
        'git-push',
        'git-pull',
        'git-status',
        'resolve-conflicts',
        'address-pr-comments',
        'run-app',
        'lint-format',
        'fix-errors',
        'plan-implementation',
      ]);
    });

    it('should set custom quick actions', () => {
      const custom: QuickAction[] = [
        {
          id: 'custom-1',
          title: 'Custom Action',
          description: 'A custom action',
          category: 'terminal',
          icon: 'Zap',
          enabled: true,
          handler: 'terminal:execute',
          params: { command: 'echo hi' },
        },
      ];

      service.setQuickActions(custom);
      const actions = service.getQuickActions();

      expect(actions).toHaveLength(1);
      expect(actions[0].id).toBe('custom-1');
    });

    it('should reset quick actions to defaults', () => {
      service.setQuickActions([]);
      service.resetQuickActionsToDefaults();

      const actions = service.getQuickActions();
      expect(actions.length).toBe(11);
    });
  });

  describe('preferences', () => {
    it('should return default preferences', () => {
      const prefs = service.getPreferences();

      expect(prefs.theme).toBe('dark');
      expect(prefs.worktree).toBeDefined();
    });

    it('should update preferences', () => {
      service.setPreferences({
        theme: 'light',
        worktree: { mode: 'never', autoCleanup: false, location: 'project' },
      });

      expect(service.getPreferences().theme).toBe('light');
    });

    it('should get a single preference', () => {
      expect(service.getPreference<string>('theme')).toBe('dark');
    });

    it('should set a single preference', () => {
      service.setPreference('theme', 'solarized');

      expect(service.getPreference<string>('theme')).toBe('solarized');
    });

    it('should delete a preference', () => {
      service.setPreference('customKey', 'value');
      service.deletePreference('customKey');

      expect(service.getPreference('customKey')).toBeUndefined();
    });
  });

  describe('generic store operations', () => {
    it('should get/set arbitrary keys', () => {
      service.set('myKey', { data: 42 });
      expect(service.get<{ data: number }>('myKey')).toEqual({ data: 42 });
    });

    it('should check key existence', () => {
      expect(service.has('nonexistent')).toBe(false);
      service.set('exists', true);
      expect(service.has('exists')).toBe(true);
    });

    it('should delete keys', () => {
      service.set('toDelete', 'value');
      service.delete('toDelete');
      expect(service.has('toDelete')).toBe(false);
    });

    it('should clear all data', () => {
      service.set('key1', 'val1');
      service.set('key2', 'val2');
      service.clear();

      expect(service.has('key1')).toBe(false);
      expect(service.has('key2')).toBe(false);
    });

    it('should return the store path', () => {
      expect(service.getStorePath()).toBe('/mock/store/path.json');
    });
  });

  describe('workspace state', () => {
    it('should return complete workspace state', () => {
      const state = service.getWorkspaceState();

      expect(state).toHaveProperty('tabs');
      expect(state).toHaveProperty('activeTabId');
      expect(state).toHaveProperty('preferences');
      expect(state).toHaveProperty('quickActions');
    });

    it('should save partial workspace state', () => {
      service.saveWorkspaceState({
        activeTabId: 'tab-5',
      });

      expect(service.getActiveTabId()).toBe('tab-5');
    });
  });
});
