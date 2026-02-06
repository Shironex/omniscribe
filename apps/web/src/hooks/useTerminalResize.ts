import { useRef, useCallback, useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { resizeTerminal } from '@/lib/terminal';

const logger = createLogger('TerminalResize');

const RESIZE_DEBOUNCE_MS = 100;

/** Safely call fitAddon.fit() and return the resulting dimensions. */
export function safeFit(
  fitAddon: FitAddon | null,
  terminal: Terminal | null,
  container: HTMLDivElement | null
): { cols: number; rows: number } | null {
  if (!fitAddon || !terminal || !container) return null;

  const { offsetWidth, offsetHeight } = container;
  if (offsetWidth <= 0 || offsetHeight <= 0) return null;

  try {
    fitAddon.fit();
    if (terminal.cols <= 0 || terminal.rows <= 0) {
      return null;
    }
    return { cols: terminal.cols, rows: terminal.rows };
  } catch {
    logger.debug('safeFit failed (terminal in transition state)');
    return null;
  }
}

export interface UseTerminalResizeReturn {
  resizeDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  handleResize: () => void;
}

/**
 * Hook that manages terminal resize logic with debouncing and window resize listening.
 */
export function useTerminalResize(
  terminalRef: React.RefObject<HTMLDivElement | null>,
  xtermRef: React.MutableRefObject<Terminal | null>,
  fitAddonRef: React.MutableRefObject<FitAddon | null>,
  sessionIdRef: React.MutableRefObject<number>,
  isDisposedRef: React.MutableRefObject<boolean>,
  isReadyRef: React.MutableRefObject<boolean>
): UseTerminalResizeReturn {
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = useCallback(() => {
    if (isDisposedRef.current || !isReadyRef.current) return;

    if (resizeDebounceRef.current) {
      clearTimeout(resizeDebounceRef.current);
    }

    resizeDebounceRef.current = setTimeout(() => {
      resizeDebounceRef.current = null;
      if (isDisposedRef.current || !isReadyRef.current) return;

      const result = safeFit(fitAddonRef.current, xtermRef.current, terminalRef.current);
      if (result) {
        resizeTerminal(sessionIdRef.current, result.cols, result.rows);
      }
    }, RESIZE_DEBOUNCE_MS);
  }, [terminalRef, xtermRef, fitAddonRef, sessionIdRef, isDisposedRef, isReadyRef]);

  // Handle window resize
  useEffect(() => {
    const handleWindowResize = () => {
      if (!isDisposedRef.current && isReadyRef.current) {
        handleResize();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleResize, isDisposedRef, isReadyRef]);

  return { resizeDebounceRef, handleResize };
}
