import { useEffect } from 'react';
import { useTerminalControlStore } from '@/stores/useTerminalControlStore';

interface SpatialNavOptions {
  sessionIds: string[];
  columns: number;
}

export function useSpatialNavigation({ sessionIds, columns }: SpatialNavOptions) {
  const focusedSessionId = useTerminalControlStore(state => state.focusedSessionId);
  const setFocusedSessionId = useTerminalControlStore(state => state.setFocusedSessionId);

  useEffect(() => {
    if (sessionIds.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Alt+Arrow for spatial navigation
      if (!e.ctrlKey || !e.altKey) return;

      const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!arrows.includes(e.key)) return;

      e.preventDefault();

      const currentIndex = focusedSessionId ? sessionIds.indexOf(focusedSessionId) : -1;
      if (currentIndex === -1) {
        // No focused session, focus the first one
        setFocusedSessionId(sessionIds[0]);
        return;
      }

      const cols = Math.min(columns, sessionIds.length);
      const row = Math.floor(currentIndex / cols);
      const col = currentIndex % cols;

      let nextIndex: number;
      switch (e.key) {
        case 'ArrowLeft':
          nextIndex = col > 0 ? currentIndex - 1 : currentIndex;
          break;
        case 'ArrowRight':
          nextIndex =
            col < cols - 1 && currentIndex + 1 < sessionIds.length
              ? currentIndex + 1
              : currentIndex;
          break;
        case 'ArrowUp':
          nextIndex = row > 0 ? currentIndex - cols : currentIndex;
          break;
        case 'ArrowDown':
          nextIndex = currentIndex + cols < sessionIds.length ? currentIndex + cols : currentIndex;
          break;
        default:
          return;
      }

      if (nextIndex >= 0 && nextIndex < sessionIds.length && nextIndex !== currentIndex) {
        setFocusedSessionId(sessionIds[nextIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionIds, columns, focusedSessionId, setFocusedSessionId]);
}
