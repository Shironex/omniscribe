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

  it('calls handleResize when ready, active, and not disposed', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: true };
    const isActiveRef = { current: true };

    renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize)
    );

    dispatchRefitEvent();
    expect(handleResize).toHaveBeenCalledTimes(1);
  });

  it('does not call handleResize when disposed', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: true };
    const isReadyRef = { current: true };
    const isActiveRef = { current: true };

    renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize)
    );

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('does not call handleResize when not ready', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: false };
    const isActiveRef = { current: true };

    renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize)
    );

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('does not call handleResize when not active (hidden terminal)', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: true };
    const isActiveRef = { current: false };

    renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize)
    );

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('does not call handleResize when both disposed and not ready', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: true };
    const isReadyRef = { current: false };
    const isActiveRef = { current: true };

    renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize)
    );

    dispatchRefitEvent();
    expect(handleResize).not.toHaveBeenCalled();
  });

  it('removes event listener on unmount', () => {
    const handleResize = vi.fn();
    const isDisposedRef = { current: false };
    const isReadyRef = { current: true };
    const isActiveRef = { current: true };

    const { unmount } = renderHook(() =>
      useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize)
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
    const isActiveRef = { current: true };

    const { rerender } = renderHook(
      ({ handleResize }) =>
        useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize),
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
