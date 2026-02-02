import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  connectTerminal,
  writeToTerminal,
  resizeTerminal,
  killTerminal,
} from '../../lib/terminal';
import '@xterm/xterm/css/xterm.css';

export interface TerminalViewProps {
  sessionId: number;
  onClose?: (exitCode: number, signal?: number) => void;
  isFocused?: boolean;
  className?: string;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

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

  const [status, setStatus] = useState<TerminalStatus>('connecting');

  // Handle terminal output
  const handleOutput = useCallback((data: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  }, []);

  // Handle terminal close
  const handleClose = useCallback(
    (exitCode: number, signal?: number) => {
      setStatus('disconnected');
      onClose?.(exitCode, signal);
    },
    [onClose],
  );

  // Handle resize
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        resizeTerminal(sessionId, cols, rows);
      } catch (error) {
        console.error('[TerminalView] Resize error:', error);
      }
    }
  }, [sessionId]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
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
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // Open terminal in container
    terminal.open(terminalRef.current);

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
      const { cols, rows } = terminal;
      resizeTerminal(sessionId, cols, rows);
    }, 0);

    // Handle user input
    terminal.onData((data) => {
      writeToTerminal(sessionId, data);
    });

    // Connect to terminal session
    connectionRef.current = connectTerminal(sessionId, handleOutput, handleClose);
    setStatus('connected');

    // Set up ResizeObserver for auto-fit
    resizeObserverRef.current = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserverRef.current.observe(terminalRef.current);

    // Cleanup
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (connectionRef.current) {
        connectionRef.current.cleanup();
        connectionRef.current = null;
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      fitAddonRef.current = null;
    };
  }, [sessionId, handleOutput, handleClose, handleResize]);

  // Handle focus changes
  useEffect(() => {
    if (isFocused && xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [isFocused]);

  // Handle window resize
  useEffect(() => {
    const handleWindowResize = () => {
      handleResize();
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleResize]);

  // Kill terminal on unmount
  useEffect(() => {
    return () => {
      killTerminal(sessionId);
    };
  }, [sessionId]);

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
