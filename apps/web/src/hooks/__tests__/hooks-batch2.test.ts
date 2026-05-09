import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';

// =============================================================================
// Common type helper
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Selector = (state: any) => any;

// =============================================================================
// 1. useProjectSessions
// =============================================================================

describe('useProjectSessions', () => {
  const mockSessions = [
    {
      id: 'sess-1',
      projectPath: '/project/a',
      aiMode: 'claude' as const,
      status: 'working',
      branch: 'main',
      statusMessage: 'Busy',
      terminalSessionId: 1,
      worktreePath: undefined,
      skipPermissions: false,
      claudeSessionId: 'cs-1',
      isResumed: false,
    },
    {
      id: 'sess-2',
      projectPath: '/project/b',
      aiMode: 'plain' as const,
      status: 'idle',
      branch: 'dev',
      statusMessage: undefined,
      terminalSessionId: undefined,
      worktreePath: undefined,
      skipPermissions: false,
      claudeSessionId: undefined,
      isResumed: false,
    },
    {
      id: 'sess-3',
      projectPath: '/project/a',
      aiMode: 'claude' as const,
      status: 'disconnected',
      branch: 'main',
      statusMessage: undefined,
      terminalSessionId: 2,
      worktreePath: undefined,
      skipPermissions: false,
      claudeSessionId: undefined,
      isResumed: false,
    },
  ];

  const mockUpdateSession = vi.fn();

  beforeEach(() => {
    vi.resetModules();
  });

  async function setup(
    activeProjectPath: string | null = '/project/a',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preLaunchSlots: any[] = []
  ) {
    vi.doMock('@/stores/useSessionStore', () => ({
      useSessionStore: (sel: Selector) =>
        sel({ sessions: mockSessions, updateSession: mockUpdateSession, customTitles: {} }),
      selectSessionsForProject: (projectPath: string) => (state: Record<string, unknown>) =>
        (state.sessions as Array<{ projectPath: string }>).filter(
          s => s.projectPath === projectPath
        ),
    }));

    const mod = await import('../useProjectSessions');
    return renderHook(() => mod.useProjectSessions(activeProjectPath, preLaunchSlots));
  }

  it('returns all sessions from store', async () => {
    const { result } = await setup();
    expect(result.current.sessions).toBe(mockSessions);
  });

  it('filters sessions by active project path', async () => {
    const { result } = await setup('/project/a');
    expect(result.current.activeProjectSessions).toHaveLength(2);
    expect(result.current.activeProjectSessions.every(s => s.projectPath === '/project/a')).toBe(
      true
    );
  });

  it('returns empty active sessions when no project selected', async () => {
    const { result } = await setup(null);
    expect(result.current.activeProjectSessions).toHaveLength(0);
  });

  it('converts sessions to terminal session format', async () => {
    const { result } = await setup('/project/a');
    expect(result.current.terminalSessions).toHaveLength(2);
    const first = result.current.terminalSessions[0];
    expect(first).toMatchObject({
      id: 'sess-1',
      sessionNumber: 1,
      aiMode: 'claude',
    });
  });

  it('detects active sessions (with terminal and not disconnected)', async () => {
    const { result } = await setup('/project/a');
    // sess-1 has terminalSessionId and is not disconnected => active
    // sess-3 has terminalSessionId but is disconnected => not active
    expect(result.current.hasActiveSessions).toBe(true);
  });

  it('returns false for hasActiveSessions when no terminals running', async () => {
    const { result } = await setup('/project/b');
    // sess-2 has no terminalSessionId
    expect(result.current.hasActiveSessions).toBe(false);
  });

  it('computes status counts for the active project', async () => {
    const { result } = await setup('/project/a');
    // sess-1: working => working, sess-3: disconnected => idle
    expect(result.current.statusCounts.working).toBe(1);
    expect(result.current.statusCounts.idle).toBe(1);
  });

  it('includes pre-launch slots as idle in status counts', async () => {
    const slots = [
      { id: 'slot-1', aiMode: 'claude', branch: 'main', shortcutKey: '1' },
      { id: 'slot-2', aiMode: 'claude', branch: 'main', shortcutKey: '2' },
    ];
    const { result } = await setup('/project/a', slots);
    // disconnected maps to idle (1) + 2 pre-launch slots = 3
    expect(result.current.statusCounts.idle).toBe(3);
  });

  it('sets focused session id on handleFocusSession', async () => {
    const { result } = await setup();
    expect(result.current.focusedSessionId).toBeNull();

    act(() => {
      result.current.handleFocusSession('sess-1');
    });
    expect(result.current.focusedSessionId).toBe('sess-1');
  });

  it('exposes updateSession from the store', async () => {
    const { result } = await setup();
    expect(result.current.updateSession).toBe(mockUpdateSession);
  });

  it('handleSessionClose resolves without error', async () => {
    const { result } = await setup();
    await expect(result.current.handleSessionClose('sess-1', 0)).resolves.toBeUndefined();
  });
});

