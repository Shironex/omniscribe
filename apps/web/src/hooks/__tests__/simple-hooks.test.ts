import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createRef } from 'react';

// =============================================================================
// Store mocks
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Selector = (state: any) => any;

// --- useTerminalStore ---
const mockTerminalState = {
  fontSize: 14,
  fontFamily: ['Menlo', 'monospace'],
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  cursorStyle: 'block' as string,
  cursorBlink: true,
  scrollback: 10000,
  terminalThemeName: 'tokyonight' as const,
};

vi.mock('@/stores/useTerminalStore', () => ({
  useTerminalStore: (sel: Selector) => sel(mockTerminalState),
}));

// --- useSettingsStore ---
const mockSettingsState = {
  claudeCliStatus: null as {
    installed: boolean;
    platform: string;
    arch: string;
    auth: { authenticated: boolean };
    version?: string;
  } | null,
  isClaudeCliLoading: false,
  claudeVersionCheck: null as {
    installedVersion?: string;
    latestVersion: string;
    isOutdated: boolean;
    lastChecked: string;
  } | null,
  isVersionCheckLoading: false,
  availableVersions: [] as string[],
  isVersionsLoading: false,
  theme: 'dark',
  setTheme: vi.fn(),
  setClaudeCliStatus: vi.fn(),
  setClaudeCliLoading: vi.fn(),
  setClaudeVersionCheck: vi.fn(),
  setVersionCheckLoading: vi.fn(),
  setAvailableVersions: vi.fn(),
  setVersionsLoading: vi.fn(),
};

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (sel: Selector) => sel(mockSettingsState),
}));

// --- useWorkspaceStore ---
const mockWorkspaceState = {
  preferences: {
    theme: 'dark',
    session: {
      defaultMode: 'claude',
      skipPermissions: false,
      quickActionMode: 'paste-only',
    },
    worktree: {
      enabled: false,
      prefix: 'omniscribe',
    },
  },
  tabs: [],
  activeTabId: null as string | null,
  updateTabTheme: vi.fn(),
  isRestored: false,
};

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: (sel: Selector) => sel(mockWorkspaceState),
}));

// --- Barrel re-export mock ---
vi.mock('@/stores', () => ({
  useSettingsStore: (sel: Selector) => sel(mockSettingsState),
  useWorkspaceStore: (sel: Selector) => sel(mockWorkspaceState),
}));

