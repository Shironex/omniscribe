import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StatusLegend, StatusDot } from '../shared/StatusLegend';
import { ProgressBar } from '../shared/ProgressBar';
import { UsageCard } from '../shared/UsageCard';
import { TaskBadge } from '../terminal/TaskBadge';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { IdleLandingView } from '../shared/IdleLandingView';
import type { ClaudeSessionEntry } from '@omniscribe/shared';

// ─── Mocks for IdleLandingView ────────────────────────────────────────────────

const mockFetchHistory = vi.fn();
const mockContinueLastSession = vi.fn().mockResolvedValue({ id: 's1' });
const mockResumeSession = vi.fn().mockResolvedValue({ id: 's1' });
const mockUpdateSession = vi.fn();

// Mutable state object shared between the vi.mock factory and individual tests.
// Tests mutate historyMockState.sessions to control what the store returns.
const historyMockState = {
  sessions: [] as ClaudeSessionEntry[],
  isLoading: false,
  error: null as string | null,
  fetchHistory: mockFetchHistory,
};

vi.mock('@/stores/useSessionHistoryStore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSessionHistoryStore: vi.fn((selector: (s: any) => unknown) => selector(historyMockState)),
}));

vi.mock('@/stores/useSessionStore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSessionStore: vi.fn((selector: (s: any) => unknown) =>
    selector({ updateSession: mockUpdateSession })
  ),
}));

vi.mock('@/lib/session', () => ({
  continueLastSession: (...args: unknown[]) => mockContinueLastSession(...args),
  resumeSession: (...args: unknown[]) => mockResumeSession(...args),
}));

vi.mock('@/lib/platform', () => ({
  IS_MAC: false,
  IS_WINDOWS: true,
  IS_LINUX: false,
  IS_ELECTRON: false,
}));

// ─── StatusLegend ────────────────────────────────────────────────────────────

describe('StatusLegend', () => {
  it('renders without crashing with no props', () => {
    const { container } = render(<StatusLegend />);
    expect(container).toBeTruthy();
  });

  it('renders without crashing when showCounts is false (shows all labels)', () => {
    const { container } = render(<StatusLegend showCounts={false} />);
    expect(container.textContent).toContain('Working');
    expect(container.textContent).toContain('Idle');
    expect(container.textContent).toContain('Error');
  });

  it('renders status labels with counts when counts are provided', () => {
    const { container } = render(
      <StatusLegend counts={{ working: 3, idle: 1 }} showCounts={true} />
    );
    expect(container.textContent).toContain('Working');
    expect(container.textContent).toContain('(3)');
    expect(container.textContent).toContain('Idle');
    expect(container.textContent).toContain('(1)');
  });

  it('hides statuses with zero count when showCounts is true', () => {
    const { container } = render(<StatusLegend counts={{ working: 2 }} showCounts={true} />);
    expect(container.textContent).toContain('Working');
    expect(container.textContent).not.toContain('Error');
  });
});

// ─── StatusDot ───────────────────────────────────────────────────────────────

describe('StatusDot', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<StatusDot status="working" />);
    expect(container.querySelector('span')).toBeTruthy();
  });

  it('uses default title from status config', () => {
    render(<StatusDot status="idle" />);
    const dot = screen.getByTitle('Idle');
    expect(dot).toBeTruthy();
  });

  it('accepts a custom title', () => {
    render(<StatusDot status="error" title="Custom Title" />);
    const dot = screen.getByTitle('Custom Title');
    expect(dot).toBeTruthy();
  });
});

// ─── ProgressBar ─────────────────────────────────────────────────────────────

describe('ProgressBar', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<ProgressBar percentage={50} colorClass="bg-blue-500" />);
    expect(container).toBeTruthy();
  });

  it('sets width style based on percentage', () => {
    const { container } = render(<ProgressBar percentage={75} colorClass="bg-green-500" />);
    const inner = container.querySelector('[style]') as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.style.width).toBe('75%');
  });

  it('clamps percentage to 0-100 range', () => {
    const { container: c1 } = render(<ProgressBar percentage={-10} colorClass="bg-red-500" />);
    const inner1 = c1.querySelector('[style]') as HTMLElement;
    expect(inner1).toBeTruthy();
    expect(inner1.style.width).toBe('0%');

    const { container: c2 } = render(<ProgressBar percentage={150} colorClass="bg-red-500" />);
    const inner2 = c2.querySelector('[style]') as HTMLElement;
    expect(inner2).toBeTruthy();
    expect(inner2.style.width).toBe('100%');
  });
});

// ─── UsageCard ───────────────────────────────────────────────────────────────

describe('UsageCard', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(
      <UsageCard title="API Usage" subtitle="Monthly limit" percentage={40} />
    );
    expect(container).toBeTruthy();
  });

  it('displays title, subtitle, and percentage', () => {
    const { container } = render(
      <UsageCard title="API Usage" subtitle="Monthly limit" percentage={40} />
    );
    expect(container.textContent).toContain('API Usage');
    expect(container.textContent).toContain('Monthly limit');
    expect(container.textContent).toContain('40%');
  });

  it('shows reset text when provided', () => {
    const { container } = render(
      <UsageCard
        title="API Usage"
        subtitle="Monthly"
        percentage={50}
        resetText="Resets in 3 days"
      />
    );
    expect(container.textContent).toContain('Resets in 3 days');
  });

  it('shows N/A for invalid percentage (NaN)', () => {
    const { container } = render(
      <UsageCard title="API Usage" subtitle="Monthly" percentage={NaN} />
    );
    expect(container.textContent).toContain('N/A');
  });
});

// ─── TaskBadge ───────────────────────────────────────────────────────────────

