import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClaudeSessionEntry } from '@omniscribe/shared';

// ─── Store mocks ─────────────────────────────────────────────────────────────
let mockSessionHistoryState: Record<string, unknown> = {};
let mockSessionState: Record<string, unknown> = {};

// Mock the barrel re-export AND individual modules because:
// - SessionHistoryPanel imports from '@/stores' (barrel)
// - Sub-components or lib modules may import directly from individual files
// Both need to resolve to the same mock state.
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

// ─── Mock useAppUIStore ─────────────────────────────────────────────────────
let mockAppUIState = { isHistoryOpen: false, closeHistory: vi.fn() };

vi.mock('@/stores/useAppUIStore', () => ({
  useAppUIStore: vi.fn((sel?: unknown) => {
    if (typeof sel === 'function')
      return (sel as (s: typeof mockAppUIState) => unknown)(mockAppUIState);
    return mockAppUIState;
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
  TooltipTrigger: ({
    children,
    asChild: _asChild,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div {...props}>{children}</div>,
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
    fullPath: `/projects/test/session-${i + 1}.json`,
    fileMtime: Date.now() - i * 60_000,
    summary: `Session ${i + 1} summary`,
    firstPrompt: `Do task ${i + 1}`,
    messageCount: i + 1,
    created: new Date(Date.now() - i * 120_000).toISOString(),
    modified: new Date(Date.now() - i * 60_000).toISOString(),
    gitBranch: i % 2 === 0 ? 'main' : 'develop',
    projectPath: '/projects/test',
    isSidechain: false,
  }));
}

describe('SessionHistoryPanel', () => {
  const fetchHistoryMock = vi.fn();
  const updateSessionMock = vi.fn();
  const closeHistoryMock = vi.fn();

  beforeEach(() => {
    fetchHistoryMock.mockClear();
    updateSessionMock.mockClear();
    closeHistoryMock.mockClear();

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

    mockAppUIState = {
      isHistoryOpen: false,
      closeHistory: closeHistoryMock,
    };
  });

  it('renders with collapsed state when isHistoryOpen is false', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: false };
    render(<SessionHistoryPanel projectPath="/test" />);
    // When isOpen is false, AnimatePresence renders nothing inside
    expect(screen.queryByText('Session History')).toBeNull();
  });

  it('renders expanded when isHistoryOpen is true', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    render(<SessionHistoryPanel projectPath="/test" />);
    expect(screen.getByText('Session History')).toBeTruthy();
  });

  it('shows "Session History" header text when open', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    render(<SessionHistoryPanel projectPath="/test" />);
    expect(screen.getByText('Session History')).toBeTruthy();
  });

  it('shows "Loading history..." when isLoading is true', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    mockSessionHistoryState = {
      ...mockSessionHistoryState,
      isLoading: true,
    };
    render(<SessionHistoryPanel projectPath="/test" />);
    expect(screen.getByText('Loading history...')).toBeTruthy();
  });

  it('shows error text when error is present', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    mockSessionHistoryState = {
      ...mockSessionHistoryState,
      error: 'Failed to load sessions',
    };
    render(<SessionHistoryPanel projectPath="/test" />);
    expect(screen.getByText('Failed to load sessions')).toBeTruthy();
  });

  it('shows "No past sessions" when no sessions and not loading', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    render(<SessionHistoryPanel projectPath="/test" />);
    expect(screen.getByText('No past sessions')).toBeTruthy();
  });

  it('calls fetchHistory when panel opens with projectPath', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    render(<SessionHistoryPanel projectPath="/my/project" />);
    expect(fetchHistoryMock).toHaveBeenCalledWith('/my/project');
  });

  it('shows "Continue Last Conversation" button', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    render(<SessionHistoryPanel projectPath="/test" />);
    expect(screen.getByText('Continue Last Conversation')).toBeTruthy();
  });

  it('calls closeHistory from store when close button is clicked', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    render(<SessionHistoryPanel projectPath="/test" />);
    fireEvent.click(screen.getByLabelText('Close session history panel'));
    expect(closeHistoryMock).toHaveBeenCalledOnce();
  });

  it('renders session items when sessions exist', () => {
    mockAppUIState = { ...mockAppUIState, isHistoryOpen: true };
    mockSessionHistoryState = {
      ...mockSessionHistoryState,
      sessions: makeSessions(3),
    };

    render(<SessionHistoryPanel projectPath="/test" />);

    expect(screen.getByTestId('session-item-session-1')).toBeTruthy();
    expect(screen.getByTestId('session-item-session-2')).toBeTruthy();
    expect(screen.getByTestId('session-item-session-3')).toBeTruthy();
  });
});