// --- theme-persistence mock ---
vi.mock('@/lib/theme-persistence', () => ({
  persistTheme: vi.fn(),
  getPersistedTheme: vi.fn(() => 'dark'),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================
import { useAppVersion } from '../useAppVersion';
import { useClickOutside } from '../useClickOutside';
import { useDefaultAiMode } from '../useDefaultAiMode';
import { useWorkspacePreferences } from '../useWorkspacePreferences';
import { useTerminalSettings } from '../useTerminalSettings';
import { useClaudeCliStatus } from '../useClaudeCliStatus';
import { persistTheme } from '@/lib/theme-persistence';

// =============================================================================
// 1. useAppVersion
// =============================================================================
describe('useAppVersion', () => {
  beforeEach(() => {
    // Clean up any previous electronAPI mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI;
  });

  it('returns empty string initially when electronAPI is not available', () => {
    const { result } = renderHook(() => useAppVersion());
    expect(result.current).toBe('');
  });

  it('returns the version from electronAPI', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        app: {
          getVersion: vi.fn().mockResolvedValue('1.2.3'),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAppVersion());

    await waitFor(() => {
      expect(result.current).toBe('1.2.3');
    });
  });

  it('returns empty string when getVersion resolves with falsy value', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        app: {
          getVersion: vi.fn().mockResolvedValue(''),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAppVersion());

    // Wait for the effect to run — version should remain empty
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });
    expect(result.current).toBe('');
  });

  it('handles electronAPI.app.getVersion throwing an error', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        app: {
          getVersion: vi.fn().mockRejectedValue(new Error('IPC error')),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAppVersion());

    // Wait for the effect to run — version should stay empty
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });
    expect(result.current).toBe('');
  });

  it('ignores stale responses after unmount', async () => {
    let resolveVersion: (v: string) => void = () => {};
    const versionPromise = new Promise<string>(r => {
      resolveVersion = r;
    });

    Object.defineProperty(window, 'electronAPI', {
      value: {
        app: {
          getVersion: vi.fn().mockReturnValue(versionPromise),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result, unmount } = renderHook(() => useAppVersion());

    // Unmount before resolving
    unmount();
    resolveVersion('1.0.0');

    // Should remain empty because the effect was cancelled
    expect(result.current).toBe('');
  });
});

// =============================================================================
// 2. useClickOutside
// =============================================================================
describe('useClickOutside', () => {
  it('calls handler when clicking outside the referenced element', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ref as any).current = div;

    renderHook(() => useClickOutside(ref, handler));

    // Click outside (on document body, not on div)
    const outsideEvent = new MouseEvent('mousedown', { bubbles: true });
    document.body.dispatchEvent(outsideEvent);

    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(div);
  });

  it('does not call handler when clicking inside the referenced element', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ref as any).current = div;

    renderHook(() => useClickOutside(ref, handler));

    // Click inside
    const insideEvent = new MouseEvent('mousedown', { bubbles: true });
    div.dispatchEvent(insideEvent);

    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does not call handler when ref is null', () => {
    const handler = vi.fn();
    const ref = createRef<HTMLElement>();

    renderHook(() => useClickOutside(ref, handler));

    const event = new MouseEvent('mousedown', { bubbles: true });
    document.body.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes event listener on unmount', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ref as any).current = div;

    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useClickOutside(ref, handler));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    removeSpy.mockRestore();

    document.body.removeChild(div);
  });

  it('always uses the latest handler reference', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ref as any).current = div;

    const { rerender } = renderHook(({ handler }) => useClickOutside(ref, handler), {
      initialProps: { handler: handler1 },
    });

    // Update handler
    rerender({ handler: handler2 });

    // Click outside
    const event = new MouseEvent('mousedown', { bubbles: true });
    document.body.dispatchEvent(event);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);

    document.body.removeChild(div);
  });
});

// =============================================================================
// 3. useDefaultAiMode
// =============================================================================
describe('useDefaultAiMode', () => {
  const originalClaudeCliStatus = mockSettingsState.claudeCliStatus;
  const originalPreferences = { ...mockWorkspaceState.preferences };

  afterEach(() => {
    mockSettingsState.claudeCliStatus = originalClaudeCliStatus;
    mockWorkspaceState.preferences = { ...originalPreferences };
  });

  it('returns plain mode when Claude CLI is not installed', () => {
    mockSettingsState.claudeCliStatus = null;

    const { result } = renderHook(() => useDefaultAiMode());

    expect(result.current.defaultAiMode).toBe('plain');
    expect(result.current.claudeAvailable).toBe(false);
  });

  it('returns plain mode when claudeCliStatus.installed is false', () => {
    mockSettingsState.claudeCliStatus = {
      installed: false,
      platform: 'darwin',
      arch: 'arm64',
      auth: { authenticated: false },
    };

    const { result } = renderHook(() => useDefaultAiMode());

    expect(result.current.defaultAiMode).toBe('plain');
    expect(result.current.claudeAvailable).toBe(false);
  });

  it('returns configured default mode when Claude CLI is installed', () => {
    mockSettingsState.claudeCliStatus = {
      installed: true,
      platform: 'darwin',
      arch: 'arm64',
      auth: { authenticated: true },
    };
    mockWorkspaceState.preferences = {
      ...originalPreferences,
      session: { ...originalPreferences.session!, defaultMode: 'claude' },
    };

    const { result } = renderHook(() => useDefaultAiMode());

    expect(result.current.defaultAiMode).toBe('claude');
    expect(result.current.claudeAvailable).toBe(true);
  });

  it('uses DEFAULT_SESSION_SETTINGS.defaultMode when session preferences are undefined', () => {
    mockSettingsState.claudeCliStatus = {
      installed: true,
      platform: 'darwin',
      arch: 'arm64',
      auth: { authenticated: true },
    };
    mockWorkspaceState.preferences = {
      ...originalPreferences,
      session: undefined as unknown as typeof originalPreferences.session,
    };

    const { result } = renderHook(() => useDefaultAiMode());

    // DEFAULT_SESSION_SETTINGS.defaultMode is 'claude'
    expect(result.current.defaultAiMode).toBe('claude');
    expect(result.current.claudeAvailable).toBe(true);
  });
});

