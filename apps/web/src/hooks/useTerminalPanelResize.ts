import { useRef, useCallback, useEffect } from 'react';

interface UseTerminalPanelResizeReturn {
  handlePanelResize: () => void;
}

/**
 * Hook that manages panel resize events and trailing refit dispatching.
 */
export function useTerminalPanelResize(
  dispatchRefitAll: (delays?: number[]) => void
): UseTerminalPanelResizeReturn {
  const trailingRefitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePanelResize = useCallback(() => {
    window.dispatchEvent(new CustomEvent('terminal-refit-all'));
    if (trailingRefitTimeoutRef.current) {
      clearTimeout(trailingRefitTimeoutRef.current);
    }
    trailingRefitTimeoutRef.current = setTimeout(() => {
      dispatchRefitAll([0, 120]);
      trailingRefitTimeoutRef.current = null;
    }, 70);
  }, [dispatchRefitAll]);

  useEffect(() => {
    return () => {
      if (trailingRefitTimeoutRef.current) {
        clearTimeout(trailingRefitTimeoutRef.current);
        trailingRefitTimeoutRef.current = null;
      }
    };
  }, []);

  return { handlePanelResize };
}
