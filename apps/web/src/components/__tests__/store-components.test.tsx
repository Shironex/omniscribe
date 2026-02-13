import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── Socket mock ───────────────────────────────────────────────────────────────
const _mockSocket = { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true };
vi.mock('@/lib/socket', () => {
  const sock = { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true };
  return {
    socket: sock,
    getSocket: vi.fn(() => sock),
    initializeSocket: vi.fn(() => sock),
  };
});

vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: vi.fn(),
}));

// ─── Connection store mock ─────────────────────────────────────────────────────
let mockConnectionState: Record<string, unknown> = {};

vi.mock('@/stores/useConnectionStore', () => ({
  useConnectionStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockConnectionState) => unknown)(mockConnectionState);
    return mockConnectionState;
  }),
}));

// ─── Session store mock ────────────────────────────────────────────────────────
let mockSessionState: Record<string, unknown> = {};

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSessionState) => unknown)(mockSessionState);
    return mockSessionState;
  }),
}));

// ─── Task store mock ───────────────────────────────────────────────────────────
let mockTaskState: Record<string, unknown> = {};

vi.mock('@/stores/useTaskStore', () => ({
  useTaskStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockTaskState) => unknown)(mockTaskState);
    return mockTaskState;
  }),
}));

// ─── Settings store mock ───────────────────────────────────────────────────────
let mockSettingsState: Record<string, unknown> = {};

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSettingsState) => unknown)(mockSettingsState);
    return mockSettingsState;
  }),
}));

// Barrel re-export from @/stores also needs the settings store
vi.mock('@/stores', () => ({
  useSettingsStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSettingsState) => unknown)(mockSettingsState);
    return mockSettingsState;
  }),
}));

// ─── Usage store mock ──────────────────────────────────────────────────────────
let mockUsageState: Record<string, unknown> = {};

vi.mock('@/stores/useUsageStore', () => ({
  useUsageStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockUsageState) => unknown)(mockUsageState);
    return mockUsageState;
  }),
}));

// ─── Workspace store mock ──────────────────────────────────────────────────────
let mockWorkspaceState: Record<string, unknown> = {};

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockWorkspaceState) => unknown)(mockWorkspaceState);
    return mockWorkspaceState;
  }),
}));

// ─── Settings section mocks (simplify SettingsModal) ───────────────────────────
vi.mock('../settings/sections', () => ({
  AppearanceSection: () => <div data-testid="appearance-section" />,
  IntegrationsSection: () => <div data-testid="integrations-section" />,
  GithubSection: () => <div data-testid="github-section" />,
  McpSection: () => <div data-testid="mcp-section" />,
  GeneralSection: () => <div data-testid="general-section" />,
  WorktreesSection: () => <div data-testid="worktrees-section" />,
  SessionsSection: () => <div data-testid="sessions-section" />,
  QuickActionsSection: () => <div data-testid="quick-actions-section" />,
  TerminalSection: () => <div data-testid="terminal-section" />,
}));

