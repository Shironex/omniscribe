import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from './workspace.service';
import type { ProjectTabDTO, QuickAction, SessionHistoryEntry } from '@omniscribe/shared';

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

    it('should reorder tabs', () => {
      service.addTab(mockTab);
      service.addTab({
        id: 'tab-2',
        projectPath: '/project/two',
        name: 'Project Two',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });
      service.addTab({
        id: 'tab-3',
        projectPath: '/project/three',
        name: 'Project Three',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });

      const tabs = service.reorderTabs(['tab-3', 'tab-1', 'tab-2']);

      expect(tabs.map(t => t.id)).toEqual(['tab-3', 'tab-1', 'tab-2']);
    });

    it('should append missing tabs when reordering with partial list', () => {
      service.addTab(mockTab);
      service.addTab({
        id: 'tab-2',
        projectPath: '/project/two',
        name: 'Project Two',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });
      service.addTab({
        id: 'tab-3',
        projectPath: '/project/three',
        name: 'Project Three',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });

      // Only include tab-3 and tab-1, tab-2 should be appended
      const tabs = service.reorderTabs(['tab-3', 'tab-1']);

      expect(tabs.map(t => t.id)).toEqual(['tab-3', 'tab-1', 'tab-2']);
    });

    it('should ignore unknown tab IDs when reordering', () => {
      service.addTab(mockTab);
      service.addTab({
        id: 'tab-2',
        projectPath: '/project/two',
        name: 'Project Two',
        sessionIds: [],
        isActive: false,
        lastAccessedAt: new Date().toISOString(),
      });

      const tabs = service.reorderTabs(['tab-2', 'nonexistent', 'tab-1']);

      expect(tabs.map(t => t.id)).toEqual(['tab-2', 'tab-1']);
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

  describe('project custom commands', () => {
    const projectA = '/Users/me/projectA';
    const projectB = '/Users/me/projectB';

    it('returns an empty list for an unknown project', () => {
      expect(service.getProjectCustomCommands(projectA)).toEqual([]);
    });

    it('adds a command and assigns id + timestamps', () => {
      const command = service.addProjectCustomCommand(projectA, {
        label: 'List',
        icon: 'Folder',
        command: 'ls -la',
      });
      expect(command.id).toBeTruthy();
      expect(command.createdAt).toBeTruthy();
      expect(command.updatedAt).toBe(command.createdAt);
      expect(service.getProjectCustomCommands(projectA)).toHaveLength(1);
    });

    it('keeps separate lists per project', () => {
      service.addProjectCustomCommand(projectA, { label: 'A1', icon: 'Play', command: 'a1' });
      service.addProjectCustomCommand(projectB, { label: 'B1', icon: 'Play', command: 'b1' });
      service.addProjectCustomCommand(projectB, { label: 'B2', icon: 'Play', command: 'b2' });

      expect(service.getProjectCustomCommands(projectA)).toHaveLength(1);
      expect(service.getProjectCustomCommands(projectB)).toHaveLength(2);
    });

    it('updates an existing command and refreshes updatedAt', () => {
      const created = service.addProjectCustomCommand(projectA, {
        label: 'Old',
        icon: 'Play',
        command: 'old',
      });

      // Force a measurable difference between createdAt and updatedAt.
      const later = new Date(Date.parse(created.createdAt) + 1000).toISOString();
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(later);

      const updated = service.updateProjectCustomCommand(projectA, created.id, {
        label: 'New',
      });

      expect(updated?.label).toBe('New');
      expect(updated?.updatedAt).not.toBe(created.createdAt);
      expect(service.getProjectCustomCommands(projectA)[0].label).toBe('New');
    });

    it('returns null when updating an unknown command', () => {
      expect(service.updateProjectCustomCommand(projectA, 'nope', { label: 'x' })).toBeNull();
    });

    it('removes a command and reports the result', () => {
      const created = service.addProjectCustomCommand(projectA, {
        label: 'Drop',
        icon: 'Play',
        command: 'rm',
      });
      expect(service.removeProjectCustomCommand(projectA, created.id)).toBe(true);
      expect(service.removeProjectCustomCommand(projectA, created.id)).toBe(false);
      expect(service.getProjectCustomCommands(projectA)).toEqual([]);
    });

    it('looks up a single command by id within a project', () => {
      const created = service.addProjectCustomCommand(projectA, {
        label: 'Find me',
        icon: 'Play',
        command: 'echo',
      });
      expect(service.getProjectCustomCommand(projectA, created.id)?.label).toBe('Find me');
      expect(service.getProjectCustomCommand(projectA, 'missing')).toBeUndefined();
    });
  });

  describe('session history', () => {
    const projectA = '/Users/me/projectA';
    const projectB = '/Users/me/projectB';

    function makeEntry(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
      return {
        omniscribeSessionId: 'omni-1',
        claudeSessionId: 'claude-1',
        projectPath: projectA,
        name: 'Session 1',
        lastStatus: 'idle',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        ...overrides,
      };
    }

    it('returns an empty list when no entries exist', () => {
      expect(service.getSessionHistory()).toEqual([]);
    });

    it('adds an entry and returns it via getSessionHistory', () => {
      const entry = makeEntry();
      service.addSessionHistory(entry);
      const history = service.getSessionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].claudeSessionId).toBe('claude-1');
    });

    it('puts newer entries first', () => {
      service.addSessionHistory(makeEntry({ claudeSessionId: 'old', name: 'Old' }));
      service.addSessionHistory(makeEntry({ claudeSessionId: 'new', name: 'New' }));
      const history = service.getSessionHistory();
      expect(history.map(h => h.claudeSessionId)).toEqual(['new', 'old']);
    });

    it('deduplicates by claudeSessionId, keeping the new entry on top', () => {
      service.addSessionHistory(makeEntry({ claudeSessionId: 'dup', name: 'first' }));
      service.addSessionHistory(makeEntry({ claudeSessionId: 'other' }));
      service.addSessionHistory(makeEntry({ claudeSessionId: 'dup', name: 'second' }));

      const history = service.getSessionHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ claudeSessionId: 'dup', name: 'second' });
      expect(history[1].claudeSessionId).toBe('other');
    });

    it('prunes to MAX_SESSION_HISTORY (200) entries', () => {
      for (let i = 0; i < 205; i++) {
        service.addSessionHistory(makeEntry({ claudeSessionId: `claude-${i}` }));
      }
      const history = service.getSessionHistory();
      expect(history).toHaveLength(200);
      // Newest first — index 0 must be the last-added entry.
      expect(history[0].claudeSessionId).toBe('claude-204');
    });

    it('filters by project path on getSessionHistory', () => {
      service.addSessionHistory(makeEntry({ claudeSessionId: 'a1', projectPath: projectA }));
      service.addSessionHistory(makeEntry({ claudeSessionId: 'b1', projectPath: projectB }));
      service.addSessionHistory(makeEntry({ claudeSessionId: 'a2', projectPath: projectA }));

      const filtered = service.getSessionHistory(projectA);
      expect(filtered.map(h => h.claudeSessionId).sort()).toEqual(['a1', 'a2']);
    });

    it('normalizes Windows-style backslash paths', () => {
      service.addSessionHistory(
        makeEntry({ claudeSessionId: 'win', projectPath: 'C:\\Users\\me\\proj' })
      );
      const filtered = service.getSessionHistory('C:/Users/me/proj');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].claudeSessionId).toBe('win');
    });

    it('updates an existing entry via updateSessionHistory', () => {
      service.addSessionHistory(makeEntry({ claudeSessionId: 'upd', lastStatus: 'idle' }));
      service.updateSessionHistory('upd', { lastStatus: 'done', exitCode: 0 });

      const [entry] = service.getSessionHistory();
      expect(entry.lastStatus).toBe('done');
      expect(entry.exitCode).toBe(0);
    });

    it('updateSessionHistory is a no-op when claudeSessionId is unknown', () => {
      service.addSessionHistory(makeEntry({ claudeSessionId: 'real' }));
      service.updateSessionHistory('missing', { lastStatus: 'done' });

      const [entry] = service.getSessionHistory();
      expect(entry.lastStatus).toBe('idle');
    });
  });

  describe('project capabilities', () => {
    const projectA = '/Users/me/projectA';
    const projectB = '/Users/me/projectB';

    it('returns undefined when no capabilities have been stored', () => {
      expect(service.getProjectCapabilities(projectA)).toBeUndefined();
    });

    it('returns an empty array when an explicit empty list has been stored', () => {
      service.setProjectCapabilities(projectA, []);
      expect(service.getProjectCapabilities(projectA)).toEqual([]);
    });

    it('round-trips capability ids', () => {
      service.setProjectCapabilities(projectA, ['cap-a', 'cap-b']);
      expect(service.getProjectCapabilities(projectA)).toEqual(['cap-a', 'cap-b']);
    });

    it('keeps separate lists per project', () => {
      service.setProjectCapabilities(projectA, ['a']);
      service.setProjectCapabilities(projectB, ['b1', 'b2']);
      expect(service.getProjectCapabilities(projectA)).toEqual(['a']);
      expect(service.getProjectCapabilities(projectB)).toEqual(['b1', 'b2']);
    });

    it('returns a defensive copy so callers cannot mutate stored state', () => {
      service.setProjectCapabilities(projectA, ['x']);
      const ids = service.getProjectCapabilities(projectA)!;
      ids.push('mutated');
      expect(service.getProjectCapabilities(projectA)).toEqual(['x']);
    });

    it('keys by normalized path so backslashes round-trip with slashes', () => {
      service.setProjectCapabilities('C:\\Users\\me\\proj', ['x']);
      expect(service.getProjectCapabilities('C:/Users/me/proj')).toEqual(['x']);
    });
  });

  describe('project electron CDP port', () => {
    const projectA = '/Users/me/projectA';
    const projectB = '/Users/me/projectB';

    it('returns undefined when none has been stored', () => {
      expect(service.getProjectElectronCdpPort(projectA)).toBeUndefined();
    });

    it('round-trips a port number', () => {
      service.setProjectElectronCdpPort(projectA, 9333);
      expect(service.getProjectElectronCdpPort(projectA)).toBe(9333);
    });

    it('keeps independent ports per project', () => {
      service.setProjectElectronCdpPort(projectA, 9000);
      service.setProjectElectronCdpPort(projectB, 9001);
      expect(service.getProjectElectronCdpPort(projectA)).toBe(9000);
      expect(service.getProjectElectronCdpPort(projectB)).toBe(9001);
    });

    it('overwrites an existing port for the same project', () => {
      service.setProjectElectronCdpPort(projectA, 9000);
      service.setProjectElectronCdpPort(projectA, 9100);
      expect(service.getProjectElectronCdpPort(projectA)).toBe(9100);
    });

    it('keys by normalized path so backslashes round-trip with slashes', () => {
      service.setProjectElectronCdpPort('C:\\Users\\me\\proj', 9222);
      expect(service.getProjectElectronCdpPort('C:/Users/me/proj')).toBe(9222);
    });
  });
});
