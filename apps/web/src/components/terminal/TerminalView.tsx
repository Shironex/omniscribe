import React, { useEffect, useRef } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { resizeTerminal } from '@/lib/terminal';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { TerminalSearchBar } from './TerminalSearchBar';
import { useTerminalSettings } from '@/hooks/useTerminalSettings';
import { useTerminalSearch } from '@/hooks/useTerminalSearch';
import { useTerminalResize, safeFit } from '@/hooks/useTerminalResize';
import { useTerminalKeyboard } from '@/hooks/useTerminalKeyboard';
import { useTerminalConnection } from '@/hooks/useTerminalConnection';
import { useTerminalInitialization } from '@/hooks/useTerminalInitialization';
import '@xterm/xterm/css/xterm.css';

const logger = createLogger('TerminalView');

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
  const isDisposedRef = useRef<boolean>(false);
  const isReadyRef = useRef<boolean>(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Composed hooks
  const settings = useTerminalSettings();
  const {
    showSearch,
    setShowSearch,
    searchAddonRef,
    handleSearch,
    handleSearchNext,
    handleSearchPrevious,
    handleSearchClose,
  } = useTerminalSearch(xtermRef);

  const { resizeDebounceRef, handleResize } = useTerminalResize(
    terminalRef,
    xtermRef,
    fitAddonRef,
    sessionIdRef,
    isDisposedRef,
    isReadyRef
  );

  const attachKeyboardHandler = useTerminalKeyboard(sessionIdRef, setShowSearch);

  const { status, connectionRef, connectAndJoin } = useTerminalConnection(
    xtermRef,
    isDisposedRef,
    onCloseRef
  );

  useTerminalInitialization(
    sessionId,
    settings,
    {
      terminalRef,
      xtermRef,
      fitAddonRef,
      searchAddonRef,
      resizeObserverRef,
      connectionRef,
      isDisposedRef,
      isReadyRef,
      resizeDebounceRef,
    },
    handleResize,
    connectAndJoin,
    attachKeyboardHandler
  );

  // Apply settings changes live
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal || isDisposedRef.current || !isReadyRef.current) return;

    const theme = getTerminalTheme(settings.terminalThemeName);

    try {
      terminal.options.fontSize = settings.fontSize;
      terminal.options.fontFamily = settings.fontFamily.join(', ');
      terminal.options.fontWeight = settings.fontWeight;
      terminal.options.lineHeight = settings.lineHeight;
      terminal.options.letterSpacing = settings.letterSpacing;
      terminal.options.cursorBlink = settings.cursorBlink;
      terminal.options.cursorStyle = settings.cursorStyle;
      terminal.options.scrollback = settings.scrollback;
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
    settings.fontSize,
    settings.fontFamily,
    settings.fontWeight,
    settings.lineHeight,
    settings.letterSpacing,
    settings.cursorBlink,
    settings.cursorStyle,
    settings.scrollback,
    settings.terminalThemeName,
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

  const theme = getTerminalTheme(settings.terminalThemeName);

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
