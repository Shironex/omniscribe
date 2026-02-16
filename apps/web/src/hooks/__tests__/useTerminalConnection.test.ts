import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockConnectionCleanup = vi.fn();
const mockConnectTerminal = vi.fn().mockReturnValue({ cleanup: mockConnectionCleanup });
const mockJoinTerminal = vi.fn().mockResolvedValue({ success: true, scrollback: '' });

vi.mock('@/lib/terminal', () => ({
  connectTerminal: (...args: unknown[]) => mockConnectTerminal(...args),
  joinTerminal: (...args: unknown[]) => mockJoinTerminal(...args),
}));

// Mock RAF/CAF
let rafCallbacks: Array<() => void> = [];
let rafId = 0;

vi.stubGlobal(
  'requestAnimationFrame',
  vi.fn((cb: () => void) => {
    rafCallbacks.push(cb);
    return ++rafId;
  })
);

vi.stubGlobal(
  'cancelAnimationFrame',
  vi.fn((_id: number) => {
    // Simple: just clear the callbacks array
  })
);

function flushRAF() {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach(cb => cb());
}

import { useTerminalConnection } from '../useTerminalConnection';

// --- Ref factory ---

function createRefs() {
  const mockWrite = vi.fn();
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    xtermRef: { current: { write: mockWrite } as any },
    isDisposedRef: { current: false },
    onCloseRef: { current: vi.fn() },
    isActiveRef: { current: true },
    mockWrite,
  };
}

// --- Tests ---