// =============================================================================
// 2. usePreLaunchSlots
// =============================================================================

describe('usePreLaunchSlots', () => {
  const mockUpdateSession = vi.fn();

  beforeEach(() => {
    vi.resetModules();
  });

  async function setup(activeProjectPath: string | null = '/project/a', currentBranch = 'main') {
    // usePreLaunchSlots imports from @/stores (useTerminalStore, useSessionStore, selectRunningSessionCount)
    // useDefaultAiMode also imports from @/stores (useSettingsStore, useWorkspaceStore)
    // usePreLaunchSlots also imports from @/stores/useSessionStore (type-only + real)
    const sessionStoreFactory = Object.assign(
      (sel: Selector) => sel({ updateSession: mockUpdateSession }),
      { getState: () => ({ sessions: [] }) }
    );

    const terminalState = { addSlotRequestCounter: 0 };
    const terminalStoreFactory = Object.assign((sel: Selector) => sel(terminalState), {
      getState: () => terminalState,
      subscribe: () => () => {},
    });
    vi.doMock('@/stores/useTerminalStore', () => ({
      useTerminalStore: terminalStoreFactory,
    }));

    vi.doMock('@/stores/useSessionStore', () => ({
      useSessionStore: sessionStoreFactory,
      selectRunningSessionCount: () => 0,
    }));

    vi.doMock('@/stores/useSettingsStore', () => ({
      useSettingsStore: (sel: Selector) => sel({ claudeCliStatus: { installed: true } }),
    }));

    vi.doMock('@/stores/useWorkspaceStore', () => ({
      useWorkspaceStore: (sel: Selector) =>
        sel({ preferences: { session: { defaultMode: 'claude' } } }),
    }));

    vi.doMock('@/lib/session', () => ({
      createSession: vi.fn().mockResolvedValue({
        id: 'new-session-1',
        terminalSessionId: 42,
      }),
    }));

    vi.doMock('@/lib/prelaunch-shortcuts', () => ({
      PRELAUNCH_SHORTCUT_KEYS: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
      getNextAvailablePrelaunchShortcut: (used: Iterable<string>) => {
        const usedSet = new Set(used);
        for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']) {
          if (!usedSet.has(k)) return k;
        }
        return null;
      },
    }));

    const mod = await import('../usePreLaunchSlots');
    return renderHook(() => mod.usePreLaunchSlots(activeProjectPath, currentBranch));
  }

  it('starts with empty pre-launch slots', async () => {
    const { result } = await setup();
    expect(result.current.preLaunchSlots).toEqual([]);
  });

  it('canLaunch is false when no slots exist', async () => {
    const { result } = await setup();
    expect(result.current.canLaunch).toBe(false);
  });

  it('canLaunch is false when no active project', async () => {
    const { result } = await setup(null);
    act(() => {
      result.current.handleAddSession();
    });
    // Even with slots, canLaunch should be false without a project
    expect(result.current.canLaunch).toBe(false);
  });

  it('adds a session slot via handleAddSession', async () => {
    const { result } = await setup();
    act(() => {
      result.current.handleAddSession();
    });
    expect(result.current.preLaunchSlots).toHaveLength(1);
    expect(result.current.preLaunchSlots[0].aiMode).toBe('claude');
    expect(result.current.preLaunchSlots[0].branch).toBe('main');
    expect(result.current.preLaunchSlots[0].shortcutKey).toBe('1');
  });

  it('canLaunch is true when slots exist and project is selected', async () => {
    const { result } = await setup('/project/a');
    act(() => {
      result.current.handleAddSession();
    });
    expect(result.current.canLaunch).toBe(true);
  });

  it('removes a slot via handleRemoveSlot', async () => {
    const { result } = await setup();
    act(() => {
      result.current.handleAddSession();
    });
    const slotId = result.current.preLaunchSlots[0].id;
    act(() => {
      result.current.handleRemoveSlot(slotId);
    });
    expect(result.current.preLaunchSlots).toHaveLength(0);
  });

  it('updates a slot via handleUpdateSlot', async () => {
    const { result } = await setup();
    act(() => {
      result.current.handleAddSession();
    });
    const slotId = result.current.preLaunchSlots[0].id;
    act(() => {
      result.current.handleUpdateSlot(slotId, { aiMode: 'plain' });
    });
    expect(result.current.preLaunchSlots[0].aiMode).toBe('plain');
  });

  it('batch-adds slots via handleBatchAddSessions', async () => {
    const { result } = await setup();
    act(() => {
      result.current.handleBatchAddSessions(3, 'plain', 'feature-branch');
    });
    expect(result.current.preLaunchSlots).toHaveLength(3);
    expect(result.current.preLaunchSlots[0].aiMode).toBe('plain');
    expect(result.current.preLaunchSlots[0].branch).toBe('feature-branch');
    expect(result.current.preLaunchSlots[2].shortcutKey).toBe('3');
  });

  it('isLaunching is initially false', async () => {
    const { result } = await setup();
    expect(result.current.isLaunching).toBe(false);
  });

  it('launchingSlotIds is initially empty', async () => {
    const { result } = await setup();
    expect(result.current.launchingSlotIds.size).toBe(0);
  });
});