describe('TaskBadge', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<TaskBadge taskCount={0} hasInProgress={false} />);
    expect(container).toBeTruthy();
  });

  it('does not show count badge when taskCount is 0', () => {
    const { container } = render(<TaskBadge taskCount={0} hasInProgress={false} />);
    // Only the icon span should be present, no badge with count text
    const spans = container.querySelectorAll('span');
    // The outer span is the wrapper; with 0 tasks there's no inner count span
    expect(spans.length).toBe(1);
  });

  it('shows count when taskCount is greater than 0', () => {
    const { container } = render(<TaskBadge taskCount={5} hasInProgress={false} />);
    expect(container.textContent).toContain('5');
  });

  it('shows 99+ when taskCount exceeds 99', () => {
    const { container } = render(<TaskBadge taskCount={150} hasInProgress={true} />);
    expect(container.textContent).toContain('99+');
  });
});

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Child Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child Content')).toBeTruthy();
  });

  it('renders fallback UI when a child throws', () => {
    // Suppress console.error from React error boundary logging
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingComponent = () => {
      throw new Error('Test explosion');
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Test explosion')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it('displays the error message in the fallback', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingComponent = () => {
      throw new Error('Specific error message');
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Specific error message')).toBeTruthy();

    consoleSpy.mockRestore();
  });
});

// ─── IdleLandingView ─────────────────────────────────────────────────────────

function makeMockSession(overrides: Partial<ClaudeSessionEntry> = {}): ClaudeSessionEntry {
  return {
    sessionId: `sess-${Math.random().toString(36).slice(2, 7)}`,
    summary: 'Test summary',
    firstPrompt: 'First prompt',
    messageCount: 4,
    gitBranch: 'main',
    modified: '',
    created: '',
    projectPath: '/p',
    fullPath: '',
    fileMtime: 0,
    isSidechain: false,
    ...overrides,
  };
}

describe('IdleLandingView', () => {
  beforeEach(() => {
    mockFetchHistory.mockClear();
    mockContinueLastSession.mockClear();
    mockResumeSession.mockClear();
    mockUpdateSession.mockClear();
    // Reset shared history state to empty
    historyMockState.sessions = [];
    historyMockState.isLoading = false;
    historyMockState.error = null;
  });

  it('renders without crashing with required props', () => {
    const { container } = render(<IdleLandingView projectPath={null} onAddSession={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('renders headline and subtitle copy', () => {
    const { container } = render(<IdleLandingView projectPath={null} onAddSession={vi.fn()} />);
    expect(container.textContent).toContain('Orchestrate a fleet of agents.');
    expect(container.textContent).toContain(
      'Run Claude Code, Codex, and plain shells side by side'
    );
  });

  it('renders Launch a fleet primary CTA', () => {
    const { container } = render(<IdleLandingView projectPath={null} onAddSession={vi.fn()} />);
    expect(container.textContent).toContain('Launch a fleet');
  });

  it('renders New session ghost CTA', () => {
    const { container } = render(<IdleLandingView projectPath={null} onAddSession={vi.fn()} />);
    expect(container.textContent).toContain('New session');
  });

  it('calls onOpenLaunchModal when primary CTA clicked and modal handler provided', () => {
    const onOpenLaunchModal = vi.fn();
    render(
      <IdleLandingView
        projectPath={null}
        onAddSession={vi.fn()}
        onOpenLaunchModal={onOpenLaunchModal}
      />
    );
    const primaryBtn = screen.getByRole('button', { name: /launch a fleet/i });
    fireEvent.click(primaryBtn);
    expect(onOpenLaunchModal).toHaveBeenCalledTimes(1);
  });

  it('calls fetchHistory with projectPath on mount when projectPath provided', () => {
    render(<IdleLandingView projectPath="/some/project" onAddSession={vi.fn()} />);
    expect(mockFetchHistory).toHaveBeenCalledWith('/some/project');
  });

  it('omits Recent panel when sessions list is empty', () => {
    const { container } = render(
      <IdleLandingView projectPath="/some/project" onAddSession={vi.fn()} />
    );
    expect(container.textContent).not.toContain('Resume last');
  });

  it('renders up to 3 Recent rows when sessions are present', () => {
    historyMockState.sessions = [
      makeMockSession({ sessionId: 'a', summary: 'Fix auth bug' }),
      makeMockSession({ sessionId: 'b', summary: 'Add tests' }),
      makeMockSession({ sessionId: 'c', summary: 'Refactor module' }),
      makeMockSession({ sessionId: 'd', summary: 'Should not appear' }),
    ];

    const { container } = render(<IdleLandingView projectPath="/p" onAddSession={vi.fn()} />);
    expect(container.textContent).toContain('Fix auth bug');
    expect(container.textContent).toContain('Add tests');
    expect(container.textContent).toContain('Refactor module');
    expect(container.textContent).not.toContain('Should not appear');
  });

  it('calls resumeSession with entry when Recent row clicked', () => {
    historyMockState.sessions = [
      makeMockSession({
        sessionId: 'sess-1',
        summary: 'Fix login',
        gitBranch: 'main',
        projectPath: '/p',
      }),
    ];

    render(<IdleLandingView projectPath="/p" onAddSession={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Resume session: Fix login'));
    expect(mockResumeSession).toHaveBeenCalledWith('sess-1', '/p', 'main', 'Fix login');
  });

  it('Resume Last button is absent when no sessions (panel not rendered)', () => {
    // historyMockState.sessions is [] from beforeEach — panel is hidden
    render(<IdleLandingView projectPath="/p" onAddSession={vi.fn()} />);
    expect(screen.queryByText('Resume last')).toBeNull();
  });
});
