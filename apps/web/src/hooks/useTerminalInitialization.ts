import { useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { writeToTerminal, resizeTerminal } from '@/lib/terminal';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { FilePathLinkProvider } from '@/lib/terminal-link-provider';
import { safeFit } from './useTerminalResize';
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

  useEffect(() => {
    if (!terminalRef.current) return;

    isDisposedRef.current = false;
    isReadyRef.current = false;

    const container = terminalRef.current;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let searchAddon: SearchAddon | null = null;
    let isInitialized = false;
    let initRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    const deferredFitTimeouts: ReturnType<typeof setTimeout>[] = [];

    const theme = getTerminalTheme(settings.terminalThemeName);

    const initializeTerminal = () => {
      if (isInitialized || isDisposedRef.current || !container) return;

      const { offsetWidth, offsetHeight } = container;
      if (offsetWidth === 0 || offsetHeight === 0) return;

      isInitialized = true;

      terminal = new Terminal({
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily.join(', '),
        fontWeight: settings.fontWeight,
        lineHeight: settings.lineHeight,
        letterSpacing: settings.letterSpacing,
        cursorBlink: settings.cursorBlink,
        cursorStyle: settings.cursorStyle,
        scrollback: settings.scrollback,
        theme,
        allowProposedApi: true,
      });

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      searchAddon = new SearchAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.loadAddon(searchAddon);

      logger.info('Terminal opened for session', sessionId);
      terminal.open(container);

      // Try WebGL rendering with canvas fallback
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        terminal.loadAddon(webglAddon);
        logger.debug('WebGL addon loaded successfully');
      } catch {
        logger.debug('WebGL addon failed, using canvas fallback');
      }

      // Register file path link provider
      terminal.registerLinkProvider(new FilePathLinkProvider(terminal));

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // Attach keyboard handler
      attachKeyboardHandler(terminal);

      // Delayed initial fit
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

    // Listen for refit-all events (from panel resizes, DnD)
    const handleRefitAll = () => {
      if (!isDisposedRef.current && isReadyRef.current) {
        handleResize();
      }
    };
    window.addEventListener('terminal-refit-all', handleRefitAll);

    return () => {
      logger.debug('Cleaning up terminal for session', sessionId);
      isDisposedRef.current = true;
      isReadyRef.current = false;

      window.removeEventListener('terminal-refit-all', handleRefitAll);

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