describe('useTerminalConnection', () => {
  beforeEach(() => {
    mockConnectTerminal.mockClear();
    mockConnectTerminal.mockReturnValue({ cleanup: mockConnectionCleanup });
    mockConnectionCleanup.mockClear();
    mockJoinTerminal.mockClear();
    mockJoinTerminal.mockResolvedValue({ success: true, scrollback: '' });
    rafCallbacks = [];
    rafId = 0;
    (requestAnimationFrame as ReturnType<typeof vi.fn>).mockClear();
    (cancelAnimationFrame as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    rafCallbacks = [];
  });

  // --- initial state ---

  describe('initial state', () => {
    it('returns status as "connecting"', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      expect(result.current.status).toBe('connecting');
    });

    it('returns connectionRef as null', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      expect(result.current.connectionRef.current).toBeNull();
    });
  });

  // --- handleOutput / RAF buffering ---

  describe('handleOutput / RAF buffering', () => {
    it('buffers data and schedules a requestAnimationFrame', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('hello');
      });

      // RAF should have been requested
      expect(requestAnimationFrame).toHaveBeenCalledOnce();
      // But write should NOT have been called yet (buffered)
      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('flushes buffer on RAF tick and writes to terminal', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('hello');
      });

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).toHaveBeenCalledOnce();
      expect(refs.mockWrite).toHaveBeenCalledWith('hello');
    });

    it('coalesces multiple outputs into a single write on flush', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('hello');
        result.current.handleOutput(' ');
        result.current.handleOutput('world');
      });

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).toHaveBeenCalledOnce();
      expect(refs.mockWrite).toHaveBeenCalledWith('hello world');
    });

    it('does not schedule a second RAF if one is already pending', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('a');
        result.current.handleOutput('b');
        result.current.handleOutput('c');
      });

      expect(requestAnimationFrame).toHaveBeenCalledOnce();
    });

    it('schedules a new RAF after flushing the previous one', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('first');
      });

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).toHaveBeenCalledWith('first');

      act(() => {
        result.current.handleOutput('second');
      });

      expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).toHaveBeenCalledTimes(2);
      expect(refs.mockWrite).toHaveBeenLastCalledWith('second');
    });

    it('ignores output when disposed', () => {
      const refs = createRefs();
      refs.isDisposedRef.current = true;

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('should be ignored');
      });

      expect(requestAnimationFrame).not.toHaveBeenCalled();
      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does not write when disposed at flush time', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('data');
      });

      // Dispose before flush
      refs.isDisposedRef.current = true;

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does not write when xtermRef is null at flush time', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('data');
      });

      refs.xtermRef.current = null;

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('handles write throwing gracefully', () => {
      const refs = createRefs();
      refs.mockWrite.mockImplementation(() => {
        throw new Error('terminal disposed');
      });

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('data');
      });

      // Should not throw
      expect(() => {
        act(() => {
          flushRAF();
        });
      }).not.toThrow();
    });
  });

  // --- handleClose ---

  describe('handleClose', () => {
    it('sets status to "disconnected"', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleClose(0);
      });

      expect(result.current.status).toBe('disconnected');
    });

    it('calls onCloseRef callback with exitCode and signal', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleClose(1, 15);
      });

      expect(refs.onCloseRef.current).toHaveBeenCalledOnce();
      expect(refs.onCloseRef.current).toHaveBeenCalledWith(1, 15);
    });

    it('calls onCloseRef callback with only exitCode when signal is omitted', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleClose(0);
      });

      expect(refs.onCloseRef.current).toHaveBeenCalledOnce();
      expect(refs.onCloseRef.current).toHaveBeenCalledWith(0, undefined);
    });

    it('does nothing when disposed', () => {
      const refs = createRefs();
      refs.isDisposedRef.current = true;

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      // Status should still be 'connecting' (initial)
      act(() => {
        result.current.handleClose(1, 9);
      });

      expect(result.current.status).toBe('connecting');
      expect(refs.onCloseRef.current).not.toHaveBeenCalled();
    });

    it('handles missing onCloseRef callback gracefully', () => {
      const refs = createRefs();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      refs.onCloseRef.current = undefined as any;

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      expect(() => {
        act(() => {
          result.current.handleClose(0);
        });
      }).not.toThrow();

      expect(result.current.status).toBe('disconnected');
    });
  });

  // --- connectAndJoin ---

  describe('connectAndJoin', () => {
    it('calls connectTerminal with sessionId, handleOutput, and handleClose', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.connectAndJoin(42);
      });

      expect(mockConnectTerminal).toHaveBeenCalledOnce();
      expect(mockConnectTerminal).toHaveBeenCalledWith(
        42,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('sets status to "connected"', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.connectAndJoin(42);
      });

      expect(result.current.status).toBe('connected');
    });

    it('stores the connection in connectionRef', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.connectAndJoin(42);
      });

      expect(result.current.connectionRef.current).toEqual({ cleanup: mockConnectionCleanup });
    });

    it('calls joinTerminal with the sessionId', async () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      await act(async () => {
        result.current.connectAndJoin(42);
        await Promise.resolve();
      });

      expect(mockJoinTerminal).toHaveBeenCalledOnce();
      expect(mockJoinTerminal).toHaveBeenCalledWith(42);
    });

    it('writes scrollback via RAF buffer when joinTerminal returns scrollback', async () => {
      mockJoinTerminal.mockResolvedValue({ success: true, scrollback: 'scrollback data' });
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      await act(async () => {
        result.current.connectAndJoin(42);
        await Promise.resolve();
      });

      // Scrollback should be buffered but not yet written
      expect(refs.mockWrite).not.toHaveBeenCalled();

      // Flush the RAF to trigger the write
      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).toHaveBeenCalledOnce();
      expect(refs.mockWrite).toHaveBeenCalledWith('scrollback data');
    });

    it('does not write scrollback when joinTerminal returns success: false', async () => {
      mockJoinTerminal.mockResolvedValue({ success: false, scrollback: 'should not write' });
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      await act(async () => {
        result.current.connectAndJoin(42);
        await Promise.resolve();
      });

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does not write scrollback when scrollback is empty', async () => {
      mockJoinTerminal.mockResolvedValue({ success: true, scrollback: '' });
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      await act(async () => {
        result.current.connectAndJoin(42);
        await Promise.resolve();
      });

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does not write scrollback when disposed before joinTerminal resolves', async () => {
      mockJoinTerminal.mockResolvedValue({ success: true, scrollback: 'data' });
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.connectAndJoin(42);
      });

      // Dispose before the promise resolves
      refs.isDisposedRef.current = true;

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        flushRAF();
      });

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does nothing when disposed', () => {
      const refs = createRefs();
      refs.isDisposedRef.current = true;

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.connectAndJoin(42);
      });

      expect(mockConnectTerminal).not.toHaveBeenCalled();
      expect(mockJoinTerminal).not.toHaveBeenCalled();
      expect(result.current.connectionRef.current).toBeNull();
      expect(result.current.status).toBe('connecting');
    });

    it('does nothing when already connected (connectionRef is non-null)', async () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      // First call sets up the connection
      await act(async () => {
        result.current.connectAndJoin(42);
        await Promise.resolve();
      });

      mockConnectTerminal.mockClear();
      mockJoinTerminal.mockClear();

      // Second call should be a no-op
      await act(async () => {
        result.current.connectAndJoin(99);
        await Promise.resolve();
      });

      expect(mockConnectTerminal).not.toHaveBeenCalled();
      expect(mockJoinTerminal).not.toHaveBeenCalled();
    });

    it('handles joinTerminal rejection gracefully', async () => {
      mockJoinTerminal.mockRejectedValue(new Error('join failed'));
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      // Should not throw
      await act(async () => {
        result.current.connectAndJoin(42);
        await Promise.resolve();
      });

      // Connection should still be established
      expect(mockConnectTerminal).toHaveBeenCalledOnce();
      expect(result.current.status).toBe('connected');
      expect(refs.mockWrite).not.toHaveBeenCalled();
    });
  });

  // --- cleanup on unmount ---

  describe('cleanup on unmount', () => {
    it('cancels pending RAF on unmount', () => {
      const refs = createRefs();

      const { result, unmount } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('pending data');
      });

      expect(requestAnimationFrame).toHaveBeenCalledOnce();

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('flushes remaining buffer synchronously on unmount', () => {
      const refs = createRefs();

      const { result, unmount } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('unflushed data');
      });

      // Data is buffered but not written yet
      expect(refs.mockWrite).not.toHaveBeenCalled();

      unmount();

      // On unmount, remaining buffer should be written synchronously
      expect(refs.mockWrite).toHaveBeenCalledOnce();
      expect(refs.mockWrite).toHaveBeenCalledWith('unflushed data');
    });

    it('does not flush buffer on unmount when disposed', () => {
      const refs = createRefs();

      const { result, unmount } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('data');
      });

      refs.isDisposedRef.current = true;

      unmount();

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does not flush buffer on unmount when xtermRef is null', () => {
      const refs = createRefs();

      const { result, unmount } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('data');
      });

      refs.xtermRef.current = null;

      unmount();

      expect(refs.mockWrite).not.toHaveBeenCalled();
    });

    it('does not attempt to flush when buffer is empty', () => {
      const refs = createRefs();

      const { unmount } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      unmount();

      expect(refs.mockWrite).not.toHaveBeenCalled();
      expect(cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it('handles write throwing during unmount flush gracefully', () => {
      const refs = createRefs();
      refs.mockWrite.mockImplementation(() => {
        throw new Error('already disposed');
      });

      const { result, unmount } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.handleOutput('data');
      });

      // Should not throw during unmount
      expect(() => unmount()).not.toThrow();
    });
  });

  // --- setStatus ---

  describe('setStatus', () => {
    it('allows external status updates', () => {
      const refs = createRefs();

      const { result } = renderHook(() =>
        useTerminalConnection(refs.xtermRef, refs.isDisposedRef, refs.onCloseRef, refs.isActiveRef)
      );

      act(() => {
        result.current.setStatus('error');
      });

      expect(result.current.status).toBe('error');
    });
  });
});
