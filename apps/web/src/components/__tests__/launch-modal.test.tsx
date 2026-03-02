import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mock BranchAutocomplete ─────────────────────────────────────────────────
vi.mock('@/components/shared/BranchAutocomplete', () => ({
  BranchAutocomplete: () => <div data-testid="branch-autocomplete" />,
}));

// ─── Mock useClickOutside ────────────────────────────────────────────────────
vi.mock('@/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

// ─── Mock usePluginStore ────────────────────────────────────────────────────
vi.mock('@/stores/usePluginStore', () => ({
  usePluginStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      statusRenderers: new Map(),
      providers: [
        {
          id: 'provider-claude',
          aiMode: 'claude',
          displayName: 'Claude',
          enabled: true,
          activated: true,
        },
      ],
    }),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────
import { LaunchPresetsModal } from '../terminal/LaunchPresetsModal';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { useGitStore } from '@/stores/useGitStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

// =============================================================================
//  Helpers
// =============================================================================

function setupStores(
  overrides: {
    isLaunchModalOpen?: boolean;
    branches?: Array<{ name: string; isRemote: boolean; isCurrent: boolean }>;
    currentBranch?: string;
    worktreeMode?: string;
  } = {}
) {
  // Set launch modal open state
  useAppUIStore.setState({
    isLaunchModalOpen: overrides.isLaunchModalOpen ?? true,
  });

  // Set git store branches
  useGitStore.setState({
    branches: (overrides.branches ?? [
      { name: 'main', isRemote: false, isCurrent: true },
      { name: 'develop', isRemote: false, isCurrent: false },
    ]) as unknown as ReturnType<typeof useGitStore.getState>['branches'],
    currentBranch: {
      name: overrides.currentBranch ?? 'main',
      isCurrent: true,
      isRemote: false,
    } as unknown as ReturnType<typeof useGitStore.getState>['currentBranch'],
  });

  // Set workspace preferences (worktree mode)
  if (overrides.worktreeMode) {
    useWorkspaceStore.setState({
      preferences: {
        ...useWorkspaceStore.getState().preferences,
        worktree: {
          mode: overrides.worktreeMode as 'branch' | 'never' | 'always',
          location: 'project',
          autoCleanup: true,
        },
      },
    });
  }

  // Set Claude CLI as installed so default AI mode is 'claude'
  useSettingsStore.setState({
    claudeCliStatus: {
      installed: true,
      version: '1.0.0',
      platform: 'linux',
      arch: 'x64',
      auth: { authenticated: true },
    },
  });
}

// =============================================================================
//  LaunchPresetsModal
// =============================================================================

describe('LaunchPresetsModal', () => {
  beforeEach(() => {
    // Reset stores to default state
    useAppUIStore.setState({ isLaunchModalOpen: false, isHistoryOpen: false });
  });

  it('renders nothing when open is false', () => {
    setupStores({ isLaunchModalOpen: false });
    const { container } = render(
      <LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />
    );
    expect(screen.queryByText('Launch Sessions')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('shows "Launch Sessions" title when open', () => {
    setupStores({ isLaunchModalOpen: true });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);
    expect(screen.getByText('Launch Sessions')).toBeTruthy();
  });

  it('shows grid preset cards for 8 presets', () => {
    setupStores({ isLaunchModalOpen: true });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);
    expect(screen.getByTitle('1 session')).toBeTruthy();
    for (const count of [2, 3, 4, 6, 8, 9, 12]) {
      expect(screen.getByTitle(`${count} sessions`)).toBeTruthy();
    }
  });

  it('shows "Select a layout" as disabled button when no preset is selected', () => {
    setupStores({ isLaunchModalOpen: true });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);
    const createBtn = screen.getByText('Select a layout');
    expect(createBtn).toBeTruthy();
    expect(createBtn.closest('button')!.hasAttribute('disabled')).toBe(true);
  });

  it('shows AI mode selector with default "Claude" mode', () => {
    setupStores({ isLaunchModalOpen: true });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);
    expect(screen.getByText('Claude')).toBeTruthy();
  });

  it('shows branch selector when worktreeMode is not "never"', () => {
    setupStores({ isLaunchModalOpen: true, worktreeMode: 'branch' });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);
    expect(screen.getByTestId('branch-autocomplete')).toBeTruthy();
  });

  it('hides branch selector when worktreeMode is "never"', () => {
    setupStores({ isLaunchModalOpen: true, worktreeMode: 'never' });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);
    expect(screen.queryByTestId('branch-autocomplete')).toBeNull();
  });

  it('enables create button and shows session count after selecting a preset', () => {
    setupStores({ isLaunchModalOpen: true });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);

    fireEvent.click(screen.getByTitle('4 sessions'));

    const createBtn = screen.getByText('Create 4 Sessions');
    expect(createBtn).toBeTruthy();
    expect(createBtn.closest('button')!.hasAttribute('disabled')).toBe(false);
  });

  it('calls onCreateSessions when create button is clicked after selecting a preset', () => {
    setupStores({ isLaunchModalOpen: true });
    const onCreateSessions = vi.fn();
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={onCreateSessions} />);

    fireEvent.click(screen.getByTitle('2 sessions'));
    fireEvent.click(screen.getByText('Create 2 Sessions'));

    expect(onCreateSessions).toHaveBeenCalledWith(2, 'claude', 'main');
  });

  it('closes the modal via store when Cancel is clicked', () => {
    setupStores({ isLaunchModalOpen: true });
    render(<LaunchPresetsModal projectPath="/test" onCreateSessions={vi.fn()} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(useAppUIStore.getState().isLaunchModalOpen).toBe(false);
  });
});
