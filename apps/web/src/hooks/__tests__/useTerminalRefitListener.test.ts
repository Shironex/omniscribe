import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTerminalRefitListener } from '../useTerminalRefitListener';

function dispatchRefitEvent() {
  window.dispatchEvent(new CustomEvent('terminal-refit-all'));
}

describe('useTerminalRefitListener', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls handleResize when ready and not disposed', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: true };

    renderHook(() => useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize));

    dispatchRefitEvent();
    expect(handleResize).toHaveBeenCalledTimes(1);
  });

  it('does not call handleResize when disposed', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: true };
    const isReadyRef = { current: true };

    renderHook(() => useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize));

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('does not call handleResize when not ready', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: false };

    renderHook(() => useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize));

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('does not call handleResize when both disposed and not ready', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: true };
    const isReadyRef = { current: false };

    renderHook(() => useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize));

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('removes event listener on unmount', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: true };

    const { unmount } = renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize)
    );

    unmount();
    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('re-registers listener when handleResize changes', () => {
    const handleResize1 = vi.fn();
    const handleResize2 = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: true };

    const { rerender } = renderHook(
      ({ handleResize }) => useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize),
      { initialProps: { handleResize: handleResize1 } }
    );

    dispatchRefitEvent();
    expect(handleResize1).toHaveBeenCalledTimes(1);

    rerender({ handleResize: handleResize2 });

    dispatchRefitEvent();
    expect(handleResize2).toHaveBeenCalledTimes(1);
    // Old handler should not have been called again
    expect(handleResize1).toHaveBeenCalledTimes(1);
  });
});
