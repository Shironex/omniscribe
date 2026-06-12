import React, { useEffect, useMemo, useRef } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { resizeTerminal } from '@/lib/terminal';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { cn } from '@/lib/utils';
import { TerminalSearchBar } from './TerminalSearchBar';
import { TerminalContextMenu } from './TerminalContextMenu';
import { useTerminalSettings } from '@/hooks/useTerminalSettings';
import { useTerminalSearch } from '@/hooks/useTerminalSearch';
import { useTerminalResize, safeFit } from '@/hooks/useTerminalResize';
import { useTerminalKeyboard } from '@/hooks/useTerminalKeyboard';
import { useTerminalConnection } from '@/hooks/useTerminalConnection';
import { useTerminalInitialization } from '@/hooks/useTerminalInitialization';
import { notifyVisible, notifyHidden } from '@/lib/webglPool';
import '@xterm/xterm/css/xterm.css';

const logger = createLogger('TerminalView');

export interface TerminalViewProps {
  sessionId: number;
  /** Whether this terminal's project tab is currently active/visible */
  isActive?: boolean;
  onClose?: (exitCode: number, signal?: number) => void;
  isFocused?: boolean;
  className?: string;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const BORDER_COLORS: Record<TerminalStatus, string> = {
  connecting: 'var(--color-status-warning)',
  connected: 'var(--color-status-success)',
  disconnected: 'var(--color-status-error)',
  error: 'var(--color-status-error)',
};

export const TerminalView: React.FC<TerminalViewProps> = React.memo(
  ({ sessionId, isActive = true, onClose, isFocused = false, className = '' }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const isDisposedRef = useRef<boolean>(false);
    const isReadyRef = useRef<boolean>(false);
    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;
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
      isReadyRef,
      isActiveRef
    );

    const attachKeyboardHandler = useTerminalKeyboard(sessionIdRef, setShowSearch);

    const { status, connectionRef, connectAndJoin, flushBuffer } = useTerminalConnection(
      xtermRef,
      isDisposedRef,
      onCloseRef,
      isActiveRef
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
        isActiveRef,
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

    // When terminal becomes visible, flush buffered output and refit
    useEffect(() => {
      if (isActive && isReadyRef.current && !isDisposedRef.current) {
        flushBuffer();
        handleResize();
      }
    }, [isActive, flushBuffer, handleResize]);

    // Keep the WebGL pool's LRU bookkeeping in sync with this terminal's
    // visibility. On becoming visible the pool steals a slot from the
    // least-recently-visible hidden holder (never from another visible
    // terminal); on becoming hidden it may hand its slot to a waiter. The pool
    // keys by sessionId and no-ops until the terminal has registered, so an
    // early notify before init is harmless.
    useEffect(() => {
      const terminalId = String(sessionIdRef.current);
      if (isActive) {
        notifyVisible(terminalId);
      } else {
        notifyHidden(terminalId);
      }
    }, [isActive]);

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

    const theme = useMemo(
      () => getTerminalTheme(settings.terminalThemeName),
      [settings.terminalThemeName]
    );

    const containerStyle = useMemo<React.CSSProperties>(
      () => ({
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }),
      []
    );

    return (
      <div
        data-testid={`terminal-view-${sessionId}`}
        className={cn('terminal-view', className)}
        style={containerStyle}
      >
        {/* Status accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-px z-10 transition-colors duration-300"
          style={{ backgroundColor: BORDER_COLORS[status] }}
        />
        {showSearch && (
          <TerminalSearchBar
            onSearch={handleSearch}
            onNext={handleSearchNext}
            onPrevious={handleSearchPrevious}
            onClose={handleSearchClose}
          />
        )}
        <TerminalContextMenu xtermRef={xtermRef} sessionIdRef={sessionIdRef}>
          <div
            ref={terminalRef}
            style={{
              width: '100%',
              height: '100%',
              padding: '4px',
              boxSizing: 'border-box',
              backgroundColor: theme.background ?? 'var(--background)',
            }}
          />
        </TerminalContextMenu>
      </div>
    );
  }
);

TerminalView.displayName = 'TerminalView';

export default TerminalView;
