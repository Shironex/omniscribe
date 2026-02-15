import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClaudeSessionEntry } from '@omniscribe/shared';

// ─── Store mocks ─────────────────────────────────────────────────────────────
let mockSessionHistoryState: Record<string, unknown> = {};
let mockSessionState: Record<string, unknown> = {};

vi.mock('@/stores', () => ({
  useSessionHistoryStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSessionHistoryState) => unknown)(mockSessionHistoryState);
    return mockSessionHistoryState;
  }),
  selectSessionHistory: (s: Record<string, unknown>) => s.sessions ?? [],
  useSessionStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSessionState) => unknown)(mockSessionState);
    return mockSessionState;
  }),
}));

vi.mock('@/stores/useSessionHistoryStore', () => ({
  useSessionHistoryStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSessionHistoryState) => unknown)(mockSessionHistoryState);
    return mockSessionHistoryState;
  }),
  selectSessionHistory: (s: Record<string, unknown>) => s.sessions ?? [],
}));

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockSessionState) => unknown)(mockSessionState);
    return mockSessionState;
  }),
}));

// ─── Lib mocks ───────────────────────────────────────────────────────────────
vi.mock('@/lib/session', () => ({
  resumeSession: vi.fn(),
  forkSession: vi.fn(),
  continueLastSession: vi.fn(),
}));

// ─── Sub-component mocks (simplify rendering) ───────────────────────────────
vi.mock('../shared/SessionHistoryFilters', () => ({
  SessionHistoryFilters: () => <div data-testid="session-history-filters" />,
}));

vi.mock('../shared/SessionHistoryItem', () => ({
  SessionHistoryItem: ({ entry }: { entry: ClaudeSessionEntry }) => (
    <div data-testid={`session-item-${entry.sessionId}`}>{entry.summary || 'No summary'}</div>
  ),
}));

// ─── Tooltip provider (needed for Tooltip components) ─────────────────────────
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children, ...props }: { children: React.ReactNode; asChild?: boolean }) => (
    <div {...props}>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────
import { SessionHistoryPanel } from '../shared/SessionHistoryPanel';

// =============================================================================
//  SessionHistoryPanel
// =============================================================================

function makeSessions(count: number): ClaudeSessionEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    sessionId: `session-${i + 1}`,
    summary: `Session ${i + 1} summary`,
    firstPrompt: `Do task ${i + 1}`,
    modified: new Date(Date.now() - i * 60_000).toISOString(),
    gitBranch: i % 2 === 0 ? 'main' : 'develop',
  })) as ClaudeSessionEntry[];
}

describe('SessionHistoryPanel', () => {
  const fetchHistoryMock = vi.fn();
  const updateSessionMock = vi.fn();
  const onCloseMock = vi.fn();

  beforeEach(() => {
    fetchHistoryMock.mockClear();
    updateSessionMock.mockClear();
    onCloseMock.mockClear();

    mockSessionHistoryState = {
      sessions: [],
      isLoading: false,
      error: null,
      fetchHistory: fetchHistoryMock,
    };

    mockSessionState = {
      sessions: [],
      updateSession: updateSessionMock,
    };
  });

  it('renders with w-0 class when isOpen is false (collapsed)', () => {
    const { container } = render(
      <SessionHistoryPanel isOpen={false} onClose={onCloseMock} projectPath="/test" />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-0');
    expect(root.className).not.toContain('w-80');
  });

  it('renders with w-80 class when isOpen is true (expanded)', () => {
    const { container } = render(
      <SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-80');
  });

  it('shows "Session History" header text when open', () => {
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);
    expect(screen.getByText('Session History')).toBeTruthy();
  });

  it('shows "Loading history..." when isLoading is true', () => {
    mockSessionHistoryState = {
      ...mockSessionHistoryState,
      isLoading: true,
    };
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);
    expect(screen.getByText('Loading history...')).toBeTruthy();
  });

  it('shows error text when error is present', () => {
    mockSessionHistoryState = {
      ...mockSessionHistoryState,
      error: 'Failed to load sessions',
    };
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);
    expect(screen.getByText('Failed to load sessions')).toBeTruthy();
  });

  it('shows "No past sessions" when no sessions and not loading', () => {
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);
    expect(screen.getByText('No past sessions')).toBeTruthy();
  });

  it('calls fetchHistory when panel opens with projectPath', () => {
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/my/project" />);
    expect(fetchHistoryMock).toHaveBeenCalledWith('/my/project');
  });

  it('shows "Continue Last Conversation" button', () => {
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);
    expect(screen.getByText('Continue Last Conversation')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);
    fireEvent.click(screen.getByLabelText('Close session history panel'));
    expect(onCloseMock).toHaveBeenCalledOnce();
  });

  it('renders session items when sessions exist', () => {
    mockSessionHistoryState = {
      ...mockSessionHistoryState,
      sessions: makeSessions(3),
    };

    render(<SessionHistoryPanel isOpen={true} onClose={onCloseMock} projectPath="/test" />);

    expect(screen.getByTestId('session-item-session-1')).toBeTruthy();
    expect(screen.getByTestId('session-item-session-2')).toBeTruthy();
    expect(screen.getByTestId('session-item-session-3')).toBeTruthy();
  });
});
