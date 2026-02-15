import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalPanelResize } from '../useTerminalPanelResize';

describe('useTerminalPanelResize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches terminal-refit-all event immediately on handlePanelResize', () => {
    const dispatchRefitAll = vi.fn();
    const listener = vi.fn();
    window.addEventListener('terminal-refit-all', listener);

    const { result } = renderHook(() => useTerminalPanelResize(dispatchRefitAll));

    act(() => {
      result.current.handlePanelResize();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('terminal-refit-all', listener);
  });

  it('calls dispatchRefitAll with [0, 120] after 70ms trailing delay', () => {
    const dispatchRefitAll = vi.fn();
    const { result } = renderHook(() => useTerminalPanelResize(dispatchRefitAll));

    act(() => {
      result.current.handlePanelResize();
    });

    expect(dispatchRefitAll).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(70);
    });

    expect(dispatchRefitAll).toHaveBeenCalledWith([0, 120]);
  });

  it('debounces rapid calls — only last trailing fires', () => {
    const dispatchRefitAll = vi.fn();
    const { result } = renderHook(() => useTerminalPanelResize(dispatchRefitAll));

    act(() => {
      result.current.handlePanelResize();
    });

    act(() => {
      vi.advanceTimersByTime(30);
    });

    act(() => {
      result.current.handlePanelResize();
    });

    act(() => {
      vi.advanceTimersByTime(70);
    });

    // Only one trailing call despite two handlePanelResize calls
    expect(dispatchRefitAll).toHaveBeenCalledTimes(1);
  });

  it('clears trailing timeout on unmount', () => {
    const dispatchRefitAll = vi.fn();
    const { result, unmount } = renderHook(() => useTerminalPanelResize(dispatchRefitAll));

    act(() => {
      result.current.handlePanelResize();
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(dispatchRefitAll).not.toHaveBeenCalled();
  });
});
