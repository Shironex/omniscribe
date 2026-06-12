import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

// ─── Mock the SCM store (selector style) ─────────────────────────────────────
let scmState: { statusByPath: Record<string, string>; changedCount: number };

vi.mock('@/stores/useScmStore', () => ({
  useScmStore: (selector: (s: unknown) => unknown) => selector(scmState),
  selectStatusByPath: (s: { statusByPath: Record<string, string> }) => s.statusByPath,
  selectChangedCount: (s: { changedCount: number }) => s.changedCount,
}));

// ─── Stub the heavy child views — we only test panel chrome here ─────────────
vi.mock('@/components/explorer', () => ({
  FileExplorer: () => <div data-testid="file-explorer" />,
}));

vi.mock('@/components/scm', () => ({
  ScmView: () => <div data-testid="scm-view" />,
}));

vi.mock('@/components/scm/scmStatus', () => ({
  statusColorClass: () => 'text-foreground',
}));

import { SidePanel } from '../SidePanel';

function renderPanel(props: Partial<React.ComponentProps<typeof SidePanel>> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  // Use a sentinel default so an explicit `null` projectPath isn't coalesced away.
  const projectPath: string | null =
    'projectPath' in props ? (props.projectPath ?? null) : '/Users/me/my-project';
  const utils = render(
    <TooltipProvider>
      <SidePanel projectPath={projectPath} open={props.open ?? true} onOpenChange={onOpenChange} />
    </TooltipProvider>
  );
  return { ...utils, onOpenChange };
}

describe('SidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scmState = { statusByPath: {}, changedCount: 0 };
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe('visibility', () => {
    it('renders nothing when no project is selected', () => {
      const { container } = renderPanel({ projectPath: null });
      expect(within(container).queryByTestId('file-explorer')).toBeNull();
      expect(within(container).queryByRole('tab', { name: /files/i })).toBeNull();
    });

    it('renders nothing when collapsed', () => {
      const { container } = renderPanel({ open: false });
      expect(within(container).queryByTestId('file-explorer')).toBeNull();
      expect(within(container).queryByRole('tab', { name: /files/i })).toBeNull();
    });

    it('renders the panel when open with a project', () => {
      renderPanel();
      expect(screen.getByTestId('file-explorer')).toBeTruthy();
    });
  });

  describe('header', () => {
    it('shows the project folder name', () => {
      renderPanel({ projectPath: '/Users/me/my-project' });
      expect(screen.getByText('my-project')).toBeTruthy();
    });

    it('collapse button calls onOpenChange(false)', () => {
      const { onOpenChange } = renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /collapse side panel/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('bottom switcher', () => {
    it('renders Files and Source Control tabs', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /files/i })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /source control/i })).toBeTruthy();
    });

    it('defaults to the Files view selected', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /files/i }).getAttribute('aria-selected')).toBe(
        'true'
      );
    });

    it('switches to Source Control on click', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('tab', { name: /source control/i }));
      expect(
        screen.getByRole('tab', { name: /source control/i }).getAttribute('aria-selected')
      ).toBe('true');
    });

    it('keeps both views mounted across tab switches', () => {
      renderPanel();
      // Files active by default — both panes exist in the DOM regardless.
      expect(screen.getByTestId('file-explorer')).toBeTruthy();
      expect(screen.getByTestId('scm-view')).toBeTruthy();

      fireEvent.click(screen.getByRole('tab', { name: /source control/i }));
      expect(screen.getByTestId('file-explorer')).toBeTruthy();
      expect(screen.getByTestId('scm-view')).toBeTruthy();
    });

    it('shows the changed-count badge on the Source Control tab', () => {
      scmState.changedCount = 5;
      renderPanel();
      const scmTab = screen.getByRole('tab', { name: /source control/i });
      expect(scmTab.textContent).toContain('5');
    });

    it('omits the badge when there are no changes', () => {
      scmState.changedCount = 0;
      renderPanel();
      const scmTab = screen.getByRole('tab', { name: /source control/i });
      // Only the "Source Control" label, no trailing count.
      expect(scmTab.textContent).toBe('Source Control');
    });

    it('caps the badge at 99+', () => {
      scmState.changedCount = 150;
      renderPanel();
      expect(screen.getByText('99+')).toBeTruthy();
    });
  });
});
