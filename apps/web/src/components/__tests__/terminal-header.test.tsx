import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mock TaskListPopover (uses useTaskStore internally) ──────────────────────
vi.mock('../terminal/TaskListPopover', () => ({
  TaskListPopover: () => <div data-testid="task-list-popover" />,
}));

// ─── Mock useClickOutside ────────────────────────────────────────────────────
vi.mock('@/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────
import { TerminalHeader } from '../terminal/TerminalHeader';
import { usePluginStore } from '../../stores/usePluginStore';
import type { TerminalSession } from '../terminal/TerminalHeader';
import type { QuickActionItem } from '../terminal/TerminalCard';

function makeSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'sess-1',
    sessionNumber: 1,
    aiMode: 'claude',
    status: 'idle',
    ...overrides,
  };
}

const sampleQuickActions: QuickActionItem[] = [
  { id: 'commit', label: 'Commit', icon: 'GitCommit', category: 'git' },
];

// =============================================================================
//  TerminalHeader
// =============================================================================

describe('TerminalHeader', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    onCloseMock.mockClear();
    // Set up plugin store with a Claude provider for SessionStatusDisplay
    usePluginStore.setState({
      providers: [
        {
          id: 'claude-provider',
          displayName: 'Claude',
          description: 'Claude AI assistant',
          aiMode: 'claude',
          enabled: true,
          activated: true,
          cliStatus: { installed: true, version: '1.0.0' },
        },
      ],
    });
  });

  it('renders without crashing with minimal props', () => {
    const { container } = render(<TerminalHeader session={makeSession()} onClose={onCloseMock} />);
    expect(container).toBeTruthy();
  });

  it('shows session info via SessionStatusDisplay', () => {
    render(
      <TerminalHeader
        session={makeSession({ sessionNumber: 3, aiMode: 'claude' })}
        onClose={onCloseMock}
      />
    );
    expect(screen.getByText('Claude #3')).toBeTruthy();
  });

  it('shows Resume button when session has error status, claudeSessionId, and onResume', () => {
    const onResume = vi.fn();
    render(
      <TerminalHeader
        session={makeSession({ status: 'error', claudeSessionId: 'cs-123' })}
        onClose={onCloseMock}
        onResume={onResume}
      />
    );
    expect(screen.getByText('Resume')).toBeTruthy();
  });

  it('does not show Resume button when session status is not error', () => {
    render(
      <TerminalHeader
        session={makeSession({ status: 'idle', claudeSessionId: 'cs-123' })}
        onClose={onCloseMock}
        onResume={vi.fn()}
      />
    );
    expect(screen.queryByText('Resume')).toBeNull();
  });

  it('does not show Resume button when claudeSessionId is missing', () => {
    render(
      <TerminalHeader
        session={makeSession({ status: 'error' })}
        onClose={onCloseMock}
        onResume={vi.fn()}
      />
    );
    expect(screen.queryByText('Resume')).toBeNull();
  });

  it('renders QuickActionsDropdown when quickActions are provided', () => {
    render(
      <TerminalHeader
        session={makeSession()}
        onClose={onCloseMock}
        quickActions={sampleQuickActions}
      />
    );
    expect(screen.getByRole('button', { name: /quick actions/i })).toBeTruthy();
  });

  it('does not render QuickActionsDropdown when no quickActions provided', () => {
    render(<TerminalHeader session={makeSession()} onClose={onCloseMock} />);
    expect(screen.queryByRole('button', { name: /quick actions/i })).toBeNull();
  });

  it('renders TaskListPopover for claude sessions', () => {
    render(<TerminalHeader session={makeSession({ aiMode: 'claude' })} onClose={onCloseMock} />);
    expect(screen.getByTestId('task-list-popover')).toBeTruthy();
  });

  it('does not render TaskListPopover for plain sessions', () => {
    render(<TerminalHeader session={makeSession({ aiMode: 'plain' })} onClose={onCloseMock} />);
    expect(screen.queryByTestId('task-list-popover')).toBeNull();
  });

  it('renders drag handle when dragHandleProps are provided', () => {
    const dragHandleProps = {
      setNodeRef: vi.fn(),
      attributes: { role: 'button', tabIndex: 0, 'aria-roledescription': 'sortable' },
      listeners: { onPointerDown: vi.fn() },
    };
    render(
      <TerminalHeader
        session={makeSession()}
        onClose={onCloseMock}
        dragHandleProps={dragHandleProps}
      />
    );
    expect(screen.getByLabelText('Drag to reorder')).toBeTruthy();
  });

  it('does not render drag handle when dragHandleProps are not provided', () => {
    render(<TerminalHeader session={makeSession()} onClose={onCloseMock} />);
    expect(screen.queryByLabelText('Drag to reorder')).toBeNull();
  });
});
