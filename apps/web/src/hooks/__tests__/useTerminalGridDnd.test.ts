import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@dnd-kit/core', () => ({
  PointerSensor: 'PointerSensor',
  useSensor: vi.fn((sensor, options) => ({ sensor, options })),
  useSensors: vi.fn((...sensors) => sensors),
}));

import { useTerminalGridDnd } from '../useTerminalGridDnd';

describe('useTerminalGridDnd', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with activeId as null', () => {
    const { result } = renderHook(() => useTerminalGridDnd());
    expect(result.current.activeId).toBeNull();
  });

  describe('handleDragStart', () => {
    it('sets activeId from event.active.id', () => {
      const { result } = renderHook(() => useTerminalGridDnd());

      act(() => {
        result.current.handleDragStart({ active: { id: 'session-1' } } as never);
      });

      expect(result.current.activeId).toBe('session-1');
    });

    it('converts numeric id to string', () => {
      const { result } = renderHook(() => useTerminalGridDnd());

      act(() => {
        result.current.handleDragStart({ active: { id: 42 } } as never);
      });

      expect(result.current.activeId).toBe('42');
    });
  });

  describe('handleDragCancel', () => {
    it('clears activeId to null', () => {
      const { result } = renderHook(() => useTerminalGridDnd());

      act(() => {
        result.current.handleDragStart({ active: { id: 'session-1' } } as never);
      });
      expect(result.current.activeId).toBe('session-1');

      act(() => {
        result.current.handleDragCancel();
      });
      expect(result.current.activeId).toBeNull();
    });
  });

  describe('handleDragEnd', () => {
    it('clears activeId on drag end', () => {
      const { result } = renderHook(() => useTerminalGridDnd());

      act(() => {
        result.current.handleDragStart({ active: { id: 'session-1' } } as never);
      });

      act(() => {
        result.current.handleDragEnd({ active: { id: 'session-1' }, over: null } as never);
      });

      expect(result.current.activeId).toBeNull();
    });

    it('does not call onReorderSessions when over is null', () => {
      const onReorder = vi.fn();
      const { result } = renderHook(() => useTerminalGridDnd(onReorder));

      act(() => {
        result.current.handleDragEnd({ active: { id: 'a' }, over: null } as never);
      });

      expect(onReorder).not.toHaveBeenCalled();
    });

    it('does not call onReorderSessions when active.id === over.id', () => {
      const onReorder = vi.fn();
      const { result } = renderHook(() => useTerminalGridDnd(onReorder));

      act(() => {
        result.current.handleDragEnd({
          active: { id: 'a' },
          over: { id: 'a' },
        } as never);
      });

      expect(onReorder).not.toHaveBeenCalled();
    });

    it('calls onReorderSessions with activeId and overId on valid drop', () => {
      const onReorder = vi.fn();
      const { result } = renderHook(() => useTerminalGridDnd(onReorder));

      act(() => {
        result.current.handleDragEnd({
          active: { id: 'session-1' },
          over: { id: 'session-2' },
        } as never);
      });

      expect(onReorder).toHaveBeenCalledWith('session-1', 'session-2');
    });

    it('dispatches refit events after valid drop', () => {
      const listener = vi.fn();
      window.addEventListener('terminal-refit-all', listener);

      const { result } = renderHook(() => useTerminalGridDnd(vi.fn()));

      act(() => {
        result.current.handleDragEnd({
          active: { id: 'a' },
          over: { id: 'b' },
        } as never);
      });

      // Default delays: [0, 80, 180]
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(listener).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(80);
      });
      expect(listener).toHaveBeenCalledTimes(2);

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(listener).toHaveBeenCalledTimes(3);

      window.removeEventListener('terminal-refit-all', listener);
    });
  });

  describe('dispatchRefitAll', () => {
    it('dispatches events with default delays [0, 80, 180]', () => {
      const listener = vi.fn();
      window.addEventListener('terminal-refit-all', listener);

      const { result } = renderHook(() => useTerminalGridDnd());

      act(() => {
        result.current.dispatchRefitAll();
      });

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(listener).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(80);
      });
      expect(listener).toHaveBeenCalledTimes(2);

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(listener).toHaveBeenCalledTimes(3);

      window.removeEventListener('terminal-refit-all', listener);
    });

    it('dispatches events with custom delays', () => {
      const listener = vi.fn();
      window.addEventListener('terminal-refit-all', listener);

      const { result } = renderHook(() => useTerminalGridDnd());

      act(() => {
        result.current.dispatchRefitAll([0, 50]);
      });

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(listener).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(listener).toHaveBeenCalledTimes(2);

      window.removeEventListener('terminal-refit-all', listener);
    });
  });

  describe('sensors', () => {
    it('configures PointerSensor with distance 5', async () => {
      const { useSensor } = vi.mocked(await import('@dnd-kit/core'));

      renderHook(() => useTerminalGridDnd());

      expect(useSensor).toHaveBeenCalledWith('PointerSensor', {
        activationConstraint: { distance: 5 },
      });
    });
  });
});