// =============================================================================
// 4. useWorkspacePreferences
// =============================================================================
describe('useWorkspacePreferences', () => {
  const savedPreferences = { ...mockWorkspaceState.preferences };
  const savedTabs = [...mockWorkspaceState.tabs];
  const savedActiveTabId = mockWorkspaceState.activeTabId;
  const savedIsRestored = mockWorkspaceState.isRestored;

  afterEach(() => {
    mockWorkspaceState.preferences = { ...savedPreferences };
    mockWorkspaceState.tabs = [...savedTabs];
    mockWorkspaceState.activeTabId = savedActiveTabId;
    mockWorkspaceState.isRestored = savedIsRestored;
    mockWorkspaceState.updateTabTheme.mockClear();
    vi.mocked(persistTheme).mockClear();
  });

  it('returns void (no return value)', () => {
    const { result } = renderHook(() => useWorkspacePreferences());
    expect(result.current).toBeUndefined();
  });

  it('calls persistTheme on initial sync when workspace is restored', () => {
    mockWorkspaceState.isRestored = true;
    mockWorkspaceState.tabs = [{ id: 'tab-1', theme: 'solarized-light' }] as never[];
    mockWorkspaceState.activeTabId = 'tab-1';

    renderHook(() => useWorkspacePreferences());

    expect(persistTheme).toHaveBeenCalledWith('solarized-light');
  });

  it('does not call persistTheme when workspace is not restored', () => {
    mockWorkspaceState.isRestored = false;

    renderHook(() => useWorkspacePreferences());

    expect(persistTheme).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 5. useTerminalSettings
// =============================================================================
describe('useTerminalSettings', () => {
  it('returns all terminal settings from the store', () => {
    const { result } = renderHook(() => useTerminalSettings());

    expect(result.current).toEqual({
      fontSize: 14,
      fontFamily: ['Menlo', 'monospace'],
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 10000,
      terminalThemeName: 'tokyonight',
    });
  });

  it('returns updated values when store changes', () => {
    // Override one value
    const originalFontSize = mockTerminalState.fontSize;
    mockTerminalState.fontSize = 18;

    const { result } = renderHook(() => useTerminalSettings());

    expect(result.current.fontSize).toBe(18);

    // Restore
    mockTerminalState.fontSize = originalFontSize;
  });

  it('returns correct cursorStyle value', () => {
    const originalCursorStyle = mockTerminalState.cursorStyle;
    mockTerminalState.cursorStyle = 'underline';

    const { result } = renderHook(() => useTerminalSettings());

    expect(result.current.cursorStyle).toBe('underline');

    mockTerminalState.cursorStyle = originalCursorStyle;
  });

  it('returns fontFamily as an array', () => {
    const { result } = renderHook(() => useTerminalSettings());

    expect(Array.isArray(result.current.fontFamily)).toBe(true);
    expect(result.current.fontFamily).toHaveLength(2);
  });
});

// =============================================================================
// 6. useClaudeCliStatus
// =============================================================================
describe('useClaudeCliStatus', () => {
  const savedClaudeCliStatus = mockSettingsState.claudeCliStatus;
  const savedIsLoading = mockSettingsState.isClaudeCliLoading;
  const savedVersionCheck = mockSettingsState.claudeVersionCheck;
  const savedIsVersionCheckLoading = mockSettingsState.isVersionCheckLoading;
  const savedAvailableVersions = [...mockSettingsState.availableVersions];
  const savedIsVersionsLoading = mockSettingsState.isVersionsLoading;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI;
  });

  afterEach(() => {
    mockSettingsState.claudeCliStatus = savedClaudeCliStatus;
    mockSettingsState.isClaudeCliLoading = savedIsLoading;
    mockSettingsState.claudeVersionCheck = savedVersionCheck;
    mockSettingsState.isVersionCheckLoading = savedIsVersionCheckLoading;
    mockSettingsState.availableVersions = [...savedAvailableVersions];
    mockSettingsState.isVersionsLoading = savedIsVersionsLoading;
  });

  it('returns all expected fields', () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current).toHaveProperty('claudeCliStatus');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('claudeVersionCheck');
    expect(result.current).toHaveProperty('isVersionCheckLoading');
    expect(result.current).toHaveProperty('availableVersions');
    expect(result.current).toHaveProperty('isVersionsLoading');
    expect(result.current).toHaveProperty('showVersionPicker');
    expect(result.current).toHaveProperty('installCommand');
    expect(result.current).toHaveProperty('copiedCommand');
    expect(result.current).toHaveProperty('refreshStatus');
    expect(result.current).toHaveProperty('checkVersion');
    expect(result.current).toHaveProperty('handleVersionPickerOpen');
    expect(result.current).toHaveProperty('handleVersionSelect');
    expect(result.current).toHaveProperty('handleInstallClick');
    expect(result.current).toHaveProperty('copyCommand');
    expect(result.current).toHaveProperty('runInTerminal');
    expect(result.current).toHaveProperty('getInstallCommand');
  });

  it('returns null claudeCliStatus from store', () => {
    mockSettingsState.claudeCliStatus = null;

    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current.claudeCliStatus).toBeNull();
  });

  it('returns store values for loading states', () => {
    mockSettingsState.isClaudeCliLoading = true;
    mockSettingsState.isVersionCheckLoading = true;
    mockSettingsState.isVersionsLoading = true;

    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isVersionCheckLoading).toBe(true);
    expect(result.current.isVersionsLoading).toBe(true);
  });

  it('initializes showVersionPicker as false', () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current.showVersionPicker).toBe(false);
  });

  it('initializes installCommand as null', () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current.installCommand).toBeNull();
  });

  it('initializes copiedCommand as false', () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current.copiedCommand).toBe(false);
  });

  it('refreshStatus sets web fallback when electronAPI is unavailable', async () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(mockSettingsState.setClaudeCliLoading).toHaveBeenCalledWith(true);
    expect(mockSettingsState.setClaudeCliStatus).toHaveBeenCalledWith({
      installed: false,
      platform: 'web',
      arch: 'unknown',
      auth: { authenticated: false },
    });
  });

  it('refreshStatus fetches status from electronAPI when available', async () => {
    const mockStatus = {
      installed: true,
      version: '1.0.0',
      platform: 'darwin',
      arch: 'arm64',
      auth: { authenticated: true },
    };

    Object.defineProperty(window, 'electronAPI', {
      value: {
        claude: {
          getStatus: vi.fn().mockResolvedValue(mockStatus),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(mockSettingsState.setClaudeCliLoading).toHaveBeenCalledWith(true);
    expect(mockSettingsState.setClaudeCliStatus).toHaveBeenCalledWith(mockStatus);
  });

  it('refreshStatus handles errors gracefully', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        claude: {
          getStatus: vi.fn().mockRejectedValue(new Error('IPC error')),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(mockSettingsState.setClaudeCliStatus).toHaveBeenCalledWith(null);
  });

  it('handleVersionPickerOpen toggles showVersionPicker', () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    expect(result.current.showVersionPicker).toBe(false);

    act(() => {
      result.current.handleVersionPickerOpen();
    });

    expect(result.current.showVersionPicker).toBe(true);

    act(() => {
      result.current.handleVersionPickerOpen();
    });

    expect(result.current.showVersionPicker).toBe(false);
  });

  it('handleVersionSelect closes the version picker', async () => {
    const { result } = renderHook(() => useClaudeCliStatus());

    // Open the picker first
    act(() => {
      result.current.handleVersionPickerOpen();
    });
    expect(result.current.showVersionPicker).toBe(true);

    // Select a version
    act(() => {
      result.current.handleVersionSelect('2.0.0');
    });

    expect(result.current.showVersionPicker).toBe(false);
  });

  it('checkVersion calls electronAPI when available', async () => {
    const mockVersionResult = {
      installedVersion: '1.0.0',
      latestVersion: '2.0.0',
      isOutdated: true,
      lastChecked: '2025-01-01T00:00:00Z',
    };

    Object.defineProperty(window, 'electronAPI', {
      value: {
        claude: {
          checkVersion: vi.fn().mockResolvedValue(mockVersionResult),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.checkVersion();
    });

    expect(mockSettingsState.setVersionCheckLoading).toHaveBeenCalledWith(true);
    expect(mockSettingsState.setClaudeVersionCheck).toHaveBeenCalledWith(mockVersionResult);
  });

  it('checkVersion handles errors gracefully', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        claude: {
          checkVersion: vi.fn().mockRejectedValue(new Error('version check failed')),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.checkVersion();
    });

    expect(mockSettingsState.setClaudeVersionCheck).toHaveBeenCalledWith(null);
  });

  it('fetches status on mount when claudeCliStatus is null and not loading', async () => {
    mockSettingsState.claudeCliStatus = null;
    mockSettingsState.isClaudeCliLoading = false;

    renderHook(() => useClaudeCliStatus());

    // The effect calls refreshStatus which sets loading
    await waitFor(() => {
      expect(mockSettingsState.setClaudeCliLoading).toHaveBeenCalledWith(true);
    });
  });

  it('does not fetch status on mount when already loading', () => {
    mockSettingsState.claudeCliStatus = null;
    mockSettingsState.isClaudeCliLoading = true;

    renderHook(() => useClaudeCliStatus());

    // setClaudeCliLoading should not be called since it's already loading
    expect(mockSettingsState.setClaudeCliLoading).not.toHaveBeenCalled();
  });

  it('getInstallCommand calls electronAPI when available', async () => {
    const mockCommand = {
      command: 'npm install -g @claude/cli',
      description: 'Install Claude CLI',
    };

    Object.defineProperty(window, 'electronAPI', {
      value: {
        claude: {
          getInstallCommand: vi.fn().mockResolvedValue(mockCommand),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.getInstallCommand(false);
    });

    expect(window.electronAPI!.claude!.getInstallCommand).toHaveBeenCalledWith({
      isUpdate: false,
      version: undefined,
    });
  });

  it('getInstallCommand passes version when provided', async () => {
    const mockCommand = {
      command: 'npm install -g @claude/cli@2.0.0',
      description: 'Install Claude CLI v2.0.0',
    };

    Object.defineProperty(window, 'electronAPI', {
      value: {
        claude: {
          getInstallCommand: vi.fn().mockResolvedValue(mockCommand),
        },
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useClaudeCliStatus());

    await act(async () => {
      await result.current.getInstallCommand(true, '2.0.0');
    });

    expect(window.electronAPI!.claude!.getInstallCommand).toHaveBeenCalledWith({
      isUpdate: true,
      version: '2.0.0',
    });
  });
});
