import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks (must be declared before any imports that use them) ----

const mockOpenProject = vi.fn();
const mockCloseTab = vi.fn();
const mockSelectTab = vi.fn();

let mockTabs: Array<{ id: string; name: string; projectPath: string }> = [];
let mockActiveTabId: string | null = null;
let mockSessions: Array<{ id: string; projectPath: string; status: string }> = [];

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      tabs: mockTabs,
      activeTabId: mockActiveTabId,
      openProject: mockOpenProject,
      closeTab: mockCloseTab,
      selectTab: mockSelectTab,
    }),
}));

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      sessions: mockSessions,
    }),
}));

// Mock electron API
const mockOpenDirectory = vi.fn();
const mockIsValidProject = vi.fn().mockResolvedValue({ valid: true });

Object.defineProperty(window, 'electronAPI', {
  value: {
    dialog: { openDirectory: mockOpenDirectory },
    app: { isValidProject: mockIsValidProject },
  },
  writable: true,
  configurable: true,
});

// ---- Import under test (after mocks) ----

import { useWorkspaceTabs } from '../useWorkspaceTabs';

// ---- Helpers ----

function setupTabs() {
  mockTabs = [
    { id: 'tab-1', name: 'Project A', projectPath: '/path/a' },
    { id: 'tab-2', name: 'Project B', projectPath: '/path/b' },
  ];
  mockActiveTabId = 'tab-1';
}

// ---- Tests ----

