import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('TerminalView');
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import {
  connectTerminal,
  writeToTerminal,
  writeToTerminalChunked,
  resizeTerminal,
} from '@/lib/terminal';
import { useTerminalSettingsStore } from '@/stores/useTerminalSettingsStore';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { FilePathLinkProvider } from '@/lib/terminal-link-provider';
import { LARGE_PASTE_WARNING_THRESHOLD } from '@/lib/terminal-constants';
import { isMacOS } from '@/lib/os-detection';
import { TerminalSearchBar, type SearchOptions } from './TerminalSearchBar';
import '@xterm/xterm/css/xterm.css';

export interface TerminalViewProps {
  sessionId: number;
  onClose?: (exitCode: number, signal?: number) => void;
  isFocused?: boolean;
  className?: string;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const RESIZE_DEBOUNCE_MS = 100;

// Helper to safely call fitAddon.fit()
const safeFit = (
  fitAddon: FitAddon | null,
  terminal: Terminal | null,
  container: HTMLDivElement | null
): { cols: number; rows: number } | null => {
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
};

export const TerminalView: React.FC<TerminalViewProps> = ({
  sessionId,
  onClose,
  isFocused = false,
  className = '',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const connectionRef = useRef<ReturnType<typeof connectTerminal> | null>(null);
  const isDisposedRef = useRef<boolean>(false);
  const isReadyRef = useRef<boolean>(false);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTermRef = useRef('');

  // Store callbacks in refs to prevent re-initialization when they change
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [showSearch, setShowSearch] = useState(false);

  // Terminal settings from store
  const fontSize = useTerminalSettingsStore(s => s.fontSize);
  const fontFamily = useTerminalSettingsStore(s => s.fontFamily);
  const fontWeight = useTerminalSettingsStore(s => s.fontWeight);
  const lineHeight = useTerminalSettingsStore(s => s.lineHeight);
  const letterSpacing = useTerminalSettingsStore(s => s.letterSpacing);
  const cursorStyle = useTerminalSettingsStore(s => s.cursorStyle);
  const cursorBlink = useTerminalSettingsStore(s => s.cursorBlink);
  const scrollback = useTerminalSettingsStore(s => s.scrollback);
  const terminalThemeName = useTerminalSettingsStore(s => s.terminalThemeName);

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const handleOutput = useCallback((data: string) => {
    if (isDisposedRef.current) return;
    if (xtermRef.current) {
      try {
        xtermRef.current.write(data);
      } catch {
        logger.debug('handleOutput write failed (terminal may be disposed)');
      }
    }
  }, []);

  const handleClose = useCallback((exitCode: number, signal?: number) => {
    if (isDisposedRef.current) return;
    setStatus('disconnected');
    onCloseRef.current?.(exitCode, signal);
  }, []);

  // Debounced resize handler
  const handleResize = useCallback(() => {
    if (isDisposedRef.current || !isReadyRef.current) return;

    // Clear pending debounce
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
  }, []);

  // Search handlers
  const handleSearch = useCallback((term: string, options: SearchOptions) => {
    searchTermRef.current = term;
    if (!searchAddonRef.current) return;
    if (!term) {
      searchAddonRef.current.clearDecorations();
      return;
    }
    searchAddonRef.current.findNext(term, {
      caseSensitive: options.caseSensitive,
      regex: options.regex,
    });
  }, []);

  const handleSearchNext = useCallback(() => {
    const searchTerm = searchTermRef.current;
    if (!searchTerm) return;
    searchAddonRef.current?.findNext(searchTerm);
  }, []);

  const handleSearchPrevious = useCallback(() => {
    const searchTerm = searchTermRef.current;
    if (!searchTerm) return;
    searchAddonRef.current?.findPrevious(searchTerm);
  }, []);

  const handleSearchClose = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
    searchTermRef.current = '';
    setShowSearch(false);
    xtermRef.current?.focus();
  }, []);

  // Initialize terminal
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

    const theme = getTerminalTheme(terminalThemeName);

