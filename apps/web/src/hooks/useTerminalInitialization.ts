import { useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import { writeToTerminal, writeToTerminalChunked, resizeTerminal } from '@/lib/terminal';
import { PASTE_CHUNK_SIZE } from '@/lib/terminal-constants';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { safeFit } from './useTerminalResize';
import { createTerminalInstance } from '@/lib/createTerminalInstance';
import { registerTerminalForContrast } from '@/lib/background/terminalContrast';
import { loadTerminalAddons } from '@/lib/loadTerminalAddons';
import { releaseWebgl } from '@/lib/webglPool';
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
  isActiveRef: React.MutableRefObject<boolean>;
  /**
   * Effective visibility (grid active AND terminal surface on screen). Drives
   * the WebGL pool's initial visibility seed so a terminal that initializes
   * while occluded (e.g. a session launched while the editor tab is foreground)
   * does not over-claim a pool slot. Distinct from {@link isActiveRef}, which
   * tracks only whether the grid is the active project (resize/buffering).
   */
  isVisibleRef: React.MutableRefObject<boolean>;
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
    isActiveRef,
    isVisibleRef,
    resizeDebounceRef,
  } = refs;

  // Listen for refit-all events (from panel resizes, DnD)
  useTerminalRefitListener(isDisposedRef, isReadyRef, isActiveRef, handleResize);

  useEffect(() => {
    if (!terminalRef.current) return;

    isDisposedRef.current = false;
    isReadyRef.current = false;

    const container = terminalRef.current;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let unregisterContrast: (() => void) | null = null;
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
      // Track this live instance so the readability contrast bump can be
      // applied/cleared retroactively when the background-blend layer toggles.
      unregisterContrast = registerTerminalForContrast(terminal);
      // Seed the WebGL pool with EFFECTIVE visibility (grid active AND terminal
      // surface on screen), not just grid-active — an occluded terminal must not
      // claim a slot it can't be preferentially relieved of. See isVisibleRef.
      const addons = loadTerminalAddons(terminal, container, sessionId, isVisibleRef.current);
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

      // Handle user input. Large pastes (via terminal.paste()) arrive here as a
      // single onData call; chunk them so no single socket emit exceeds the
      // backend's MAX_INPUT_SIZE cap while preserving bracketed-paste marker order.
      terminal.onData(data => {
        if (!isDisposedRef.current) {
          if (data.length > PASTE_CHUNK_SIZE) {
            writeToTerminalChunked(sessionId, data);
          } else {
            writeToTerminal(sessionId, data);
          }
        }
      });
    };

    // ResizeObserver with init detection.
    // Each terminal gets its own ResizeObserver. A shared observer would reduce
    // observer count but add routing complexity. The per-terminal approach is
    // acceptable because: (1) the resize handler is already debounced in
    // useTerminalResize, and (2) the browser coalesces observations into a
    // single callback per frame, so N observers do not produce N*M callbacks.
    resizeObserverRef.current = new ResizeObserver(() => {
      if (isDisposedRef.current) return;

      if (!isInitialized) {
        initializeTerminal();
      } else if (isReadyRef.current && isActiveRef.current) {
        // Skip resize for hidden terminals — they'll refit when shown
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

      if (unregisterContrast) {
        unregisterContrast();
        unregisterContrast = null;
      }

      // Release the pooled WebGL addon (disposes it and frees its slot for a
      // waiting terminal) before disposing the xterm instance it's bound to.
      releaseWebgl(String(sessionId));

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
