import { useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useTerminalStore } from '@/stores/useTerminalStore';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import { writeToTerminal, resizeTerminal } from '@/lib/terminal';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { safeFit } from './useTerminalResize';
import { createTerminalInstance } from '@/lib/createTerminalInstance';
import { loadTerminalAddons } from '@/lib/loadTerminalAddons';
import { useTerminalRefitListener } from './useTerminalRefitListener';
import type { UseTerminalSettingsReturn } from './useTerminalSettings';

const logger = createLogger('TerminalInit');

export interface TerminalRefs {
  terminalRef: React.RefObject<HTMLDivElement | null>;
  xtermRef: React.MutableRefObject<Terminal | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
  searchAddonRef: React.MutableRefObject<SearchAddon | null>;
  resizeObserverRef: React.MutableRefObject<ResizeObserver | null>;
  connectionRef: React.MutableRefObject<{ cleanup: () => void } | null>;
  isDisposedRef: React.MutableRefObject<boolean>;
  isReadyRef: React.MutableRefObject<boolean>;
  resizeDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * Hook that initializes the terminal instance, loads addons, and manages the terminal lifecycle.
 * Uses extracted pure functions for terminal creation and addon loading.
 */
export function useTerminalInitialization(
  sessionId: number,
  settings: UseTerminalSettingsReturn,
  refs: TerminalRefs,
  handleResize: () => void,
  connectAndJoin: (sessionId: number) => void,
  attachKeyboardHandler: (terminal: Terminal) => void
): void {
  const {
    terminalRef,
    xtermRef,
    fitAddonRef,
    searchAddonRef,
    resizeObserverRef,
    connectionRef,
    isDisposedRef,
    isReadyRef,
    resizeDebounceRef,
  } = refs;

  // Listen for refit-all events (from panel resizes, DnD)
  useTerminalRefitListener(isDisposedRef, isReadyRef, handleResize);

  useEffect(() => {
    if (!terminalRef.current) return;

    isDisposedRef.current = false;
    isReadyRef.current = false;

    const container = terminalRef.current;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let isInitialized = false;
    let initRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    const deferredFitTimeouts: ReturnType<typeof setTimeout>[] = [];

    const theme = getTerminalTheme(settings.terminalThemeName);

    const initializeTerminal = () => {
      if (isInitialized || isDisposedRef.current || !container) return;

      const { offsetWidth, offsetHeight } = container;
      if (offsetWidth === 0 || offsetHeight === 0) return;

      isInitialized = true;

      terminal = createTerminalInstance(settings, theme);
      const getEditorProtocol = () => useTerminalStore.getState().editorProtocol;
      const addons = loadTerminalAddons(terminal, container, sessionId, getEditorProtocol);
      fitAddon = addons.fitAddon;

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = addons.searchAddon;

      // Attach keyboard handler
      attachKeyboardHandler(terminal);

      // Delayed initial fit with retry mechanism
      const performInitialFit = (retriesLeft: number) => {
        if (isDisposedRef.current || !terminal || !fitAddon) return;

        const result = safeFit(fitAddon, terminal, container);
        if (result) {
          isReadyRef.current = true;
          resizeTerminal(sessionId, result.cols, result.rows);
          connectAndJoin(sessionId);
        } else if (retriesLeft > 0) {
          initRetryTimeout = setTimeout(() => {
            requestAnimationFrame(() => performInitialFit(retriesLeft - 1));
          }, 50);
        } else {
          logger.warn('Fit retries exhausted, connecting anyway');
          isReadyRef.current = true;
          connectAndJoin(sessionId);

          // Continue fitting after mount settles to avoid clipped output in dense grids.
          for (const delay of [100, 250, 500, 1000]) {
            const timeout = setTimeout(() => {
              if (isDisposedRef.current || !terminal || !fitAddon) return;
              const retryResult = safeFit(fitAddon, terminal, container);
              if (retryResult) {
                resizeTerminal(sessionId, retryResult.cols, retryResult.rows);
              }
            }, delay);
            deferredFitTimeouts.push(timeout);
          }
        }
      };

      requestAnimationFrame(() => performInitialFit(20));

      // Handle user input
      terminal.onData(data => {
        if (!isDisposedRef.current) {
          writeToTerminal(sessionId, data);
        }
      });
    };

    // ResizeObserver with init detection
    resizeObserverRef.current = new ResizeObserver(() => {
      if (isDisposedRef.current) return;

      if (!isInitialized) {
        initializeTerminal();
      } else if (isReadyRef.current) {
        handleResize();
      }
    });
    resizeObserverRef.current.observe(container);

    initializeTerminal();

    return () => {
      logger.debug('Cleaning up terminal for session', sessionId);
      isDisposedRef.current = true;
      isReadyRef.current = false;

      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }

      if (initRetryTimeout) {
        clearTimeout(initRetryTimeout);
        initRetryTimeout = null;
      }
      for (const timeout of deferredFitTimeouts) {
        clearTimeout(timeout);
      }

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (connectionRef.current) {
        connectionRef.current.cleanup();
        connectionRef.current = null;
      }

      if (xtermRef.current) {
        try {
          xtermRef.current.dispose();
        } catch {
          logger.debug('Terminal dispose failed (may already be disposed)');
        }
        xtermRef.current = null;
      }

      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [sessionId]);
}
