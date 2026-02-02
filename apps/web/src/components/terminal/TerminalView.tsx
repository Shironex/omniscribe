import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  connectTerminal,
  writeToTerminal,
  resizeTerminal,
} from '../../lib/terminal';
import '@xterm/xterm/css/xterm.css';

export interface TerminalViewProps {
  sessionId: number;
  onClose?: (exitCode: number, signal?: number) => void;
  isFocused?: boolean;
  className?: string;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Helper to safely check if terminal is ready for operations
const isTerminalReady = (terminal: Terminal | null): terminal is Terminal => {
  if (!terminal) return false;
  try {
    // Check if terminal has been disposed or is not fully initialized
    // Access the element property which will be null/undefined if disposed
    const element = terminal.element;
    if (!element) return false;
    // Check if dimensions are available (required for fit operations)
    const dims = (terminal as unknown as { _core?: { _renderService?: { dimensions?: unknown } } })._core?._renderService?.dimensions;
    return dims !== undefined;
  } catch {
    return false;
  }
};

// Helper to safely call fitAddon.fit()
const safeFit = (fitAddon: FitAddon | null, terminal: Terminal | null, container: HTMLDivElement | null): { cols: number; rows: number } | null => {
  if (!fitAddon || !terminal || !container) return null;

  // Check container has dimensions
  const { offsetWidth, offsetHeight } = container;
  if (offsetWidth <= 0 || offsetHeight <= 0) return null;

  // Check terminal is ready
  if (!isTerminalReady(terminal)) return null;

  try {
    fitAddon.fit();
    return { cols: terminal.cols, rows: terminal.rows };
  } catch {
    // Silently handle - terminal may be in transition state
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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const connectionRef = useRef<ReturnType<typeof connectTerminal> | null>(null);
  // Track if the terminal has been disposed to prevent post-cleanup operations
  const isDisposedRef = useRef<boolean>(false);
  // Track if terminal is fully ready (opened and first fit completed)
  const isReadyRef = useRef<boolean>(false);

  // Store callbacks in refs to prevent re-initialization when they change
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [status, setStatus] = useState<TerminalStatus>('connecting');

  // Handle terminal output - use ref to avoid dependency on sessionId for logging
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const handleOutput = useCallback((data: string) => {
    if (isDisposedRef.current) return;
    if (xtermRef.current && isTerminalReady(xtermRef.current)) {
      try {
        xtermRef.current.write(data);
      } catch {
        // Terminal may be disposed - ignore
      }
    }
  }, []);

  // Handle terminal close - use ref to avoid re-initialization
  const handleClose = useCallback(
    (exitCode: number, signal?: number) => {
      if (isDisposedRef.current) return;
      setStatus('disconnected');
      onCloseRef.current?.(exitCode, signal);
    },
    [],
  );

  // Handle resize - only fit if container has dimensions and terminal is ready
  const handleResize = useCallback(() => {
    // Guard against post-disposal calls
    if (isDisposedRef.current || !isReadyRef.current) return;

    const result = safeFit(fitAddonRef.current, xtermRef.current, terminalRef.current);
    if (result) {
      resizeTerminal(sessionIdRef.current, result.cols, result.rows);
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Reset disposal state on mount
    isDisposedRef.current = false;
    isReadyRef.current = false;

    const container = terminalRef.current;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let isInitialized = false;
    let initRetryTimeout: ReturnType<typeof setTimeout> | null = null;

    // Function to initialize terminal once container has dimensions
    const initializeTerminal = () => {
      // Guard against multiple initializations or post-disposal calls
      if (isInitialized || isDisposedRef.current || !container) return;

      // Check that container has actual dimensions
      const { offsetWidth, offsetHeight } = container;
      if (offsetWidth === 0 || offsetHeight === 0) {
        return; // Container not ready yet
      }

      isInitialized = true;

      // Create terminal instance
      terminal = new Terminal({
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 10000,
        theme: {
          background: '#1a1b26',
          foreground: '#c0caf5',
          cursor: '#c0caf5',
          cursorAccent: '#1a1b26',
          selectionBackground: '#33467c',
          selectionForeground: '#c0caf5',
          black: '#15161e',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          blue: '#7aa2f7',
          magenta: '#bb9af7',
          cyan: '#7dcfff',
          white: '#a9b1d6',
          brightBlack: '#414868',
          brightRed: '#f7768e',
          brightGreen: '#9ece6a',
          brightYellow: '#e0af68',
          brightBlue: '#7aa2f7',
          brightMagenta: '#bb9af7',
          brightCyan: '#7dcfff',
          brightWhite: '#c0caf5',
        },
        allowProposedApi: true,
      });

      // Create and load addons
      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      // Open terminal in container
      terminal.open(container);

      // Store refs AFTER opening (terminal is now attached to DOM)
      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Delayed initial fit - wait for terminal to be fully rendered
      // Use multiple frames to ensure xterm's internal render service is ready
      const performInitialFit = (retriesLeft: number) => {
        if (isDisposedRef.current || !terminal || !fitAddon) return;

        const result = safeFit(fitAddon, terminal, container);
        if (result) {
          // Success - terminal is ready
          isReadyRef.current = true;
          resizeTerminal(sessionId, result.cols, result.rows);

          // Now connect to terminal session (after terminal is fully ready)
          // Guard against double-connection from React StrictMode's double-mounting
          if (!isDisposedRef.current && !connectionRef.current) {
            connectionRef.current = connectTerminal(sessionId, handleOutput, handleClose);
            setStatus('connected');
          }
        } else if (retriesLeft > 0) {
          // Retry after a short delay
          initRetryTimeout = setTimeout(() => {
            requestAnimationFrame(() => performInitialFit(retriesLeft - 1));
          }, 50);
        } else {
          // Give up on retries, try to connect anyway
          isReadyRef.current = true;
          // Guard against double-connection from React StrictMode's double-mounting
          if (!isDisposedRef.current && !connectionRef.current) {
            connectionRef.current = connectTerminal(sessionId, handleOutput, handleClose);
            setStatus('connected');
          }
        }
      };

      // Start fit attempts after next frame
      requestAnimationFrame(() => performInitialFit(5));

      // Handle user input
      terminal.onData((data) => {
        if (!isDisposedRef.current) {
          writeToTerminal(sessionId, data);
        }
      });
    };

    // Set up ResizeObserver to detect when container gets dimensions and for auto-fit
    resizeObserverRef.current = new ResizeObserver(() => {
      // Guard against post-disposal calls
      if (isDisposedRef.current) return;

      // Try to initialize if not yet done
      if (!isInitialized) {
        initializeTerminal();
      } else if (isReadyRef.current) {
        // Already initialized and ready, just handle resize
        handleResize();
      }
    });
    resizeObserverRef.current.observe(container);

    // Try immediate initialization in case container already has dimensions
    initializeTerminal();

    // Cleanup
    return () => {
      // Mark as disposed FIRST to prevent any new operations
      isDisposedRef.current = true;
      isReadyRef.current = false;

      // Clear any pending retry timeout
      if (initRetryTimeout) {
        clearTimeout(initRetryTimeout);
        initRetryTimeout = null;
      }

      // Disconnect resize observer BEFORE disposing terminal
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      // Cleanup connection
      if (connectionRef.current) {
        connectionRef.current.cleanup();
        connectionRef.current = null;
      }

      // Dispose terminal last
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose();
        } catch {
          // Safe to ignore - terminal may already be disposed
        }
        xtermRef.current = null;
      }

      fitAddonRef.current = null;
    };
    // Only re-initialize when sessionId changes - callbacks are stored in refs
  }, [sessionId]);

  // Handle focus changes
  useEffect(() => {
    if (isFocused && xtermRef.current && !isDisposedRef.current && isReadyRef.current) {
      try {
        xtermRef.current.focus();
      } catch {
        // Safe to ignore - terminal may be in transition
      }
    }
  }, [isFocused]);

  // Handle window resize
  useEffect(() => {
    const handleWindowResize = () => {
      // Guard against post-disposal calls
      if (!isDisposedRef.current && isReadyRef.current) {
        handleResize();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleResize]);

  // NOTE: We intentionally do NOT kill the terminal on unmount.
  // The terminal is a backend resource that should persist even if the view unmounts.
  // Terminal lifecycle is controlled by explicit user actions (close button) or session deletion.

  // Get border color based on status
  const getBorderStyle = (): React.CSSProperties => {
    const borderColors: Record<TerminalStatus, string> = {
      connecting: '#e0af68', // yellow
      connected: '#9ece6a', // green
      disconnected: '#f7768e', // red
      error: '#f7768e', // red
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
        ...getBorderStyle(),
      }}
    >
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          padding: '4px',
          boxSizing: 'border-box',
          backgroundColor: '#1a1b26',
        }}
      />
    </div>
  );
};

export default TerminalView;
