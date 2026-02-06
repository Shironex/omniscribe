import { useState, useCallback, useEffect } from 'react';

const MIN_WIDTH = 180;
const MAX_WIDTH = 320;

export interface UseSidebarResizeReturn {
  isResizing: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook that manages sidebar resize via mouse drag.
 * Clamps the width between MIN_WIDTH and MAX_WIDTH based on cursor position.
 */
export function useSidebarResize(onWidthChange: (width: number) => void): UseSidebarResizeReturn {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      onWidthChange(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  return { isResizing, handleMouseDown };
}