describe('useWorkspaceTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTabs = [];
    mockActiveTabId = null;
    mockSessions = [];
    mockOpenDirectory.mockReset();
    mockIsValidProject.mockReset().mockResolvedValue({ valid: true });
  });

  // ---- tabs derivation ----

  describe('tabs derivation', () => {
    it('converts workspace tabs to UI format with correct ids and labels', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.tabs[0]).toEqual(
        expect.objectContaining({ id: 'tab-1', label: 'Project A' })
      );
      expect(result.current.tabs[1]).toEqual(
        expect.objectContaining({ id: 'tab-2', label: 'Project B' })
      );
    });

    it('returns empty array when there are no workspace tabs', () => {
      mockTabs = [];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs).toEqual([]);
    });

    it('maps each workspace tab to a tab with id, label, and status', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      for (const tab of result.current.tabs) {
        expect(tab).toHaveProperty('id');
        expect(tab).toHaveProperty('label');
        expect(tab).toHaveProperty('status');
      }
    });
  });

  // ---- tab status ----

  describe('tab status', () => {
    it('is idle when there are no sessions', () => {
      setupTabs();
      mockSessions = [];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('idle');
      expect(result.current.tabs[1].status).toBe('idle');
    });

    it('is idle when all sessions for the project are idle', () => {
      setupTabs();
      mockSessions = [
        { id: 's1', projectPath: '/path/a', status: 'idle' },
        { id: 's2', projectPath: '/path/a', status: 'idle' },
      ];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('idle');
    });

    it('is idle when all sessions for the project are disconnected', () => {
      setupTabs();
      mockSessions = [
        { id: 's1', projectPath: '/path/a', status: 'disconnected' },
        { id: 's2', projectPath: '/path/a', status: 'disconnected' },
      ];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('idle');
    });

    it('is idle when sessions are a mix of idle and disconnected', () => {
      setupTabs();
      mockSessions = [
        { id: 's1', projectPath: '/path/a', status: 'idle' },
        { id: 's2', projectPath: '/path/a', status: 'disconnected' },
      ];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('idle');
    });

    it('is working when any session has an active status', () => {
      setupTabs();
      mockSessions = [
        { id: 's1', projectPath: '/path/a', status: 'idle' },
        { id: 's2', projectPath: '/path/a', status: 'working' },
      ];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('working');
    });

    it('is working when a session has needs_input status', () => {
      setupTabs();
      mockSessions = [{ id: 's1', projectPath: '/path/a', status: 'needs_input' }];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('working');
    });

    it('is working when a session has error status', () => {
      setupTabs();
      mockSessions = [{ id: 's1', projectPath: '/path/a', status: 'error' }];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('working');
    });

    it('only considers sessions matching the tab projectPath', () => {
      setupTabs();
      mockSessions = [
        { id: 's1', projectPath: '/path/a', status: 'idle' },
        { id: 's2', projectPath: '/path/b', status: 'working' },
      ];

      const { result } = renderHook(() => useWorkspaceTabs());

      // Tab A should be idle (only s1 matches /path/a)
      expect(result.current.tabs[0].status).toBe('idle');
      // Tab B should be working (s2 matches /path/b)
      expect(result.current.tabs[1].status).toBe('working');
    });

    it('sessions with unrelated projectPath do not affect any tab', () => {
      setupTabs();
      mockSessions = [{ id: 's1', projectPath: '/path/other', status: 'working' }];

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.tabs[0].status).toBe('idle');
      expect(result.current.tabs[1].status).toBe('idle');
    });
  });

  // ---- activeTab ----

  describe('activeTab', () => {
    it('returns the correct active tab when activeTabId matches', () => {
      setupTabs();
      mockActiveTabId = 'tab-2';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTab).toEqual({
        id: 'tab-2',
        name: 'Project B',
        projectPath: '/path/b',
      });
    });

    it('returns the first tab when activeTabId is tab-1', () => {
      setupTabs();
      mockActiveTabId = 'tab-1';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTab).toEqual({
        id: 'tab-1',
        name: 'Project A',
        projectPath: '/path/a',
      });
    });

    it('returns undefined when activeTabId is null', () => {
      setupTabs();
      mockActiveTabId = null;

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTab).toBeUndefined();
    });

    it('returns undefined when activeTabId does not match any tab', () => {
      setupTabs();
      mockActiveTabId = 'nonexistent-tab';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTab).toBeUndefined();
    });

    it('returns undefined when tabs are empty', () => {
      mockTabs = [];
      mockActiveTabId = 'tab-1';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTab).toBeUndefined();
    });
  });

  // ---- activeProjectPath ----

  describe('activeProjectPath', () => {
    it('returns the projectPath of the active tab', () => {
      setupTabs();
      mockActiveTabId = 'tab-1';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeProjectPath).toBe('/path/a');
    });

    it('returns the correct path when a different tab is active', () => {
      setupTabs();
      mockActiveTabId = 'tab-2';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeProjectPath).toBe('/path/b');
    });

    it('returns null when there is no active tab', () => {
      setupTabs();
      mockActiveTabId = null;

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeProjectPath).toBeNull();
    });

    it('returns null when activeTabId does not match any tab', () => {
      setupTabs();
      mockActiveTabId = 'nonexistent';

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeProjectPath).toBeNull();
    });
  });

  // ---- activeTabId ----

  describe('activeTabId', () => {
    it('reflects the store activeTabId', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTabId).toBe('tab-1');
    });

    it('is null when store has no active tab', () => {
      mockActiveTabId = null;

      const { result } = renderHook(() => useWorkspaceTabs());

      expect(result.current.activeTabId).toBeNull();
    });
  });

  // ---- handleSelectTab ----

  describe('handleSelectTab', () => {
    it('calls selectWorkspaceTab with the given tabId', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      act(() => {
        result.current.handleSelectTab('tab-2');
      });

      expect(mockSelectTab).toHaveBeenCalledOnce();
      expect(mockSelectTab).toHaveBeenCalledWith('tab-2');
    });

    it('passes through any tab id string', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      act(() => {
        result.current.handleSelectTab('arbitrary-id');
      });

      expect(mockSelectTab).toHaveBeenCalledWith('arbitrary-id');
    });
  });

  // ---- handleCloseTab ----

  describe('handleCloseTab', () => {
    it('calls closeWorkspaceTab with the given tabId', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      act(() => {
        result.current.handleCloseTab('tab-1');
      });

      expect(mockCloseTab).toHaveBeenCalledOnce();
      expect(mockCloseTab).toHaveBeenCalledWith('tab-1');
    });

    it('passes through any tab id string', () => {
      setupTabs();

      const { result } = renderHook(() => useWorkspaceTabs());

      act(() => {
        result.current.handleCloseTab('some-other-id');
      });

      expect(mockCloseTab).toHaveBeenCalledWith('some-other-id');
    });
  });

  // ---- handleSelectDirectory ----

  describe('handleSelectDirectory', () => {
    it('calls electron dialog to open a directory', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('/selected/path');

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      expect(mockOpenDirectory).toHaveBeenCalledOnce();
    });

    it('validates and opens the project when a path is selected', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('/selected/path');

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      expect(mockIsValidProject).toHaveBeenCalledWith('/selected/path');
      expect(mockOpenProject).toHaveBeenCalledWith('/selected/path');
    });

    it('does nothing when dialog is cancelled (returns undefined)', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue(undefined);

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      expect(mockOpenDirectory).toHaveBeenCalledOnce();
      expect(mockIsValidProject).not.toHaveBeenCalled();
      expect(mockOpenProject).not.toHaveBeenCalled();
    });

    it('does nothing when dialog returns null', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue(null);

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      expect(mockIsValidProject).not.toHaveBeenCalled();
      expect(mockOpenProject).not.toHaveBeenCalled();
    });

    it('does nothing when dialog returns empty string', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('');

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      expect(mockIsValidProject).not.toHaveBeenCalled();
      expect(mockOpenProject).not.toHaveBeenCalled();
    });

    it('still opens project even when isValidProject reports invalid', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('/invalid/path');
      mockIsValidProject.mockResolvedValue({ valid: false, reason: 'Not a git repo' });

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      // The hook currently opens the project regardless of validation result
      expect(mockOpenProject).toHaveBeenCalledWith('/invalid/path');
    });

    it('does not throw when electron dialog API is unavailable', async () => {
      setupTabs();
      const original = window.electronAPI;
      Object.defineProperty(window, 'electronAPI', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        // Should not throw
        await result.current.handleSelectDirectory();
      });

      expect(mockOpenProject).not.toHaveBeenCalled();

      // Restore
      Object.defineProperty(window, 'electronAPI', {
        value: original,
        writable: true,
        configurable: true,
      });
    });

    it('does not throw when dialog.openDirectory rejects', async () => {
      setupTabs();
      mockOpenDirectory.mockRejectedValue(new Error('Dialog failed'));

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        // Should not throw due to try/catch in the hook
        await result.current.handleSelectDirectory();
      });

      expect(mockOpenProject).not.toHaveBeenCalled();
    });

    it('skips validation when isValidProject is not available', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('/selected/path');
      const original = window.electronAPI;
      Object.defineProperty(window, 'electronAPI', {
        value: {
          dialog: { openDirectory: mockOpenDirectory },
          app: {},
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        await result.current.handleSelectDirectory();
      });

      expect(mockIsValidProject).not.toHaveBeenCalled();
      expect(mockOpenProject).toHaveBeenCalledWith('/selected/path');

      // Restore
      Object.defineProperty(window, 'electronAPI', {
        value: original,
        writable: true,
        configurable: true,
      });
    });
  });

  // ---- handleNewTab ----

  describe('handleNewTab', () => {
    it('triggers the directory selection flow', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('/new/project');

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        result.current.handleNewTab();
        // Allow the async handleSelectDirectory to settle
        await vi.waitFor(() => {
          expect(mockOpenDirectory).toHaveBeenCalled();
        });
      });

      expect(mockOpenDirectory).toHaveBeenCalledOnce();
    });

    it('opens a project when directory is selected via new tab', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue('/new/project');

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        result.current.handleNewTab();
        await vi.waitFor(() => {
          expect(mockOpenProject).toHaveBeenCalled();
        });
      });

      expect(mockOpenProject).toHaveBeenCalledWith('/new/project');
    });

    it('does not open a project when new tab dialog is cancelled', async () => {
      setupTabs();
      mockOpenDirectory.mockResolvedValue(undefined);

      const { result } = renderHook(() => useWorkspaceTabs());

      await act(async () => {
        result.current.handleNewTab();
        // Give the async flow time to resolve
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockOpenProject).not.toHaveBeenCalled();
    });
  });
});
