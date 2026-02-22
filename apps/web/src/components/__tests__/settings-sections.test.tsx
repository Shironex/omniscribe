import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock stores
// ---------------------------------------------------------------------------

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      theme: 'dark',
      previewTheme: null,
      setTheme: vi.fn(),
      setPreviewTheme: vi.fn(),
      githubCliStatus: {
        installed: true,
        version: '2.40.0',
        path: '/usr/local/bin/gh',
        method: 'path',
        platform: 'darwin',
        arch: 'arm64',
        auth: { authenticated: true, username: 'testuser', scopes: ['repo'] },
      },
      isGithubCliLoading: false,
      setGithubCliStatus: vi.fn(),
      setGithubCliLoading: vi.fn(),
    })
  ),
}));

vi.mock('@/stores/useTerminalStore', () => ({
  useTerminalStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      fontSize: 13,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 10000,
      lineHeight: 1.2,
      terminalThemeName: 'tokyonight',
      setFontSize: vi.fn(),
      setCursorStyle: vi.fn(),
      setCursorBlink: vi.fn(),
      setScrollback: vi.fn(),
      setLineHeight: vi.fn(),
      setTerminalThemeName: vi.fn(),
      resetToDefaults: vi.fn(),
    })
  ),
}));

vi.mock('@/stores/useUpdateStore', () => ({
  useUpdateStore: vi.fn(() => ({
    status: 'idle',
    updateInfo: null,
    progress: null,
    error: null,
    channel: 'stable',
    isChannelSwitching: false,
    checkForUpdates: vi.fn(),
    startDownload: vi.fn(),
    installNow: vi.fn(),
    setChannel: vi.fn(),
  })),
}));

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      preferences: {
        theme: 'dark',
        worktree: { enabled: false, prefix: 'omniscribe' },
        session: {
          defaultMode: 'claude',
          skipPermissions: false,
          quickActionMode: 'paste-only',
          autoResumeOnRestart: false,
        },
      },
      updatePreference: vi.fn(),
      tabs: [
        {
          id: 'tab-1',
          projectPath: '/test/project',
          name: 'test',
          sessionIds: [],
          lastAccessedAt: new Date(),
        },
      ],
      activeTabId: 'tab-1',
    })
  ),
  selectActiveTab: (state: Record<string, unknown>) => {
    const tabs = state.tabs as Array<Record<string, unknown>>;
    return tabs?.find((t: Record<string, unknown>) => t.id === state.activeTabId);
  },
}));

vi.mock('@/stores/useMcpStore', () => ({
  useMcpStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      servers: [],
      serverStates: {},
      isDiscovering: false,
      discoverServers: vi.fn(),
      internalMcp: { available: true, path: '/usr/local/bin/omniscribe-mcp' },
    })
  ),
  selectInternalMcp: (state: Record<string, unknown>) => state.internalMcp,
}));

// Re-export barrel that some components import from
vi.mock('@/stores', () => ({
  useSettingsStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      theme: 'dark',
      previewTheme: null,
      setTheme: vi.fn(),
      setPreviewTheme: vi.fn(),
      githubCliStatus: {
        installed: true,
        version: '2.40.0',
        path: '/usr/local/bin/gh',
        method: 'path',
        platform: 'darwin',
        arch: 'arm64',
        auth: { authenticated: true, username: 'testuser', scopes: ['repo'] },
      },
      isGithubCliLoading: false,
      setGithubCliStatus: vi.fn(),
      setGithubCliLoading: vi.fn(),
    })
  ),
  usePluginStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockPluginState) => unknown)(mockPluginState);
    return mockPluginState;
  }),
  useWorkspaceStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      preferences: {
        theme: 'dark',
        worktree: { enabled: false, prefix: 'omniscribe' },
        session: {
          defaultMode: 'claude',
          skipPermissions: false,
          quickActionMode: 'paste-only',
          autoResumeOnRestart: false,
        },
      },
      updatePreference: vi.fn(),
      tabs: [
        {
          id: 'tab-1',
          projectPath: '/test/project',
          name: 'test',
          sessionIds: [],
          lastAccessedAt: new Date(),
        },
      ],
      activeTabId: 'tab-1',
    })
  ),
  useMcpStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      servers: [],
      serverStates: {},
      isDiscovering: false,
      discoverServers: vi.fn(),
      internalMcp: { available: true, path: '/usr/local/bin/omniscribe-mcp' },
    })
  ),
  selectActiveTab: (state: Record<string, unknown>) => {
    const tabs = state.tabs as Array<Record<string, unknown>>;
    return tabs?.find((t: Record<string, unknown>) => t.id === state.activeTabId);
  },
  selectInternalMcp: (state: Record<string, unknown>) => state.internalMcp,
}));

