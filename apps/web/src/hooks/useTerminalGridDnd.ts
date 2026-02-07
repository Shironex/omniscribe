import { useCallback, useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

interface UseTerminalGridDndReturn {
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
  dispatchRefitAll: (delays?: number[]) => void;
}

/**
 * Hook that manages drag-and-drop for the terminal grid.
 */
export function useTerminalGridDnd(
  onReorderSessions?: (activeId: string, overId: string) => void
): UseTerminalGridDndReturn {
  const [activeId, setActiveId] = useState<string | null>(null);

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
        distance: 5,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderSessions?.(String(active.id), String(over.id));
      dispatchRefitAll();
    },
    [dispatchRefitAll, onReorderSessions]
  );

  return { sensors, activeId, handleDragStart, handleDragEnd, handleDragCancel, dispatchRefitAll };
}
