import { useCallback } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';

interface UseTerminalGridDndReturn {
  sensors: ReturnType<typeof useSensors>;
  handleDragEnd: (event: DragEndEvent) => void;
  dispatchRefitAll: (delays?: number[]) => void;
}

/**
 * Hook that manages drag-and-drop for the terminal grid.
 */
export function useTerminalGridDnd(
  onReorderSessions?: (activeId: string, overId: string) => void
): UseTerminalGridDndReturn {
  const dispatchRefitAll = useCallback((delays: number[] = [0, 80, 180]) => {
    for (const delay of delays) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      }, delay);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderSessions?.(String(active.id), String(over.id));
      dispatchRefitAll();
    },
    [dispatchRefitAll, onReorderSessions]
  );

  return { sensors, handleDragEnd, dispatchRefitAll };
}