// Mock useAppVersion hook
vi.mock('@/hooks/useAppVersion', () => ({
  useAppVersion: () => '0.6.0',
}));

// Mock @/lib/platform
vi.mock('@/lib/platform', () => ({
  IS_MAC: false,
  IS_WINDOWS: false,
  IS_LINUX: true,
}));

// Mock socket (used by workspace/mcp stores, and could be imported transitively)
vi.mock('@/lib/socket', () => ({
  socket: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connected: true,
  },
}));

vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: vi.fn(),
}));

// Plugin store mock
const mockPluginState: Record<string, unknown> = {
  themes: new Map(),
  settingsSections: new Map(),
  settingsCategories: new Map(),
  statusRenderers: new Map(),
  providers: [],
};

vi.mock('@/stores/usePluginStore', () => ({
  usePluginStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockPluginState) => unknown)(mockPluginState);
    return mockPluginState;
  }),
}));

// ---------------------------------------------------------------------------
// Mock window.electronAPI
// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.6.0'),
        openLogsFolder: vi.fn(),
        listLogFiles: vi.fn().mockResolvedValue([]),
        readLogFile: vi.fn().mockResolvedValue(''),
      },
      updater: {
        checkForUpdates: vi.fn().mockResolvedValue({ enabled: false }),
        startDownload: vi.fn().mockResolvedValue(undefined),
        installNow: vi.fn().mockResolvedValue(undefined),
        setChannel: vi.fn().mockResolvedValue('stable'),
        getChannel: vi.fn().mockResolvedValue('stable'),
        onCheckingForUpdate: vi.fn(() => vi.fn()),
        onUpdateAvailable: vi.fn(() => vi.fn()),
        onUpdateNotAvailable: vi.fn(() => vi.fn()),
        onDownloadProgress: vi.fn(() => vi.fn()),
        onUpdateDownloaded: vi.fn(() => vi.fn()),
        onUpdateError: vi.fn(() => vi.fn()),
        onChannelChanged: vi.fn(() => vi.fn()),
      },
      github: {
        getStatus: vi.fn().mockResolvedValue({
          installed: true,
          version: '2.40.0',
          path: '/usr/local/bin/gh',
          method: 'path',
          platform: 'darwin',
          arch: 'arm64',
          auth: { authenticated: true, username: 'testuser', scopes: ['repo'] },
        }),
      },
      platform: 'linux',
    },
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Import components AFTER mocks
// ---------------------------------------------------------------------------

import { AppearanceSection } from '../settings/sections/AppearanceSection';
import { TerminalSection } from '../settings/sections/TerminalSection';
import { GeneralSection } from '../settings/sections/GeneralSection';
import { SessionsSection } from '../settings/sections/SessionsSection';
import { GithubSection } from '../settings/sections/GithubSection';
import { McpSection } from '../settings/sections/McpSection';

// ===========================================================================
// AppearanceSection
// ===========================================================================

describe('AppearanceSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<AppearanceSection />);
    expect(container).toBeTruthy();
  });

  it('displays the Appearance heading', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('Appearance')).toBeTruthy();
  });

  it('shows the Dark Themes and Light Themes tab buttons', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('Dark Themes')).toBeTruthy();
    expect(screen.getByText('Light Themes')).toBeTruthy();
  });

  it('shows the Theme sub-heading', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('Theme')).toBeTruthy();
  });
});

// ===========================================================================
// TerminalSection
// ===========================================================================