// =============================================================================
// 3. useUpdateToast
// =============================================================================

describe('useUpdateToast', () => {
  const mockInstallNow = vi.fn();
  const mockOpenSettings = vi.fn();

  beforeEach(() => {
    vi.resetModules();
  });

  async function setup(
    updateStoreState: Record<string, unknown> = {},
    settingsStoreState: Record<string, unknown> = {}
  ) {
    const defaultUpdateState = {
      status: 'idle',
      updateInfo: null,
      error: null,
      channel: 'stable',
      installNow: mockInstallNow,
      ...updateStoreState,
    };

    const defaultSettingsState = {
      openSettings: mockOpenSettings,
      ...settingsStoreState,
    };

    vi.doMock('@/stores/useUpdateStore', () => ({
      useUpdateStore: (sel: Selector) => sel(defaultUpdateState),
    }));

    vi.doMock('@/stores/useSettingsStore', () => ({
      useSettingsStore: (sel: Selector) => sel(defaultSettingsState),
    }));

    vi.doMock('@/lib/platform', () => ({
      IS_MAC: false,
      IS_WINDOWS: false,
      IS_LINUX: true,
    }));

    const mod = await import('../useUpdateToast');
    return renderHook(() => mod.useUpdateToast());
  }

  it('renders without error', async () => {
    const { result } = await setup();
    expect(result.current).toBeUndefined(); // void hook
  });

  it('shows info toast when status becomes available (non-Mac)', async () => {
    await setup({
      status: 'available',
      updateInfo: { version: '1.2.0' },
    });

    expect(toast.info).toHaveBeenCalledWith(
      'Update v1.2.0 available',
      expect.objectContaining({
        description: 'A new version of Omniscribe is ready to download.',
      })
    );
  });

  it('shows beta label in toast when channel is beta', async () => {
    await setup({
      status: 'available',
      updateInfo: { version: '1.2.0-beta.1' },
      channel: 'beta',
    });

    expect(toast.info).toHaveBeenCalledWith(
      'Update v1.2.0-beta.1 (Beta) available',
      expect.anything()
    );
  });

  it('shows success toast with restart action when status is ready (non-Mac)', async () => {
    await setup({
      status: 'ready',
    });

    expect(toast.success).toHaveBeenCalledWith(
      'Update ready to install',
      expect.objectContaining({
        description: 'Restart the app to apply the update.',
      })
    );
  });

  it('shows error toast when status is error', async () => {
    await setup({
      status: 'error',
      error: 'Network failure',
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Update failed',
      expect.objectContaining({
        description: 'Network failure',
      })
    );
  });

  it('shows release pending info when error is RELEASE_PENDING', async () => {
    await setup({
      status: 'error',
      error: 'RELEASE_PENDING',
    });

    expect(toast.info).toHaveBeenCalledWith(
      'New release detected',
      expect.objectContaining({
        description: 'The release is still being built. Check back in 5\u201310 minutes.',
      })
    );
  });

  it('shows generic error toast when error has no description', async () => {
    await setup({
      status: 'error',
      error: null,
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Update failed',
      expect.objectContaining({
        description: 'An error occurred while checking for updates.',
      })
    );
  });

  it('does not show toast for idle status', async () => {
    await setup({ status: 'idle' });

    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. useUpdateToast (macOS variant)
// =============================================================================

describe('useUpdateToast (macOS)', () => {
  const mockInstallNow = vi.fn();
  const mockOpenSettings = vi.fn();

  beforeEach(() => {
    vi.resetModules();
  });

  async function setupMac(updateStoreState: Record<string, unknown> = {}) {
    const defaultUpdateState = {
      status: 'idle',
      updateInfo: null,
      error: null,
      channel: 'stable',
      installNow: mockInstallNow,
      ...updateStoreState,
    };

    vi.doMock('@/stores/useUpdateStore', () => ({
      useUpdateStore: (sel: Selector) => sel(defaultUpdateState),
    }));

    vi.doMock('@/stores/useSettingsStore', () => ({
      useSettingsStore: (sel: Selector) => sel({ openSettings: mockOpenSettings }),
    }));

    vi.doMock('@/lib/platform', () => ({
      IS_MAC: true,
      IS_WINDOWS: false,
      IS_LINUX: false,
    }));

    const mod = await import('../useUpdateToast');
    return renderHook(() => mod.useUpdateToast());
  }

  it('shows download toast on macOS when status is available', async () => {
    await setupMac({
      status: 'available',
      updateInfo: { version: '2.0.0' },
    });

    expect(toast.info).toHaveBeenCalledWith(
      'Update v2.0.0 available',
      expect.objectContaining({
        description: 'Download the latest version from GitHub Releases.',
      })
    );
  });

  it('shows manual download toast on macOS when status is ready', async () => {
    await setupMac({
      status: 'ready',
    });

    expect(toast.success).toHaveBeenCalledWith(
      'Update downloaded',
      expect.objectContaining({
        description:
          'Auto-install is not available on macOS. Download the latest version manually.',
      })
    );
  });

  it('shows code signature error toast on macOS', async () => {
    await setupMac({
      status: 'error',
      error: 'Code signature validation failed',
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Auto-install unavailable on macOS',
      expect.objectContaining({
        description: 'Download the update manually from GitHub.',
      })
    );
  });
});

// =============================================================================
// 5. useTerminalSearch
// =============================================================================

describe('useTerminalSearch', () => {
  // No store mocks needed -- this hook is pure React state + refs

  beforeEach(() => {
    vi.resetModules();
  });

  async function setup() {
    const mod = await import('../useTerminalSearch');
    const xtermRef = { current: { focus: vi.fn() } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return renderHook(() => mod.useTerminalSearch(xtermRef as any));
  }

  it('returns expected shape', async () => {
    const { result } = await setup();
    expect(result.current).toHaveProperty('showSearch');
    expect(result.current).toHaveProperty('setShowSearch');
    expect(result.current).toHaveProperty('searchAddonRef');
    expect(result.current).toHaveProperty('handleSearch');
    expect(result.current).toHaveProperty('handleSearchNext');
    expect(result.current).toHaveProperty('handleSearchPrevious');
    expect(result.current).toHaveProperty('handleSearchClose');
  });

  it('showSearch is initially false', async () => {
    const { result } = await setup();
    expect(result.current.showSearch).toBe(false);
  });

  it('setShowSearch toggles showSearch', async () => {
    const { result } = await setup();
    act(() => {
      result.current.setShowSearch(true);
    });
    expect(result.current.showSearch).toBe(true);
  });

  it('handleSearch does nothing when searchAddon is null', async () => {
    const { result } = await setup();
    // Should not throw
    act(() => {
      result.current.handleSearch('test', { caseSensitive: false, regex: false });
    });
  });

  it('handleSearch calls findNext when addon is available', async () => {
    const { result } = await setup();
    const mockAddon = {
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.searchAddonRef.current = mockAddon as any;

    act(() => {
      result.current.handleSearch('hello', { caseSensitive: true, regex: false });
    });
    expect(mockAddon.findNext).toHaveBeenCalledWith('hello', {
      caseSensitive: true,
      regex: false,
    });
  });

  it('handleSearch clears decorations when term is empty', async () => {
    const { result } = await setup();
    const mockAddon = {
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.searchAddonRef.current = mockAddon as any;

    act(() => {
      result.current.handleSearch('', { caseSensitive: false, regex: false });
    });
    expect(mockAddon.clearDecorations).toHaveBeenCalled();
    expect(mockAddon.findNext).not.toHaveBeenCalled();
  });

  it('handleSearchNext calls findNext with stored term', async () => {
    const { result } = await setup();
    const mockAddon = {
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.searchAddonRef.current = mockAddon as any;

    // Set a search term first
    act(() => {
      result.current.handleSearch('world', { caseSensitive: false, regex: false });
    });
    mockAddon.findNext.mockClear();

    act(() => {
      result.current.handleSearchNext();
    });
    expect(mockAddon.findNext).toHaveBeenCalledWith('world');
  });

  it('handleSearchPrevious calls findPrevious with stored term', async () => {
    const { result } = await setup();
    const mockAddon = {
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.searchAddonRef.current = mockAddon as any;

    act(() => {
      result.current.handleSearch('world', { caseSensitive: false, regex: false });
    });

    act(() => {
      result.current.handleSearchPrevious();
    });
    expect(mockAddon.findPrevious).toHaveBeenCalledWith('world');
  });

  it('handleSearchNext does nothing when no search term is set', async () => {
    const { result } = await setup();
    const mockAddon = { findNext: vi.fn(), findPrevious: vi.fn(), clearDecorations: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.searchAddonRef.current = mockAddon as any;

    act(() => {
      result.current.handleSearchNext();
    });
    expect(mockAddon.findNext).not.toHaveBeenCalled();
  });

  it('handleSearchClose clears state and focuses xterm', async () => {
    const mod = await import('../useTerminalSearch');
    const mockFocus = vi.fn();
    const xtermRef = { current: { focus: mockFocus } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result } = renderHook(() => mod.useTerminalSearch(xtermRef as any));

    const mockAddon = { findNext: vi.fn(), findPrevious: vi.fn(), clearDecorations: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.searchAddonRef.current = mockAddon as any;

    // Open search first
    act(() => {
      result.current.setShowSearch(true);
    });
    expect(result.current.showSearch).toBe(true);

    act(() => {
      result.current.handleSearchClose();
    });
    expect(result.current.showSearch).toBe(false);
    expect(mockAddon.clearDecorations).toHaveBeenCalled();
    expect(mockFocus).toHaveBeenCalled();
  });
});

// =============================================================================
// 6. useSplashScreen
// =============================================================================

describe('useSplashScreen', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup(
    connectionStatus = 'reconnecting',
    isWorkspaceRestored = false,
    updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' = 'idle'
  ) {
    vi.doMock('@/stores/useConnectionStore', () => ({
      useConnectionStore: (sel: Selector) => sel({ status: connectionStatus }),
    }));

    vi.doMock('@/stores/useWorkspaceStore', () => ({
      useWorkspaceStore: (sel: Selector) => sel({ isRestored: isWorkspaceRestored }),
    }));

    vi.doMock('@/stores/useUpdateStore', () => ({
      useUpdateStore: (sel: Selector) => sel({ status: updateStatus }),
    }));

    vi.doMock('@/hooks/useAppVersion', () => ({
      useAppVersion: () => '1.0.0',
    }));

    const mod = await import('../useSplashScreen');
    return renderHook(() => mod.useSplashScreen());
  }

  it('returns expected shape', async () => {
    const { result } = await setup();
    expect(result.current).toHaveProperty('isVisible');
    expect(result.current).toHaveProperty('isDismissing');
    expect(result.current).toHaveProperty('showSpinner');
    expect(result.current).toHaveProperty('statusText');
    expect(result.current).toHaveProperty('version');
    expect(result.current).toHaveProperty('variant');
    expect(result.current).toHaveProperty('steps');
    expect(result.current).toHaveProperty('error');
  });

  it('is initially visible and not dismissing', async () => {
    const { result } = await setup();
    expect(result.current.isVisible).toBe(true);
    expect(result.current.isDismissing).toBe(false);
  });

  it('spinner is initially hidden', async () => {
    const { result } = await setup();
    expect(result.current.showSpinner).toBe(false);
  });

  it('shows spinner after 500ms delay', async () => {
    const { result } = await setup();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.showSpinner).toBe(true);
  });

  it('reports version from useAppVersion', async () => {
    const { result } = await setup();
    expect(result.current.version).toBe('1.0.0');
  });

  it('shows "Initializing..." when connection is not established', async () => {
    const { result } = await setup('connecting', false);
    expect(result.current.statusText).toBe('Initializing...');
  });

  it('shows "Connecting..." when reconnecting', async () => {
    const { result } = await setup('reconnecting', false);
    expect(result.current.statusText).toBe('Connecting...');
  });

  it('shows "Connection failed. Retrying..." when failed', async () => {
    const { result } = await setup('failed', false);
    expect(result.current.statusText).toBe('Connection failed. Retrying...');
  });

  it('shows "Loading workspace..." when connected but not restored', async () => {
    const { result } = await setup('connected', false);
    expect(result.current.statusText).toBe('Loading workspace...');
  });

  it('shows "Almost ready" when fully ready', async () => {
    const { result } = await setup('connected', true);
    expect(result.current.statusText).toBe('Almost ready');
  });

  it('starts dismissing after app is ready and min time elapsed', async () => {
    const { result } = await setup('connected', true);
    expect(result.current.isDismissing).toBe(false);

    // Advance past minimum display time (1200ms)
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.isDismissing).toBe(true);
  });

  it('becomes invisible after dismiss animation completes', async () => {
    const { result } = await setup('connected', true);

    // Advance past minimum display time to trigger dismiss
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.isDismissing).toBe(true);

    // Advance past exit animation (500ms) to fully remove
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isVisible).toBe(false);
  });

  it('does not dismiss before min time even if app is ready', async () => {
    const { result } = await setup('connected', true);

    act(() => {
      vi.advanceTimersByTime(800); // < 1200ms min
    });
    expect(result.current.isDismissing).toBe(false);
    expect(result.current.isVisible).toBe(true);
  });

  it('force-dismisses after max display time (10s)', async () => {
    const { result } = await setup('reconnecting', false);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // After max-time the variant flips to 'error' so the splash STAYS UP
    // (with Retry/Close affordances) rather than auto-dismissing — this is
    // the new behaviour and is honest about the failed state.
    expect(result.current.variant).toBe('error');
    expect(result.current.isVisible).toBe(true);
  });

  it('does not auto-show toast warning when variant flips to error on stuck connection', async () => {
    // The toast was the old recovery affordance; the error variant now
    // surfaces Retry + Close visually, so the toast is suppressed in that
    // path to avoid double-prompting the user.
    await setup('reconnecting', false);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('does not show warning toast on max timeout when app is ready', async () => {
    await setup('connected', true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(toast.warning).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // New shape: variant, steps, error
  // ---------------------------------------------------------------------------

  it('exposes a 3-row boot trace (backend, socket, workspace)', async () => {
    const { result } = await setup('reconnecting', false);
    expect(result.current.steps).toHaveLength(3);
    expect(result.current.steps.map(s => s.id)).toEqual(['backend', 'socket', 'workspace']);
  });

  it('flips backend + socket to done once connected', async () => {
    const { result } = await setup('connected', false);
    const byId = Object.fromEntries(result.current.steps.map(s => [s.id, s.status]));
    expect(byId.backend).toBe('done');
    expect(byId.socket).toBe('done');
    expect(byId.workspace).toBe('running');
  });

  it('flips workspace to done once restored', async () => {
    const { result } = await setup('connected', true);
    const byId = Object.fromEntries(result.current.steps.map(s => [s.id, s.status]));
    expect(byId.workspace).toBe('done');
  });

  it('keeps workspace in wait while socket is still connecting', async () => {
    const { result } = await setup('reconnecting', false);
    const byId = Object.fromEntries(result.current.steps.map(s => [s.id, s.status]));
    expect(byId.workspace).toBe('wait');
  });

  it('marks the active row as the running step (one at a time)', async () => {
    const { result } = await setup('connected', false);
    const running = result.current.steps.filter(s => s.status === 'running');
    expect(running).toHaveLength(1);
    expect(running[0].id).toBe('workspace');
  });

  it('returns variant=loading by default', async () => {
    const { result } = await setup('reconnecting', false);
    expect(result.current.variant).toBe('loading');
  });

  it('returns variant=error when connection fails', async () => {
    const { result } = await setup('failed', false);
    expect(result.current.variant).toBe('error');
    expect(result.current.error).toMatch(/backend connection failed/i);
  });

  it('collapses all steps to error when connection fails', async () => {
    const { result } = await setup('failed', false);
    const statuses = result.current.steps.map(s => s.status);
    // backend + socket are sourced from the connection signal — both error.
    // workspace is wait until socket is connected — stays wait.
    expect(statuses).toContain('error');
  });

  it('returns variant=updating when updater is downloading', async () => {
    const { result } = await setup('connected', true, 'downloading');
    expect(result.current.variant).toBe('updating');
  });

  it('returns variant=updating when updater is ready to install', async () => {
    const { result } = await setup('connected', true, 'ready');
    expect(result.current.variant).toBe('updating');
  });

  it('does not auto-dismiss in the updating variant', async () => {
    const { result } = await setup('connected', true, 'downloading');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isDismissing).toBe(false);
    expect(result.current.isVisible).toBe(true);
  });

  it('does not auto-dismiss in the error variant', async () => {
    const { result } = await setup('failed', false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isDismissing).toBe(false);
    expect(result.current.isVisible).toBe(true);
  });
});
