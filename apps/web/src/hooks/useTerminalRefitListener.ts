import { useEffect } from 'react';

/**
 * Hook that listens for `terminal-refit-all` window events and triggers a resize.
 * These events are dispatched by panel resizes and drag-and-drop operations.
 */
export function useTerminalRefitListener(
  isDisposedRef: React.MutableRefObject<boolean>,
  isReadyRef: React.MutableRefObject<boolean>,
  handleResize: () => void
): void {
  useEffect(() => {
    const handleRefitAll = () => {
      if (!isDisposedRef.current && isReadyRef.current) {
        handleResize();
      }
    };
    window.addEventListener('terminal-refit-all', handleRefitAll);
    return () => {
      window.removeEventListener('terminal-refit-all', handleRefitAll);
    };
  }, [handleResize]); // refs are always stable, only handleResize matters
}
