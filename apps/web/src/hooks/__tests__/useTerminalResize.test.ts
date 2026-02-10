import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

const mockResizeTerminal = vi.fn();
vi.mock('@/lib/terminal', () => ({
  resizeTerminal: (...args: unknown[]) => mockResizeTerminal(...args),
}));

import { safeFit, useTerminalResize } from '../useTerminalResize';

// --- Mock factories ---

function createMockFitAddon(overrides: Partial<FitAddon> = {}): FitAddon {
  return {
    fit: vi.fn(),
    proposeDimensions: vi.fn(),
    activate: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as FitAddon;
}

function createMockTerminal(cols = 80, rows = 24): Terminal {
  return { cols, rows } as unknown as Terminal;
}

function createMockContainer(width = 800, height = 600): HTMLDivElement {
  return {
    offsetWidth: width,
    offsetHeight: height,
  } as unknown as HTMLDivElement;
}

function createRefs(overrides: Record<string, unknown> = {}) {
  return {
    terminalRef: { current: createMockContainer() },
    xtermRef: { current: createMockTerminal() },
    fitAddonRef: { current: createMockFitAddon() },
    sessionIdRef: { current: 42 },
    isDisposedRef: { current: false },
    isReadyRef: { current: true },
    ...overrides,
  };
}

// --- Tests ---

describe('safeFit', () => {
  it('returns null when fitAddon is null', () => {
    const terminal = createMockTerminal();
    const container = createMockContainer();

    expect(safeFit(null, terminal, container)).toBeNull();
  });

  it('returns null when terminal is null', () => {
    const fitAddon = createMockFitAddon();
    const container = createMockContainer();

    expect(safeFit(fitAddon, null, container)).toBeNull();
  });

  it('returns null when container is null', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal();

    expect(safeFit(fitAddon, terminal, null)).toBeNull();
  });

  it('returns null when container has zero width', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal();
    const container = createMockContainer(0, 600);

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when container has zero height', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal();
    const container = createMockContainer(800, 0);

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when container has negative width', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal();
    const container = createMockContainer(-1, 600);

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when container has negative height', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal();
    const container = createMockContainer(800, -1);

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns dimensions when all arguments are valid', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal(120, 40);
    const container = createMockContainer(1024, 768);

    const result = safeFit(fitAddon, terminal, container);

    expect(fitAddon.fit).toHaveBeenCalledOnce();
    expect(result).toEqual({ cols: 120, rows: 40 });
  });

  it('returns null when terminal cols are zero after fit', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal(0, 24);
    const container = createMockContainer();

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when terminal rows are zero after fit', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal(80, 0);
    const container = createMockContainer();

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when both terminal cols and rows are zero after fit', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal(0, 0);
    const container = createMockContainer();

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when terminal cols are negative after fit', () => {
    const fitAddon = createMockFitAddon();
    const terminal = createMockTerminal(-1, 24);
    const container = createMockContainer();

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });

  it('returns null when fitAddon.fit() throws', () => {
    const fitAddon = createMockFitAddon({
      fit: vi.fn().mockImplementation(() => {
        throw new Error('fit failed');
      }),
    });
    const terminal = createMockTerminal();
    const container = createMockContainer();

    expect(safeFit(fitAddon, terminal, container)).toBeNull();
  });
});

describe('useTerminalResize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockResizeTerminal.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call resizeTerminal when disposed', () => {
    const refs = createRefs({ isDisposedRef: { current: true } });

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });

  it('does not call resizeTerminal when not ready', () => {
    const refs = createRefs({ isReadyRef: { current: false } });

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });

  it('does not call resizeTerminal when disposed becomes true during debounce', () => {
    const refs = createRefs();

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    // Set disposed before the debounce fires
    refs.isDisposedRef.current = true;

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });

  it('does not call resizeTerminal when ready becomes false during debounce', () => {
    const refs = createRefs();

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    // Set not ready before the debounce fires
    refs.isReadyRef.current = false;

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });

  it('debounces resize calls so only the last one fires', () => {
    const refs = createRefs();

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    // Call handleResize multiple times in quick succession
    act(() => {
      result.current.handleResize();
      result.current.handleResize();
      result.current.handleResize();
      result.current.handleResize();
      result.current.handleResize();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Only one resizeTerminal call despite five handleResize calls
    expect(mockResizeTerminal).toHaveBeenCalledOnce();
  });

  it('calls resizeTerminal after debounce with correct dimensions', () => {
    const terminal = createMockTerminal(120, 40);
    const refs = createRefs({
      xtermRef: { current: terminal },
      sessionIdRef: { current: 7 },
    });

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).toHaveBeenCalledWith(7, 120, 40);
  });

  it('does not call resizeTerminal before debounce period elapses', () => {
    const refs = createRefs();

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockResizeTerminal).toHaveBeenCalledOnce();
  });

  it('resets debounce timer on each call', () => {
    const refs = createRefs();

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    // Advance 80ms (not enough to trigger)
    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();

    // Call again, which resets the timer
    act(() => {
      result.current.handleResize();
    });

    // Advance another 80ms (160ms total from first call, 80ms from second)
    act(() => {
      vi.advanceTimersByTime(80);
    });

    // Still not called because the timer was reset
    expect(mockResizeTerminal).not.toHaveBeenCalled();

    // Advance the remaining 20ms
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(mockResizeTerminal).toHaveBeenCalledOnce();
  });

  it('clears resizeDebounceRef after debounce fires', () => {
    const refs = createRefs();

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    // Before debounce fires, ref should be set
    expect(result.current.resizeDebounceRef.current).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // After debounce fires, ref should be cleared
    expect(result.current.resizeDebounceRef.current).toBeNull();
  });

  it('does not call resizeTerminal when safeFit returns null', () => {
    const refs = createRefs({
      // Container with zero dimensions causes safeFit to return null
      terminalRef: { current: createMockContainer(0, 0) },
    });

    const { result } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      result.current.handleResize();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });

  it('registers window resize event listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const refs = createRefs();

    renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    addSpy.mockRestore();
  });

  it('cleans up window resize event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const refs = createRefs();

    const { unmount } = renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    removeSpy.mockRestore();
  });

  it('responds to window resize events', () => {
    const refs = createRefs();

    renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).toHaveBeenCalledOnce();
  });

  it('ignores window resize events when disposed', () => {
    const refs = createRefs({ isDisposedRef: { current: true } });

    renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });

  it('ignores window resize events when not ready', () => {
    const refs = createRefs({ isReadyRef: { current: false } });

    renderHook(() =>
      useTerminalResize(
        refs.terminalRef,
        refs.xtermRef,
        refs.fitAddonRef,
        refs.sessionIdRef,
        refs.isDisposedRef,
        refs.isReadyRef
      )
    );

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockResizeTerminal).not.toHaveBeenCalled();
  });
});
