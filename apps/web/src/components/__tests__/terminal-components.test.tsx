import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Polyfill ResizeObserver for jsdom (used by BranchAutocomplete / Radix Popover)
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver;
  }
});

// ─── SessionStatusDisplay ────────────────────────────────────────────────────

import { SessionStatusDisplay } from '../terminal/SessionStatusDisplay';
import type { TerminalSession, GitBranchInfo } from '../terminal/TerminalHeader';

function makeSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'sess-1',
    sessionNumber: 1,
    aiMode: 'claude',
    status: 'idle',
    ...overrides,
  };
}

describe('SessionStatusDisplay', () => {
  it('renders without crashing with minimal props', () => {
    const { container } = render(<SessionStatusDisplay session={makeSession()} />);
    expect(container).toBeTruthy();
  });

  it('shows the AI mode label and session number', () => {
    render(<SessionStatusDisplay session={makeSession({ sessionNumber: 3 })} />);
    expect(screen.getByText('Claude #3')).toBeTruthy();
  });

  it('displays the git branch name when provided via gitBranch prop', () => {
    const gitBranch: GitBranchInfo = { name: 'feat/login', ahead: 2, behind: 1 };
    render(<SessionStatusDisplay session={makeSession()} gitBranch={gitBranch} />);
    expect(screen.getByText('feat/login')).toBeTruthy();
    // ahead / behind indicators
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows the worktree badge when session has worktreePath', () => {
    render(<SessionStatusDisplay session={makeSession({ worktreePath: '/tmp/wt' })} />);
    expect(screen.getByText('worktree')).toBeTruthy();
  });

  it('shows the Resumed badge when session is resumed', () => {
    render(<SessionStatusDisplay session={makeSession({ isResumed: true })} />);
    expect(screen.getByText('Resumed')).toBeTruthy();
  });

  it('shows the skip-permissions indicator when enabled', () => {
    render(<SessionStatusDisplay session={makeSession({ skipPermissions: true })} />);
    expect(screen.getByRole('status', { name: /skip-permissions/i })).toBeTruthy();
  });

  it('displays status message when present', () => {
    render(
      <SessionStatusDisplay session={makeSession({ statusMessage: 'Processing files...' })} />
    );
    expect(screen.getByText('Processing files...')).toBeTruthy();
  });

  it('falls back to session.branch when gitBranch prop is omitted', () => {
    render(<SessionStatusDisplay session={makeSession({ branch: 'main' })} />);
    expect(screen.getByText('main')).toBeTruthy();
  });
});

// ─── MoreMenuDropdown ────────────────────────────────────────────────────────

import { MoreMenuDropdown } from '../terminal/MoreMenuDropdown';