    const initializeTerminal = () => {
      if (isInitialized || isDisposedRef.current || !container) return;

      const { offsetWidth, offsetHeight } = container;
      if (offsetWidth === 0 || offsetHeight === 0) return;

      isInitialized = true;

      terminal = new Terminal({
        fontSize,
        fontFamily: fontFamily.join(', '),
        fontWeight,
        lineHeight,
        letterSpacing,
        cursorBlink,
        cursorStyle,
        scrollback,
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

      // Smart keyboard handler
      const terminalInstance = terminal;
      const macOS = isMacOS();
      terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const isPrimaryModifier = macOS ? e.metaKey : e.ctrlKey;

        // Primary+F or Primary+Shift+F: toggle search
        if (isPrimaryModifier && key === 'f' && e.type === 'keydown') {
          setShowSearch(prev => !prev);
          return false;
        }

        // Primary+C: copy if selected, otherwise use default handling
        if (isPrimaryModifier && !e.shiftKey && key === 'c' && e.type === 'keydown') {
          if (terminalInstance.hasSelection()) {
            navigator.clipboard.writeText(terminalInstance.getSelection());
            terminalInstance.clearSelection();
            return false;
          }
          return true;
        }

        // Primary+V: paste
        if (isPrimaryModifier && !e.shiftKey && key === 'v' && e.type === 'keydown') {
          navigator.clipboard.readText().then(text => {
            if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
              writeToTerminalChunked(sessionIdRef.current, text);
            } else {
              writeToTerminal(sessionIdRef.current, text);
            }
          });
          return false;
        }

        // Ctrl+Shift+C/V: Linux-style copy/paste
        if (e.ctrlKey && e.shiftKey && key === 'c' && e.type === 'keydown') {
          if (terminalInstance.hasSelection()) {
            navigator.clipboard.writeText(terminalInstance.getSelection());
            terminalInstance.clearSelection();
          }
          return false;
        }
        if (e.ctrlKey && e.shiftKey && key === 'v' && e.type === 'keydown') {
          navigator.clipboard.readText().then(text => {
            if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
              writeToTerminalChunked(sessionIdRef.current, text);
            } else {
              writeToTerminal(sessionIdRef.current, text);
            }
          });
          return false;
        }

        // Let primary modifier + number pass through for tab switching
        if (isPrimaryModifier && key >= '1' && key <= '9') {
          return false;
        }

        return true;
      });

      // Delayed initial fit
      const performInitialFit = (retriesLeft: number) => {
        if (isDisposedRef.current || !terminal || !fitAddon) return;

        const result = safeFit(fitAddon, terminal, container);
        if (result) {
          isReadyRef.current = true;
          resizeTerminal(sessionId, result.cols, result.rows);

          if (!isDisposedRef.current && !connectionRef.current) {
            connectionRef.current = connectTerminal(sessionId, handleOutput, handleClose);
            logger.info('Terminal connected for session', sessionId);
            setStatus('connected');
          }
        } else if (retriesLeft > 0) {
          initRetryTimeout = setTimeout(() => {
            requestAnimationFrame(() => performInitialFit(retriesLeft - 1));
          }, 50);
        } else {
          logger.warn('Fit retries exhausted, connecting anyway');
          isReadyRef.current = true;
          if (!isDisposedRef.current && !connectionRef.current) {
            connectionRef.current = connectTerminal(sessionId, handleOutput, handleClose);
            setStatus('connected');
          }

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

  // Apply settings changes live
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal || isDisposedRef.current || !isReadyRef.current) return;

    const theme = getTerminalTheme(terminalThemeName);

    try {
      terminal.options.fontSize = fontSize;
      terminal.options.fontFamily = fontFamily.join(', ');
      terminal.options.fontWeight = fontWeight;
      terminal.options.lineHeight = lineHeight;
      terminal.options.letterSpacing = letterSpacing;
      terminal.options.cursorBlink = cursorBlink;
      terminal.options.cursorStyle = cursorStyle;
      terminal.options.scrollback = scrollback;
      terminal.options.theme = theme;

      terminal.refresh(0, terminal.rows - 1);

      const result = safeFit(fitAddonRef.current, terminal, terminalRef.current);
      if (result) {
        resizeTerminal(sessionIdRef.current, result.cols, result.rows);
      }
    } catch {
      logger.debug('Failed to apply settings update');
    }
  }, [
    fontSize,
    fontFamily,
    fontWeight,
    lineHeight,
    letterSpacing,
    cursorBlink,
    cursorStyle,
    scrollback,
    terminalThemeName,
  ]);

  // Handle focus changes
  useEffect(() => {
    if (isFocused && xtermRef.current && !isDisposedRef.current && isReadyRef.current) {
      try {
        xtermRef.current.focus();
      } catch {
        logger.debug('Focus failed (terminal may be in transition)');
      }
    }
  }, [isFocused]);

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
  }, [handleResize]);

  const theme = getTerminalTheme(terminalThemeName);

  const getBorderStyle = (): React.CSSProperties => {
    const borderColors: Record<TerminalStatus, string> = {
      connecting: '#e0af68',
      connected: '#9ece6a',
      disconnected: '#f7768e',
      error: '#f7768e',
    };

    return {
      borderColor: borderColors[status],
      borderWidth: '2px',
      borderStyle: 'solid',
    };
  };

  return (
    <div
      className={`terminal-view ${className}`}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: '4px',
        position: 'relative',
        ...getBorderStyle(),
      }}
    >
      {showSearch && (
        <TerminalSearchBar
          onSearch={handleSearch}
          onNext={handleSearchNext}
          onPrevious={handleSearchPrevious}
          onClose={handleSearchClose}
        />
      )}
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          padding: '4px',
          boxSizing: 'border-box',
          backgroundColor: theme.background ?? '#1a1b26',
        }}
      />
    </div>
  );
};

export default TerminalView;
