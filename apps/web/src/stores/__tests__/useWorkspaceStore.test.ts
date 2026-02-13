import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import { DEFAULT_PREFERENCES } from '@omniscribe/shared';
import type { ProjectTab } from '@omniscribe/shared';

// Mock the socket module
vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

// Mock socketHelpers (used by restoreState via emitAsync)
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: vi.fn(),
  emitWithErrorHandling: vi.fn(),
  emitWithSuccessHandling: vi.fn(),
}));

// Mock useSettingsStore (used by openProject)
vi.mock('../useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ theme: 'dark' }),
  },
}));

import {
  useWorkspaceStore,
  selectTabs,
  selectActiveTab,
  selectTabByProjectPath,
  selectPreferences,
  selectIsRestored,
} from '../useWorkspaceStore';
import { emitAsync } from '@/lib/socketHelpers';

const mockEmitAsync = vi.mocked(emitAsync);

function createMockTab(overrides: Partial<ProjectTab> = {}): ProjectTab {
  return {
    id: `tab-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: '/test/project',
    name: 'Test Project',
    sessionIds: [],
    isActive: false,
    lastAccessedAt: new Date(),
    ...overrides,
  };
}

const initialState = {
  tabs: [],
  activeTabId: null,
  preferences: DEFAULT_PREFERENCES,
  isRestored: false,
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useWorkspaceStore.setState(initialState);
  });

  afterEach(() => {
    const state = useWorkspaceStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  describe('initial state', () => {
    it('has empty tabs', () => {
      expect(useWorkspaceStore.getState().tabs).toEqual([]);
    });

    it('has null activeTabId', () => {
      expect(useWorkspaceStore.getState().activeTabId).toBeNull();
    });

    it('has default preferences', () => {
      expect(useWorkspaceStore.getState().preferences).toEqual(DEFAULT_PREFERENCES);
    });

    it('is not restored', () => {
      expect(useWorkspaceStore.getState().isRestored).toBe(false);
    });
  });

  describe('addSessionToTab', () => {
    it('adds a session ID to the specified tab', () => {
      const tab = createMockTab({ id: 'tab-1', sessionIds: [] });
      useWorkspaceStore.setState({ tabs: [tab] });

      useWorkspaceStore.getState().addSessionToTab('tab-1', 'sess-1');

      const updated = useWorkspaceStore.getState().tabs[0];
      expect(updated.sessionIds).toEqual(['sess-1']);
    });

    it('does not add a duplicate session ID', () => {
      const tab = createMockTab({ id: 'tab-1', sessionIds: ['sess-1'] });
      useWorkspaceStore.setState({ tabs: [tab] });

      useWorkspaceStore.getState().addSessionToTab('tab-1', 'sess-1');

      expect(useWorkspaceStore.getState().tabs[0].sessionIds).toEqual(['sess-1']);
    });

    it('does not affect other tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1', sessionIds: [] });
      const tab2 = createMockTab({ id: 'tab-2', sessionIds: ['existing'] });
      useWorkspaceStore.setState({ tabs: [tab1, tab2] });

      useWorkspaceStore.getState().addSessionToTab('tab-1', 'sess-1');

      expect(useWorkspaceStore.getState().tabs[1].sessionIds).toEqual(['existing']);
    });
  });

  describe('removeSessionFromTab', () => {
    it('removes a session ID from the specified tab', () => {
      const tab = createMockTab({ id: 'tab-1', sessionIds: ['sess-1', 'sess-2'] });
      useWorkspaceStore.setState({ tabs: [tab] });

      useWorkspaceStore.getState().removeSessionFromTab('tab-1', 'sess-1');

      expect(useWorkspaceStore.getState().tabs[0].sessionIds).toEqual(['sess-2']);
    });

    it('handles removing a non-existent session ID gracefully', () => {
      const tab = createMockTab({ id: 'tab-1', sessionIds: ['sess-1'] });
      useWorkspaceStore.setState({ tabs: [tab] });

      useWorkspaceStore.getState().removeSessionFromTab('tab-1', 'non-existent');

      expect(useWorkspaceStore.getState().tabs[0].sessionIds).toEqual(['sess-1']);
    });
  });

  describe('clearStaleSessions', () => {
    it('removes session IDs not in the valid list', () => {
      const tab = createMockTab({ id: 'tab-1', sessionIds: ['sess-1', 'sess-2', 'sess-3'] });
      useWorkspaceStore.setState({ tabs: [tab] });

      useWorkspaceStore.getState().clearStaleSessions(['sess-1', 'sess-3']);

      expect(useWorkspaceStore.getState().tabs[0].sessionIds).toEqual(['sess-1', 'sess-3']);
    });

    it('clears all session IDs when valid list is empty', () => {
      const tab = createMockTab({ id: 'tab-1', sessionIds: ['sess-1', 'sess-2'] });
      useWorkspaceStore.setState({ tabs: [tab] });

      useWorkspaceStore.getState().clearStaleSessions([]);

      expect(useWorkspaceStore.getState().tabs[0].sessionIds).toEqual([]);
    });

    it('applies to all tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1', sessionIds: ['sess-1', 'sess-2'] });
      const tab2 = createMockTab({ id: 'tab-2', sessionIds: ['sess-2', 'sess-3'] });
      useWorkspaceStore.setState({ tabs: [tab1, tab2] });

      useWorkspaceStore.getState().clearStaleSessions(['sess-1']);

      expect(useWorkspaceStore.getState().tabs[0].sessionIds).toEqual(['sess-1']);
      expect(useWorkspaceStore.getState().tabs[1].sessionIds).toEqual([]);
    });
  });

  describe('setTabs', () => {
    it('replaces tabs and activeTabId', () => {
      const tabs = [createMockTab({ id: 'tab-1' }), createMockTab({ id: 'tab-2' })];
      useWorkspaceStore.getState().setTabs(tabs, 'tab-2');

      expect(useWorkspaceStore.getState().tabs).toHaveLength(2);
      expect(useWorkspaceStore.getState().activeTabId).toBe('tab-2');
    });
  });

  describe('setPreferences', () => {
    it('replaces preferences', () => {
      const prefs = { ...DEFAULT_PREFERENCES, theme: 'light' as const };
      useWorkspaceStore.getState().setPreferences(prefs);

      expect(useWorkspaceStore.getState().preferences.theme).toBe('light');
    });
  });

  describe('updatePreference', () => {
    it('emits the update preference event via socket', () => {
      useWorkspaceStore.getState().updatePreference('theme', 'catppuccin-mocha');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'workspace:update-preference',
        { key: 'theme', value: 'catppuccin-mocha' },
        expect.any(Function)
      );
    });

    it('updates state when server responds with success', () => {
      const newPrefs = { ...DEFAULT_PREFERENCES, theme: 'catppuccin-mocha' as never };
      mockSocket.emit.mockImplementation(
        (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
          callback({ success: true, preferences: newPrefs });
        }
      );

      useWorkspaceStore.getState().updatePreference('theme', 'catppuccin-mocha');

      expect(useWorkspaceStore.getState().preferences).toEqual(newPrefs);
    });
  });

  describe('openProject', () => {
    it('emits add-tab for a new project', () => {
      // Provide a proper response so the callback does not crash
      mockSocket.emit.mockImplementation(
        (_event: string, _payload: unknown, callback?: (response: unknown) => void) => {
          callback?.({ success: true, tabs: [], activeTabId: null });
        }
      );

      useWorkspaceStore.getState().openProject('/new/project', 'My Project');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'workspace:add-tab',
        expect.objectContaining({
          projectPath: '/new/project',
          name: 'My Project',
        }),
        expect.any(Function)
      );
    });

    it('emits select-tab for an already-open project', () => {
      const existingTab = createMockTab({ id: 'tab-1', projectPath: '/existing/project' });
      useWorkspaceStore.setState({ tabs: [existingTab] });

      mockSocket.emit.mockImplementation(
        (_event: string, _payload: unknown, callback?: (response: unknown) => void) => {
          callback?.({ success: true, tabs: [], activeTabId: 'tab-1' });
        }
      );

      useWorkspaceStore.getState().openProject('/existing/project');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'workspace:select-tab',
        { tabId: 'tab-1' },
        expect.any(Function)
      );
    });
  });

  describe('closeTab', () => {
    it('emits remove-tab event', () => {
      mockSocket.emit.mockImplementation(
        (_event: string, _payload: unknown, callback?: (response: unknown) => void) => {
          callback?.({ success: true, tabs: [], activeTabId: null });
        }
      );

      useWorkspaceStore.getState().closeTab('tab-1');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'workspace:remove-tab',
        { tabId: 'tab-1' },
        expect.any(Function)
      );
    });

    it('updates state when server responds', () => {
      const remainingTab = {
        id: 'tab-2',
        projectPath: '/other',
        name: 'Other',
        sessionIds: [],
        isActive: true,
        lastAccessedAt: new Date().toISOString(),
      };

      mockSocket.emit.mockImplementation(
        (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
          callback({ success: true, tabs: [remainingTab], activeTabId: 'tab-2' });
        }
      );

      useWorkspaceStore.getState().closeTab('tab-1');

      const state = useWorkspaceStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe('tab-2');
    });
  });

  describe('selectTab', () => {
    it('optimistically sets activeTabId before socket response', () => {
      const tab = createMockTab({ id: 'tab-1' });
      useWorkspaceStore.setState({ tabs: [tab], activeTabId: null });

      // emit never calls callback in this test
      mockSocket.emit.mockImplementation(() => {});

      useWorkspaceStore.getState().selectTab('tab-1');

      // Optimistic update should have happened
      expect(useWorkspaceStore.getState().activeTabId).toBe('tab-1');
    });

    it('rolls back on failure', () => {
      const tab = createMockTab({ id: 'tab-1' });
      useWorkspaceStore.setState({ tabs: [tab], activeTabId: 'old-tab' });

      mockSocket.emit.mockImplementation(
        (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
          callback({ success: false });
        }
      );

      useWorkspaceStore.getState().selectTab('tab-1');

      expect(useWorkspaceStore.getState().activeTabId).toBe('old-tab');
    });
  });

  describe('restoreState', () => {
    it('restores tabs and preferences from server', async () => {
      const tabDTO = {
        id: 'tab-1',
        projectPath: '/project',
        name: 'Project',
        sessionIds: ['sess-1'],
        isActive: true,
        lastAccessedAt: new Date().toISOString(),
      };

      mockEmitAsync.mockResolvedValue({
        tabs: [tabDTO],
        activeTabId: 'tab-1',
        preferences: { ...DEFAULT_PREFERENCES, theme: 'nord' },
      });

      await useWorkspaceStore.getState().restoreState();

      const state = useWorkspaceStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe('tab-1');
      // Session IDs should be cleared on restore
      expect(state.tabs[0].sessionIds).toEqual([]);
      expect(state.activeTabId).toBe('tab-1');
      expect(state.isRestored).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('does not call emitAsync if already restored', async () => {
      useWorkspaceStore.setState({ isRestored: true });

      await useWorkspaceStore.getState().restoreState();

      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('does not call emitAsync if already loading', async () => {
      useWorkspaceStore.setState({ isLoading: true });

      await useWorkspaceStore.getState().restoreState();

      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Timeout'));

      await useWorkspaceStore.getState().restoreState();

      const state = useWorkspaceStore.getState();
      expect(state.isRestored).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Timeout');
    });

    it('handles empty response', async () => {
      mockEmitAsync.mockResolvedValue(null);

      await useWorkspaceStore.getState().restoreState();

      const state = useWorkspaceStore.getState();
      expect(state.isRestored).toBe(true);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('selectors', () => {
    describe('selectTabs', () => {
      it('returns all tabs', () => {
        const tabs = [createMockTab({ id: 't1' }), createMockTab({ id: 't2' })];
        useWorkspaceStore.setState({ tabs });

        expect(selectTabs(useWorkspaceStore.getState())).toEqual(tabs);
      });
    });

    describe('selectActiveTab', () => {
      it('returns the active tab', () => {
        const tabs = [createMockTab({ id: 't1' }), createMockTab({ id: 't2' })];
        useWorkspaceStore.setState({ tabs, activeTabId: 't2' });

        expect(selectActiveTab(useWorkspaceStore.getState())?.id).toBe('t2');
      });

      it('returns undefined when no active tab', () => {
        useWorkspaceStore.setState({ tabs: [], activeTabId: null });

        expect(selectActiveTab(useWorkspaceStore.getState())).toBeUndefined();
      });
    });

    describe('selectTabByProjectPath', () => {
      it('finds tab by project path', () => {
        const tabs = [createMockTab({ id: 't1', projectPath: '/project-a' })];
        useWorkspaceStore.setState({ tabs });

        const result = selectTabByProjectPath('/project-a')(useWorkspaceStore.getState());
        expect(result?.id).toBe('t1');
      });

      it('normalizes backslash paths for matching', () => {
        const tabs = [createMockTab({ id: 't1', projectPath: '/project/path' })];
        useWorkspaceStore.setState({ tabs });

        // Windows-style path should still match
        const result = selectTabByProjectPath('\\project\\path')(useWorkspaceStore.getState());
        expect(result?.id).toBe('t1');
      });

      it('returns undefined for unknown project path', () => {
        const result = selectTabByProjectPath('/unknown')(useWorkspaceStore.getState());
        expect(result).toBeUndefined();
      });
    });

    describe('selectPreferences', () => {
      it('returns current preferences', () => {
        expect(selectPreferences(useWorkspaceStore.getState())).toEqual(DEFAULT_PREFERENCES);
      });
    });

    describe('selectIsRestored', () => {
      it('returns the isRestored flag', () => {
        expect(selectIsRestored(useWorkspaceStore.getState())).toBe(false);

        useWorkspaceStore.setState({ isRestored: true });
        expect(selectIsRestored(useWorkspaceStore.getState())).toBe(true);
      });
    });
  });
});