vi.mock('../settings/SettingsNavigation', () => ({
  SettingsNavigation: ({
    activeSection,
    onNavigate,
  }: {
    activeSection: string;
    onNavigate: (s: string) => void;
  }) => (
    <nav data-testid="settings-navigation">
      <button data-testid="nav-general" onClick={() => onNavigate('general')}>
        General
      </button>
      <span data-testid="active-section">{activeSection}</span>
    </nav>
  ),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────────
import { ReconnectionOverlay } from '../terminal/ReconnectionOverlay';
import { BackpressureOverlay } from '../terminal/BackpressureOverlay';
import { TaskListPopover } from '../terminal/TaskListPopover';
import { SettingsModal } from '../settings/SettingsModal';
import { UsagePopover } from '../shared/UsagePopover';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Wrapper that provides the TooltipProvider context required by UsagePopover */
function renderUsagePopover() {
  return render(
    <TooltipProvider>
      <UsagePopover />
    </TooltipProvider>
  );
}

// =============================================================================
//  ReconnectionOverlay
// =============================================================================
describe('ReconnectionOverlay', () => {
  beforeEach(() => {
    mockConnectionState = {
      status: 'connected',
      disconnectedAt: null,
      retryConnection: vi.fn(),
    };
  });

  it('renders nothing when connected', () => {
    const { container } = render(<ReconnectionOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "Reconnecting..." when status is reconnecting', () => {
    mockConnectionState = { ...mockConnectionState, status: 'reconnecting' };
    render(<ReconnectionOverlay />);
    expect(screen.getByText('Reconnecting...')).toBeTruthy();
    expect(screen.getByTestId('reconnection-overlay')).toBeTruthy();
  });

  it('shows "Connection lost" and Retry button when status is failed', () => {
    mockConnectionState = { ...mockConnectionState, status: 'failed' };
    render(<ReconnectionOverlay />);
    expect(screen.getByText('Connection lost')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('calls retryConnection when Retry button is clicked', () => {
    const retryFn = vi.fn();
    mockConnectionState = { ...mockConnectionState, status: 'failed', retryConnection: retryFn };
    render(<ReconnectionOverlay />);
    fireEvent.click(screen.getByText('Retry'));
    expect(retryFn).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
//  BackpressureOverlay
// =============================================================================
describe('BackpressureOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSessionState = { backpressured: {} };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when not backpressured', () => {
    const { container } = render(<BackpressureOverlay terminalSessionId={1} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows overlay after debounce when backpressured', () => {
    mockSessionState = { backpressured: { 1: true } };
    render(<BackpressureOverlay terminalSessionId={1} />);

    // Before debounce (300ms) — should be hidden
    expect(screen.queryByTestId('backpressure-overlay')).toBeNull();

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId('backpressure-overlay')).toBeTruthy();
    expect(screen.getByText('Buffering output...')).toBeTruthy();
  });

  it('shows cancel button that emits terminal cancel event', async () => {
    const { getSocket } = await import('@/lib/socket');
    mockSessionState = { backpressured: { 1: true } };
    render(<BackpressureOverlay terminalSessionId={1} />);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    fireEvent.click(screen.getByText('Cancel output'));
    expect(getSocket().emit).toHaveBeenCalled();
  });
});

// =============================================================================
//  TaskListPopover
// =============================================================================
describe('TaskListPopover', () => {
  beforeEach(() => {
    mockTaskState = { tasksBySession: {} };
  });

  it('renders without crashing', () => {
    render(<TaskListPopover sessionId="session-1" />);
    expect(screen.getByRole('button', { name: /Tasks/i })).toBeTruthy();
  });

  it('shows "No tasks reported yet" when popover is opened with empty tasks', () => {
    render(<TaskListPopover sessionId="session-1" />);
    // Open the popover
    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));
    expect(screen.getByText('No tasks reported yet')).toBeTruthy();
  });

  it('shows task groups when tasks exist', () => {
    mockTaskState = {
      tasksBySession: {
        'session-1': [
          { id: '1', subject: 'Build feature', status: 'in_progress' },
          { id: '2', subject: 'Write tests', status: 'pending' },
          { id: '3', subject: 'Setup project', status: 'completed' },
        ],
      },
    };
    render(<TaskListPopover sessionId="session-1" />);
    // Open the popover
    fireEvent.click(screen.getByRole('button', { name: /Tasks \(3\)/i }));
    expect(screen.getByText('Build feature')).toBeTruthy();
    expect(screen.getByText('Write tests')).toBeTruthy();
    expect(screen.getByText('Setup project')).toBeTruthy();
  });
});

// =============================================================================
//  SettingsModal
// =============================================================================
describe('SettingsModal', () => {
  const closeFn = vi.fn();
  const navigateFn = vi.fn();

  beforeEach(() => {
    closeFn.mockClear();
    navigateFn.mockClear();
    mockSettingsState = {
      isOpen: false,
      activeSection: 'appearance',
      closeSettings: closeFn,
      navigateToSection: navigateFn,
    };
  });

  it('renders nothing when modal is closed', () => {
    const { container } = render(<SettingsModal />);
    // Dialog should not render content when closed
    expect(screen.queryByText('Settings')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('renders modal with Settings title when open', () => {
    mockSettingsState = { ...mockSettingsState, isOpen: true };
    render(<SettingsModal />);
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders the active section content', () => {
    mockSettingsState = { ...mockSettingsState, isOpen: true, activeSection: 'appearance' };
    render(<SettingsModal />);
    expect(screen.getByTestId('appearance-section')).toBeTruthy();
  });

  it('renders general section when activeSection is general', () => {
    mockSettingsState = { ...mockSettingsState, isOpen: true, activeSection: 'general' };
    render(<SettingsModal />);
    expect(screen.getByTestId('general-section')).toBeTruthy();
  });

  it('calls navigateToSection when navigation button is clicked', () => {
    mockSettingsState = { ...mockSettingsState, isOpen: true };
    render(<SettingsModal />);
    fireEvent.click(screen.getByTestId('nav-general'));
    expect(navigateFn).toHaveBeenCalledWith('general');
  });
});

// =============================================================================
//  UsagePopover
// =============================================================================
describe('UsagePopover', () => {
  beforeEach(() => {
    mockUsageState = {
      claudeUsage: null,
      status: 'idle',
      error: null,
      errorMessage: null,
      fetchUsage: vi.fn(),
      setWorkingDir: vi.fn(),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      lastFetched: null,
    };
    mockWorkspaceState = {
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', projectPath: '/projects/test', name: 'Test' }],
    };
  });

  it('renders without crashing', () => {
    renderUsagePopover();
    // The trigger button should be present
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('shows loading state when popover is opened with no usage data', () => {
    renderUsagePopover();
    // Open the popover
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Loading usage data...')).toBeTruthy();
    expect(screen.getByText('Claude Usage')).toBeTruthy();
  });

  it('shows error state when there is an error', () => {
    mockUsageState = {
      ...mockUsageState,
      error: 'cli_not_found' as const,
      errorMessage: 'CLI missing',
    };
    renderUsagePopover();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Claude CLI not found')).toBeTruthy();
  });

  it('shows usage data when available', () => {
    mockUsageState = {
      ...mockUsageState,
      claudeUsage: {
        sessionPercentage: 45,
        sessionResetText: 'Resets in 3h',
        sonnetWeeklyPercentage: 30,
        sonnetResetText: 'Resets Monday',
        weeklyPercentage: 25,
        weeklyResetText: 'Resets Monday',
      },
      status: 'success',
      lastFetched: Date.now(),
    };
    renderUsagePopover();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Session Usage')).toBeTruthy();
    expect(screen.getByText('Sonnet')).toBeTruthy();
  });
});
