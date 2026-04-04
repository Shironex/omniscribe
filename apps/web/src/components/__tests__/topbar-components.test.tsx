import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Platform mock ───────────────────────────────────────────────────────────
vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: false,
  IS_MAC: false,
  IS_WINDOWS: false,
  IS_LINUX: true,
}));

// ─── Sub-component mocks (TopBar composes these) ─────────────────────────────
vi.mock('../shared/ProjectTabs', () => ({
  ProjectTabs: (props: Record<string, unknown>) => (
    <div data-testid="project-tabs-inner" data-active-tab={props.activeTabId as string} />
  ),
}));

vi.mock('../shared/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock('../shared/ActionBar', () => ({
  ActionBar: (props: Record<string, unknown>) => (
    <div data-testid="action-bar" data-has-active-sessions={String(props.hasActiveSessions)} />
  ),
}));

vi.mock('../shared/WindowControls', () => ({
  WindowControls: () => <div data-testid="window-controls" />,
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────
import { TopBar } from '../shared/TopBar';
import { BranchSelector, type Branch } from '../shared/BranchSelector';

// =============================================================================
//  TopBar
// =============================================================================

const defaultTopBarProps = {
  tabs: [{ id: 'tab-1', label: 'Project A', projectPath: '/test/project-a' }],
  activeTabId: 'tab-1',
  onSelectTab: vi.fn(),
  onCloseTab: vi.fn(),
  onNewTab: vi.fn(),
  currentBranch: 'main',
  onStopAll: vi.fn(),
  onLaunch: vi.fn(),
  canLaunch: true,
  hasActiveSessions: false,
};

describe('TopBar', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<TopBar {...defaultTopBarProps} />);
    expect(container).toBeTruthy();
  });

  it('has data-testid="project-tabs" on the root element', () => {
    render(<TopBar {...defaultTopBarProps} />);
    expect(screen.getByTestId('project-tabs')).toBeTruthy();
  });

  it('renders all sub-components', () => {
    render(<TopBar {...defaultTopBarProps} />);
    expect(screen.getByTestId('project-tabs-inner')).toBeTruthy();
    expect(screen.getByTestId('status-bar')).toBeTruthy();
    expect(screen.getByTestId('action-bar')).toBeTruthy();
    expect(screen.getByTestId('window-controls')).toBeTruthy();
  });

  it('passes className prop through', () => {
    render(<TopBar {...defaultTopBarProps} className="custom-class" />);
    const root = screen.getByTestId('project-tabs');
    expect(root.className).toContain('custom-class');
  });

  it('does not apply pl-[78px] class when not on macOS Electron', () => {
    render(<TopBar {...defaultTopBarProps} />);
    const root = screen.getByTestId('project-tabs');
    expect(root.className).not.toContain('pl-[78px]');
  });
});

// =============================================================================
//  BranchSelector
// =============================================================================

const sampleBranches: Branch[] = [
  { name: 'main', isRemote: false },
  { name: 'feat/login', isRemote: false },
  { name: 'fix/bug-42', isRemote: false },
  { name: 'origin/main', isRemote: true },
  { name: 'origin/develop', isRemote: true },
];

describe('BranchSelector', () => {
  it('renders trigger button with current branch name', () => {
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={vi.fn()} />);
    expect(screen.getByText('main')).toBeTruthy();
  });

  it('does not show dropdown by default', () => {
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={vi.fn()} />);
    expect(screen.queryByPlaceholderText('Search branches...')).toBeNull();
  });

  it('opens dropdown when trigger button is clicked', () => {
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText('main'));
    expect(screen.getByPlaceholderText('Search branches...')).toBeTruthy();
  });

  it('shows Local and Remote section headers when dropdown is open', () => {
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText('main'));
    expect(screen.getByText('Local')).toBeTruthy();
    expect(screen.getByText('Remote')).toBeTruthy();
  });

  it('filters branches based on search input', () => {
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText('main'));

    const input = screen.getByPlaceholderText('Search branches...');
    fireEvent.change(input, { target: { value: 'feat' } });

    // Only feat/login should match
    expect(screen.getByText('feat/login')).toBeTruthy();
    expect(screen.queryByText('fix/bug-42')).toBeNull();
  });

  it('calls onSelect and closes dropdown when a branch is clicked', () => {
    const onSelect = vi.fn();
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('main'));
    fireEvent.click(screen.getByText('feat/login'));

    expect(onSelect).toHaveBeenCalledWith('feat/login');
    // Dropdown should be closed
    expect(screen.queryByPlaceholderText('Search branches...')).toBeNull();
  });

  it('shows "Create branch" option when search does not match existing', () => {
    const onCreateBranch = vi.fn();
    render(
      <BranchSelector
        branches={sampleBranches}
        currentBranch="main"
        onSelect={vi.fn()}
        onCreateBranch={onCreateBranch}
      />
    );
    fireEvent.click(screen.getByText('main'));

    const input = screen.getByPlaceholderText('Search branches...');
    fireEvent.change(input, { target: { value: 'new-branch' } });

    expect(screen.getByText(/Create branch/)).toBeTruthy();
    expect(screen.getByText('"new-branch"')).toBeTruthy();
  });

  it('does not open dropdown when disabled', () => {
    render(
      <BranchSelector
        branches={sampleBranches}
        currentBranch="main"
        onSelect={vi.fn()}
        disabled={true}
      />
    );
    fireEvent.click(screen.getByText('main'));
    expect(screen.queryByPlaceholderText('Search branches...')).toBeNull();
  });

  it('closes dropdown on Escape key', () => {
    render(<BranchSelector branches={sampleBranches} currentBranch="main" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText('main'));
    expect(screen.getByPlaceholderText('Search branches...')).toBeTruthy();

    // Radix Popover handles Escape dismissal natively
    fireEvent.keyDown(screen.getByPlaceholderText('Search branches...'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search branches...')).toBeNull();
  });
});