describe('MoreMenuDropdown', () => {
  it('renders the toggle button without crashing', () => {
    render(<MoreMenuDropdown isOpen={false} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /more options/i })).toBeTruthy();
  });

  it('does not show the dropdown menu when closed', () => {
    render(<MoreMenuDropdown isOpen={false} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Kill Session')).toBeNull();
  });

  it('shows Kill Session and Settings when open with onSettingsClick', () => {
    render(
      <MoreMenuDropdown
        isOpen={true}
        onToggle={vi.fn()}
        onSettingsClick={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Kill Session')).toBeTruthy();
  });

  it('calls onToggle when the toggle button is clicked', () => {
    const onToggle = vi.fn();
    render(<MoreMenuDropdown isOpen={false} onToggle={onToggle} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('calls onClose when Kill Session is clicked', () => {
    const onClose = vi.fn();
    render(<MoreMenuDropdown isOpen={true} onToggle={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Kill Session'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onSettingsClick when Settings is clicked', () => {
    const onSettingsClick = vi.fn();
    render(
      <MoreMenuDropdown
        isOpen={true}
        onToggle={vi.fn()}
        onSettingsClick={onSettingsClick}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Settings'));
    expect(onSettingsClick).toHaveBeenCalledOnce();
  });
});

// ─── QuickActionsDropdown ────────────────────────────────────────────────────

import { QuickActionsDropdown } from '../terminal/QuickActionsDropdown';
import type { QuickActionItem } from '../terminal/TerminalCard';

const sampleActions: QuickActionItem[] = [
  { id: 'commit', label: 'Commit', icon: 'GitCommit', category: 'git' },
  { id: 'push', label: 'Push', icon: 'ArrowUp', category: 'git' },
  { id: 'run', label: 'Run Tests', icon: 'Play', category: 'terminal' },
];

describe('QuickActionsDropdown', () => {
  it('renders the toggle button without crashing', () => {
    render(
      <QuickActionsDropdown
        quickActions={sampleActions}
        isOpen={false}
        onToggle={vi.fn()}
        onAction={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /quick actions/i })).toBeTruthy();
  });

  it('does not show dropdown when closed', () => {
    render(
      <QuickActionsDropdown
        quickActions={sampleActions}
        isOpen={false}
        onToggle={vi.fn()}
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByText('Commit')).toBeNull();
  });

  it('shows grouped actions when open', () => {
    render(
      <QuickActionsDropdown
        quickActions={sampleActions}
        isOpen={true}
        onToggle={vi.fn()}
        onAction={vi.fn()}
      />
    );
    // Category headers
    expect(screen.getByText('Git')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
    // Action labels
    expect(screen.getByText('Commit')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('Run Tests')).toBeTruthy();
  });

  it('calls onAction with the correct id when an action is clicked', () => {
    const onAction = vi.fn();
    render(
      <QuickActionsDropdown
        quickActions={sampleActions}
        isOpen={true}
        onToggle={vi.fn()}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText('Push'));
    expect(onAction).toHaveBeenCalledWith('push');
  });

  it('does not open dropdown when disabled', () => {
    const onToggle = vi.fn();
    render(
      <QuickActionsDropdown
        quickActions={sampleActions}
        isOpen={true}
        disabled={true}
        disabledTooltip="Not available"
        onToggle={onToggle}
        onAction={vi.fn()}
      />
    );
    // Dropdown should not render even if isOpen=true when disabled
    expect(screen.queryByText('Commit')).toBeNull();
    // Button should be disabled
    expect(screen.getByRole('button', { name: /quick actions/i }).hasAttribute('disabled')).toBe(
      true
    );
  });
});

// ─── TerminalSearchBar ───────────────────────────────────────────────────────

import { TerminalSearchBar } from '../terminal/TerminalSearchBar';

describe('TerminalSearchBar', () => {
  it('renders without crashing', () => {
    render(
      <TerminalSearchBar
        onSearch={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('search')).toBeTruthy();
  });

  it('renders the search input with placeholder', () => {
    render(
      <TerminalSearchBar
        onSearch={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText('Find...')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TerminalSearchBar
        onSearch={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTitle('Close (Escape)'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onNext when the Next button is clicked', () => {
    const onNext = vi.fn();
    render(
      <TerminalSearchBar
        onSearch={vi.fn()}
        onNext={onNext}
        onPrevious={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Next (Enter)'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onPrevious when the Previous button is clicked', () => {
    const onPrevious = vi.fn();
    render(
      <TerminalSearchBar
        onSearch={vi.fn()}
        onNext={vi.fn()}
        onPrevious={onPrevious}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Previous (Shift+Enter)'));
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it('has toggle buttons for case sensitivity and regex', () => {
    render(
      <TerminalSearchBar
        onSearch={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTitle('Case Sensitive')).toBeTruthy();
    expect(screen.getByTitle('Regex')).toBeTruthy();
  });
});

// ─── PreLaunchSection ────────────────────────────────────────────────────────

import { PreLaunchSection } from '../terminal/PreLaunchSection';
import type { PreLaunchSlot } from '../terminal/PreLaunchBar';

function makeSlot(overrides: Partial<PreLaunchSlot> = {}): PreLaunchSlot {
  return {
    id: 'slot-1',
    aiMode: 'claude',
    branch: 'main',
    shortcutKey: '1',
    ...overrides,
  };
}

describe('PreLaunchSection', () => {
  it('renders nothing when preLaunchSlots is empty', () => {
    const { container } = render(
      <PreLaunchSection
        preLaunchSlots={[]}
        branches={[]}
        onRemoveSlot={vi.fn()}
        onUpdateSlot={vi.fn()}
        onLaunch={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders a PreLaunchBar for each slot', () => {
    const slots = [
      makeSlot({ id: 'slot-1', shortcutKey: '1' }),
      makeSlot({ id: 'slot-2', shortcutKey: '2' }),
    ];
    render(
      <PreLaunchSection
        preLaunchSlots={slots}
        branches={[{ name: 'main', isRemote: false }]}
        onRemoveSlot={vi.fn()}
        onUpdateSlot={vi.fn()}
        onLaunch={vi.fn()}
      />
    );
    // Each slot renders a Launch button
    const launchButtons = screen.getAllByText('Launch');
    expect(launchButtons.length).toBe(2);
  });

  it('renders remove buttons for each slot', () => {
    const slots = [makeSlot({ id: 'slot-1' })];
    render(
      <PreLaunchSection
        preLaunchSlots={slots}
        branches={[]}
        onRemoveSlot={vi.fn()}
        onUpdateSlot={vi.fn()}
        onLaunch={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('calls onLaunch with slot id when Launch is clicked', () => {
    const onLaunch = vi.fn();
    const slots = [makeSlot({ id: 'slot-42' })];
    render(
      <PreLaunchSection
        preLaunchSlots={slots}
        branches={[]}
        onRemoveSlot={vi.fn()}
        onUpdateSlot={vi.fn()}
        onLaunch={onLaunch}
      />
    );
    fireEvent.click(screen.getByText('Launch'));
    expect(onLaunch).toHaveBeenCalledWith('slot-42');
  });

  it('calls onRemoveSlot with slot id when Remove is clicked', () => {
    const onRemoveSlot = vi.fn();
    const slots = [makeSlot({ id: 'slot-7' })];
    render(
      <PreLaunchSection
        preLaunchSlots={slots}
        branches={[]}
        onRemoveSlot={onRemoveSlot}
        onUpdateSlot={vi.fn()}
        onLaunch={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveSlot).toHaveBeenCalledWith('slot-7');
  });
});
