import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OpenFile } from '@/stores/useEditorStore';
import type { ShellView } from '@/stores/useAppUIStore';

// ─── Store mocks (selector style, mutable state per test) ────────────────────
const setShellView = vi.fn();
const setActivePath = vi.fn();
const closeSettings = vi.fn();

let appUIState: { shellView: ShellView; setShellView: typeof setShellView };
let editorState: {
  files: OpenFile[];
  activePath: string | null;
  setActivePath: typeof setActivePath;
};
let settingsState: { isOpen: boolean; closeSettings: typeof closeSettings };

vi.mock('@/stores/useAppUIStore', () => ({
  useAppUIStore: (selector: (s: typeof appUIState) => unknown) => selector(appUIState),
  selectShellView: (s: { shellView: ShellView }) => s.shellView,
}));

vi.mock('@/stores/useEditorStore', () => ({
  useEditorStore: (selector: (s: typeof editorState) => unknown) => selector(editorState),
}));

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

// useShallow passes the selector through; emulate identity.
vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector: unknown) => selector,
}));

import { WorkspaceTabs } from '../WorkspaceTabs';

function file(path: string, overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    path,
    content: '',
    savedContent: '',
    dirty: false,
    loading: false,
    ...overrides,
  };
}

function renderTabs(onRequestClose = vi.fn()) {
  return render(
    <TooltipProvider>
      <WorkspaceTabs onRequestClose={onRequestClose} />
    </TooltipProvider>
  );
}

describe('WorkspaceTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appUIState = { shellView: 'terminal', setShellView };
    editorState = { files: [], activePath: null, setActivePath };
    settingsState = { isOpen: false, closeSettings };
  });

  describe('pinned Terminal tab', () => {
    it('always renders a Terminal tab', () => {
      renderTabs();
      expect(screen.getByRole('tab', { name: /terminal/i })).toBeTruthy();
    });

    it('is selected when shellView is terminal', () => {
      appUIState.shellView = 'terminal';
      renderTabs();
      expect(screen.getByRole('tab', { name: /terminal/i }).getAttribute('aria-selected')).toBe(
        'true'
      );
    });

    it('switches to the terminal view on click', () => {
      appUIState.shellView = 'editor';
      renderTabs();
      fireEvent.click(screen.getByRole('tab', { name: /terminal/i }));
      expect(setShellView).toHaveBeenCalledWith('terminal');
    });

    it('has no close affordance', () => {
      renderTabs();
      const terminalTab = screen.getByRole('tab', { name: /terminal/i });
      expect(terminalTab.querySelector('button')).toBeNull();
    });
  });

  describe('file tabs', () => {
    it('renders one tab per open file with its basename', () => {
      editorState.files = [file('/p/a.ts'), file('/p/b.tsx')];
      renderTabs();
      expect(screen.getByText('a.ts')).toBeTruthy();
      expect(screen.getByText('b.tsx')).toBeTruthy();
    });

    it('marks the active file tab as selected only while in the editor view', () => {
      editorState.files = [file('/p/a.ts')];
      editorState.activePath = '/p/a.ts';
      appUIState.shellView = 'editor';
      renderTabs();
      expect(screen.getByRole('tab', { name: /a\.ts/i }).getAttribute('aria-selected')).toBe(
        'true'
      );
    });

    it('file tab is not selected when the terminal view is active', () => {
      editorState.files = [file('/p/a.ts')];
      editorState.activePath = '/p/a.ts';
      appUIState.shellView = 'terminal';
      renderTabs();
      expect(screen.getByRole('tab', { name: /a\.ts/i }).getAttribute('aria-selected')).toBe(
        'false'
      );
    });

    it('clicking a file tab focuses it and switches to the editor view', () => {
      editorState.files = [file('/p/a.ts')];
      renderTabs();
      fireEvent.click(screen.getByRole('tab', { name: /a\.ts/i }));
      expect(setActivePath).toHaveBeenCalledWith('/p/a.ts');
      expect(setShellView).toHaveBeenCalledWith('editor');
    });

    it('shows the dirty dot for a dirty file', () => {
      editorState.files = [file('/p/a.ts', { dirty: true })];
      renderTabs();
      expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
    });

    it('does not show a dirty dot for a clean file', () => {
      editorState.files = [file('/p/a.ts', { dirty: false })];
      renderTabs();
      expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
    });

    it('routes the close button through onRequestClose', () => {
      const onRequestClose = vi.fn();
      editorState.files = [file('/p/a.ts')];
      renderTabs(onRequestClose);
      fireEvent.click(screen.getByRole('button', { name: /close a\.ts/i }));
      expect(onRequestClose).toHaveBeenCalledWith('/p/a.ts');
    });

    it('shows a read-only lock for read-only files', () => {
      editorState.files = [file('/p/a.ts', { readOnly: true })];
      renderTabs();
      expect(screen.getByLabelText('Read-only')).toBeTruthy();
    });
  });

  describe('settings tab', () => {
    it('is hidden when settings is closed', () => {
      settingsState.isOpen = false;
      renderTabs();
      expect(screen.queryByRole('tab', { name: /settings/i })).toBeNull();
    });

    it('is shown when settings is open', () => {
      settingsState.isOpen = true;
      renderTabs();
      expect(screen.getByRole('tab', { name: /settings/i })).toBeTruthy();
    });

    it('is selected when shellView is settings', () => {
      settingsState.isOpen = true;
      appUIState.shellView = 'settings';
      renderTabs();
      expect(screen.getByRole('tab', { name: /settings/i }).getAttribute('aria-selected')).toBe(
        'true'
      );
    });

    it('its close button calls closeSettings', () => {
      settingsState.isOpen = true;
      renderTabs();
      fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
      expect(closeSettings).toHaveBeenCalled();
    });

    it('clicking the settings tab switches to the settings view', () => {
      settingsState.isOpen = true;
      appUIState.shellView = 'editor';
      renderTabs();
      fireEvent.click(screen.getByRole('tab', { name: /settings/i }));
      expect(setShellView).toHaveBeenCalledWith('settings');
    });
  });
});
