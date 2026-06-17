import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ScmPanelSnapshotResponse } from '@omniscribe/shared';

// sonner is mocked globally in src/test/setup.ts.

// ─── Mock the SCM store ──────────────────────────────────────────────────────
const stage = vi.fn(async () => true);
const unstage = vi.fn(async () => true);
const discard = vi.fn(async () => true);
const commit = vi.fn(async () => true);
const refresh = vi.fn(async () => undefined);
const fetchRemote = vi.fn(async () => true);
const pull = vi.fn(async () => true);
const push = vi.fn(async () => true);

let mockState: Record<string, unknown>;

vi.mock('@/stores/useScmStore', () => {
  const useScmStore = (selector: (s: Record<string, unknown>) => unknown) => selector(mockState);
  return {
    useScmStore,
    selectChangedCount: (s: { snapshot: ScmPanelSnapshotResponse | null }) => {
      const snap = s.snapshot;
      if (!snap) return 0;
      return (
        snap.staged.length + snap.unstaged.length + snap.untracked.length + snap.conflicted.length
      );
    },
  };
});

import { ScmPanel } from '../ScmPanel';

function snapshot(overrides: Partial<ScmPanelSnapshotResponse> = {}): ScmPanelSnapshotResponse {
  return {
    isRepo: true,
    rootPath: '/repo',
    branch: 'main',
    upstream: 'origin/main',
    ahead: 1,
    behind: 2,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isMerging: false,
    isRebasing: false,
    ...overrides,
  };
}

function buildState(snap: ScmPanelSnapshotResponse | null) {
  return {
    snapshot: snap,
    isLoading: false,
    pending: { fetch: false, pull: false, push: false, commit: false, paths: new Set<string>() },
    error: null,
    refresh,
    stage,
    unstage,
    discard,
    commit,
    fetchRemote,
    pull,
    push,
  };
}

function renderPanel(props: { onSelectFile?: (path: string, staged: boolean) => void } = {}) {
  return render(
    <TooltipProvider>
      <ScmPanel onSelectFile={props.onSelectFile ?? vi.fn()} />
    </TooltipProvider>
  );
}

describe('ScmPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the branch name and ahead/behind counts', () => {
    mockState = buildState(snapshot());
    renderPanel();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByTitle('1 ahead')).toBeTruthy();
    expect(screen.getByTitle('2 behind')).toBeTruthy();
  });

  it('renders the Staged / Changes / Untracked sections with files', () => {
    mockState = buildState(
      snapshot({
        staged: [{ path: 'src/staged.ts', status: 'modified' }],
        unstaged: [{ path: 'src/changed.ts', status: 'modified' }],
        untracked: [{ path: 'new.ts', status: 'untracked' }],
      })
    );
    renderPanel();

    expect(screen.getByText('Staged Changes')).toBeTruthy();
    expect(screen.getByText('Changes')).toBeTruthy();
    expect(screen.getByText('Untracked')).toBeTruthy();
    expect(screen.getByText('staged.ts')).toBeTruthy();
    expect(screen.getByText('changed.ts')).toBeTruthy();
    expect(screen.getByText('new.ts')).toBeTruthy();
  });

  it('renders a Merge Conflicts section only when conflicts exist', () => {
    mockState = buildState(snapshot({ conflicted: [{ path: 'both.ts', status: 'conflicted' }] }));
    renderPanel();
    expect(screen.getByText('Merge Conflicts')).toBeTruthy();
  });

  it('shows a clean-tree message when there are no changes', () => {
    mockState = buildState(snapshot());
    renderPanel();
    expect(screen.getByText(/working tree is clean/i)).toBeTruthy();
  });

  it('renders a not-a-repo message', () => {
    mockState = buildState(snapshot({ isRepo: false }));
    renderPanel();
    expect(screen.getByText(/not a git repository/i)).toBeTruthy();
  });

  it('opens the diff when a file row is clicked', () => {
    const onSelectFile = vi.fn();
    mockState = buildState(
      snapshot({ unstaged: [{ path: 'src/changed.ts', status: 'modified' }] })
    );
    renderPanel({ onSelectFile });

    fireEvent.click(screen.getByText('changed.ts'));
    expect(onSelectFile).toHaveBeenCalledWith('src/changed.ts', false);
  });

  it('disables Commit when nothing is staged and message is empty', () => {
    mockState = buildState(snapshot());
    renderPanel();
    const commitBtn = screen.getByRole('button', { name: /commit/i });
    expect((commitBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
