import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * Visibility-gating tests for TerminalView's WebGL-pool signal.
 *
 * The session grids stay mounted when the editor/settings tab is on screen, so a
 * terminal whose project grid is `isActive` can still be fully occluded when
 * `shellView !== 'terminal'`. The pool only steals slots from HIDDEN holders, so
 * the pool's visibility signal must be gated on shellView as well as grid-active.
 *
 * These tests render the real TerminalView (the choke point) with its heavy
 * internals mocked, drive the real useAppUIStore, and assert that the pool sees
 * the correct visibility for each (isActive × shellView) combination.
 */

// --- Pool: the unit under observation -------------------------------------
const notifyVisible = vi.fn();
const notifyHidden = vi.fn();
vi.mock('@/lib/webglPool', () => ({
  notifyVisible: (...args: unknown[]) => notifyVisible(...args),
  notifyHidden: (...args: unknown[]) => notifyHidden(...args),
}));

// --- Heavy internals: mocked to no-ops so the component mounts cheaply -----
vi.mock('@/lib/terminal', () => ({ resizeTerminal: vi.fn() }));
vi.mock('@/lib/terminal-themes', () => ({
  getTerminalTheme: vi.fn(() => ({ background: '#000000' })),
}));
vi.mock('@/hooks/useTerminalSettings', () => ({
  useTerminalSettings: () => ({
    fontSize: 14,
    fontFamily: ['monospace'],
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 1000,
    terminalThemeName: 'default',
  }),
}));
vi.mock('@/hooks/useTerminalSearch', () => ({
  useTerminalSearch: () => ({
    showSearch: false,
    setShowSearch: vi.fn(),
    searchAddonRef: { current: null },
    handleSearch: vi.fn(),
    handleSearchNext: vi.fn(),
    handleSearchPrevious: vi.fn(),
    handleSearchClose: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTerminalResize', () => ({
  useTerminalResize: () => ({ resizeDebounceRef: { current: null }, handleResize: vi.fn() }),
  safeFit: vi.fn(() => null),
}));
vi.mock('@/hooks/useTerminalKeyboard', () => ({ useTerminalKeyboard: () => vi.fn() }));
vi.mock('@/hooks/useTerminalConnection', () => ({
  useTerminalConnection: () => ({
    status: 'connected',
    connectionRef: { current: null },
    connectAndJoin: vi.fn(),
    flushBuffer: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTerminalInitialization', () => ({ useTerminalInitialization: vi.fn() }));
vi.mock('../TerminalSearchBar', () => ({ TerminalSearchBar: () => null }));
vi.mock('../TerminalContextMenu', () => ({
  TerminalContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TerminalView } from '../TerminalView';
import { useAppUIStore } from '@/stores/useAppUIStore';

beforeEach(() => {
  notifyVisible.mockClear();
  notifyHidden.mockClear();
  // Reset the shared store to the default terminal surface before each case.
  act(() => {
    useAppUIStore.getState().setShellView('terminal');
  });
});

describe('TerminalView — WebGL pool visibility gating', () => {
  it('marks visible when grid is active AND shellView is terminal', () => {
    render(<TerminalView sessionId={1} isActive />);
    expect(notifyVisible).toHaveBeenCalledWith('1');
    expect(notifyHidden).not.toHaveBeenCalled();
  });

  it('marks hidden when the grid is inactive (even on the terminal surface)', () => {
    render(<TerminalView sessionId={2} isActive={false} />);
    expect(notifyHidden).toHaveBeenCalledWith('2');
    expect(notifyVisible).not.toHaveBeenCalled();
  });

  it('marks hidden when the grid is active but shellView is editor (occluded)', () => {
    act(() => {
      useAppUIStore.getState().setShellView('editor');
    });
    render(<TerminalView sessionId={3} isActive />);
    expect(notifyHidden).toHaveBeenCalledWith('3');
    expect(notifyVisible).not.toHaveBeenCalled();
  });

  it('marks hidden when the grid is active but shellView is settings (occluded)', () => {
    act(() => {
      useAppUIStore.getState().setShellView('settings');
    });
    render(<TerminalView sessionId={4} isActive />);
    expect(notifyHidden).toHaveBeenCalledWith('4');
    expect(notifyVisible).not.toHaveBeenCalled();
  });

  it('flips an active terminal hidden when the editor tab takes over, then visible on return', () => {
    render(<TerminalView sessionId={5} isActive />);
    expect(notifyVisible).toHaveBeenCalledWith('5');
    notifyVisible.mockClear();
    notifyHidden.mockClear();

    // Open the editor over the grid → the still-active terminal becomes occluded.
    act(() => {
      useAppUIStore.getState().setShellView('editor');
    });
    expect(notifyHidden).toHaveBeenCalledWith('5');
    expect(notifyVisible).not.toHaveBeenCalled();
    notifyVisible.mockClear();
    notifyHidden.mockClear();

    // Return to the terminal surface → re-marked visible (re-claims a slot).
    act(() => {
      useAppUIStore.getState().setShellView('terminal');
    });
    expect(notifyVisible).toHaveBeenCalledWith('5');
    expect(notifyHidden).not.toHaveBeenCalled();
  });
});