describe('TerminalSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<TerminalSection />);
    expect(container).toBeTruthy();
  });

  it('displays the Terminal heading and description', () => {
    render(<TerminalSection />);
    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(screen.getByText('Customize the terminal appearance and behavior.')).toBeTruthy();
  });

  it('shows font size, cursor style, and scrollback labels', () => {
    render(<TerminalSection />);
    expect(screen.getByText('Font Size: 13px')).toBeTruthy();
    expect(screen.getByText('Cursor Style')).toBeTruthy();
    expect(screen.getByText('Cursor Blink')).toBeTruthy();
    expect(screen.getByText(/Scrollback:/)).toBeTruthy();
  });

  it('shows cursor style options: Block, Underline, Bar', () => {
    render(<TerminalSection />);
    expect(screen.getByText('Block')).toBeTruthy();
    expect(screen.getByText('Underline')).toBeTruthy();
    expect(screen.getByText('Bar')).toBeTruthy();
  });

  it('shows Reset to Defaults button', () => {
    render(<TerminalSection />);
    expect(screen.getByText('Reset to Defaults')).toBeTruthy();
  });
});

// ===========================================================================
// GeneralSection
// ===========================================================================

describe('GeneralSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<GeneralSection />);
    expect(container).toBeTruthy();
  });

  it('displays the About heading and app name', () => {
    render(<GeneralSection />);
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('Omniscribe')).toBeTruthy();
  });

  it('shows the Updates section with channel selector', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Updates')).toBeTruthy();
    expect(screen.getByText('Stable')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('shows the Diagnostics section with View Logs and Open Log Folder buttons', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Diagnostics')).toBeTruthy();
    expect(screen.getByText('View Logs')).toBeTruthy();
    expect(screen.getByText('Open Log Folder')).toBeTruthy();
  });

  it('shows the Check for Updates button', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Check for Updates')).toBeTruthy();
  });
});

// ===========================================================================
// SessionsSection
// ===========================================================================

describe('SessionsSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<SessionsSection />);
    expect(container).toBeTruthy();
  });

  it('displays the Sessions heading and description', () => {
    render(<SessionsSection />);
    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByText('Configure default behavior for new sessions')).toBeTruthy();
  });

  it('shows Default Mode options: Claude Code and Plain Terminal', () => {
    render(<SessionsSection />);
    expect(screen.getByText('Default Mode')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('Plain Terminal')).toBeTruthy();
  });

  it('shows Skip Permissions and Auto-Resume toggle sections', () => {
    render(<SessionsSection />);
    expect(screen.getByText('Skip Permissions')).toBeTruthy();
    expect(screen.getByText('Allow skip-permissions mode')).toBeTruthy();
    expect(screen.getByText('Auto-Resume')).toBeTruthy();
    expect(screen.getByText('Resume sessions on restart')).toBeTruthy();
  });
});

// ===========================================================================
// GithubSection
// ===========================================================================

describe('GithubSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<GithubSection />);
    expect(container).toBeTruthy();
  });

  it('displays the GitHub CLI heading', () => {
    render(<GithubSection />);
    expect(screen.getByText('GitHub CLI')).toBeTruthy();
    expect(screen.getByText('GitHub CLI (gh) for PRs, issues, and more')).toBeTruthy();
  });

  it('shows CLI Installation and Authentication status cards', () => {
    render(<GithubSection />);
    expect(screen.getByText('CLI Installation')).toBeTruthy();
    expect(screen.getByText('Authentication')).toBeTruthy();
    expect(screen.getByText('Installed')).toBeTruthy();
    expect(screen.getByText('Signed In')).toBeTruthy();
  });

  it('shows refresh button with correct aria label', () => {
    render(<GithubSection />);
    expect(screen.getByRole('button', { name: 'Refresh GitHub CLI status' })).toBeTruthy();
  });
});

// ===========================================================================
// McpSection
// ===========================================================================

describe('McpSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<McpSection />);
    expect(container).toBeTruthy();
  });

  it('displays the MCP Servers heading', () => {
    render(<McpSection />);
    expect(screen.getByText('MCP Servers')).toBeTruthy();
    expect(screen.getByText('Model Context Protocol server connections')).toBeTruthy();
  });

  it('shows internal MCP status and server status sections', () => {
    render(<McpSection />);
    expect(screen.getByText('Internal MCP Server')).toBeTruthy();
    expect(screen.getByText('Server Status')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('shows empty state when no servers are configured', () => {
    render(<McpSection />);
    expect(screen.getByText('No MCP servers discovered')).toBeTruthy();
  });

  it('shows refresh button with correct aria label', () => {
    render(<McpSection />);
    expect(screen.getByRole('button', { name: 'Refresh MCP servers' })).toBeTruthy();
  });
});
