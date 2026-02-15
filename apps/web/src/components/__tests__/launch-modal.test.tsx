import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mock BranchAutocomplete ─────────────────────────────────────────────────
vi.mock('@/components/shared/BranchAutocomplete', () => ({
  BranchAutocomplete: () => <div data-testid="branch-autocomplete" />,
}));

// ─── Mock useClickOutside ────────────────────────────────────────────────────
vi.mock('@/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────
import { LaunchPresetsModal } from '../terminal/LaunchPresetsModal';
import type { Branch } from '@/components/shared/BranchSelector';

const sampleBranches: Branch[] = [
  { name: 'main', isRemote: false },
  { name: 'develop', isRemote: false },
];

const defaultProps = {
  open: false,
  onOpenChange: vi.fn(),
  branches: sampleBranches,
  claudeAvailable: true,
  currentBranch: 'main',
  defaultAiMode: 'claude' as const,
  existingSessionCount: 0,
  onCreateSessions: vi.fn(),
};

// =============================================================================
//  LaunchPresetsModal
// =============================================================================

describe('LaunchPresetsModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<LaunchPresetsModal {...defaultProps} />);
    expect(screen.queryByText('Launch Sessions')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('shows "Launch Sessions" title when open', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} />);
    expect(screen.getByText('Launch Sessions')).toBeTruthy();
  });

  it('shows grid preset cards for 8 presets', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} />);
    // GridPresetCard uses title attribute like "1 session", "2 sessions"
    expect(screen.getByTitle('1 session')).toBeTruthy();
    for (const count of [2, 3, 4, 6, 8, 9, 12]) {
      expect(screen.getByTitle(`${count} sessions`)).toBeTruthy();
    }
  });

  it('shows "Select a layout" as disabled button when no preset is selected', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} />);
    const createBtn = screen.getByText('Select a layout');
    expect(createBtn).toBeTruthy();
    expect(createBtn.closest('button')!.hasAttribute('disabled')).toBe(true);
  });

  it('shows AI mode selector with default "Claude" mode', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} />);
    expect(screen.getByText('Claude')).toBeTruthy();
  });

  it('shows branch selector when worktreeMode is not "never"', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} worktreeMode="branch" />);
    expect(screen.getByTestId('branch-autocomplete')).toBeTruthy();
  });

  it('hides branch selector when worktreeMode is "never"', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} worktreeMode="never" />);
    expect(screen.queryByTestId('branch-autocomplete')).toBeNull();
  });

  it('enables create button and shows session count after selecting a preset', () => {
    render(<LaunchPresetsModal {...defaultProps} open={true} />);

    // Click the "4 sessions" preset card
    fireEvent.click(screen.getByTitle('4 sessions'));

    const createBtn = screen.getByText('Create 4 Sessions');
    expect(createBtn).toBeTruthy();
    expect(createBtn.closest('button')!.hasAttribute('disabled')).toBe(false);
  });

  it('calls onCreateSessions when create button is clicked after selecting a preset', () => {
    const onCreateSessions = vi.fn();
    render(
      <LaunchPresetsModal {...defaultProps} open={true} onCreateSessions={onCreateSessions} />
    );

    // Select preset
    fireEvent.click(screen.getByTitle('2 sessions'));
    // Click create
    fireEvent.click(screen.getByText('Create 2 Sessions'));

    expect(onCreateSessions).toHaveBeenCalledWith(2, 'claude', 'main');
  });

  it('closes the dialog when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(<LaunchPresetsModal {...defaultProps} open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
