import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { createLogger } from '@omniscribe/shared';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { useTerminalSettings } from '@/hooks/useTerminalSettings';
import { cn } from '@/lib/utils';
import '@xterm/xterm/css/xterm.css';

const logger = createLogger('XtermLogViewer');

export interface XtermLogViewerHandle {
  /** Append data (including ANSI sequences) to the viewer */
  append(data: string): void;
  /** Clear all content */
  clear(): void;
  /** Scroll to the bottom of the output */
  scrollToBottom(): void;
}

interface XtermLogViewerProps {
  className?: string;
}

/**
 * Read-only xterm.js instance for viewing log/output data.
 *
 * Renders ANSI-colored text with full xterm fidelity but disables stdin.
 * Exposes an imperative API via ref for appending data, clearing, and scrolling.
 */
export const XtermLogViewer = forwardRef<XtermLogViewerHandle, XtermLogViewerProps>(
  ({ className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    const settings = useTerminalSettings();

    // Expose imperative API
    useImperativeHandle(ref, () => ({
      append(data: string) {
        terminalRef.current?.write(data);
      },
      clear() {
        terminalRef.current?.clear();
      },
      scrollToBottom() {
        terminalRef.current?.scrollToBottom();
      },
    }));

    // Initialize terminal
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const theme = getTerminalTheme(settings.terminalThemeName);

      const terminal = new Terminal({
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily.join(', '),
        fontWeight: settings.fontWeight,
        lineHeight: settings.lineHeight,
        letterSpacing: settings.letterSpacing,
        scrollback: settings.scrollback,
        theme,
        disableStdin: true,
        cursorBlink: false,
        cursorStyle: 'bar',
        cursorInactiveStyle: 'none',
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(container);

      // Try WebGL rendering with canvas fallback
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        terminal.loadAddon(webglAddon);
      } catch {
        logger.debug('WebGL addon failed, using canvas fallback');
      }

      try {
        fitAddon.fit();
      } catch {
        // May fail if container has zero dimensions
      }

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Resize observer
      const observer = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore resize errors
        }
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
      // Only run once on mount — settings changes are applied in a separate effect
    }, []);

    // Apply settings changes live
    useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) return;

      const theme = getTerminalTheme(settings.terminalThemeName);

      try {
        terminal.options.fontSize = settings.fontSize;
        terminal.options.fontFamily = settings.fontFamily.join(', ');
        terminal.options.fontWeight = settings.fontWeight;
        terminal.options.lineHeight = settings.lineHeight;
        terminal.options.letterSpacing = settings.letterSpacing;
        terminal.options.scrollback = settings.scrollback;
        terminal.options.theme = theme;
        terminal.refresh(0, terminal.rows - 1);
        fitAddonRef.current?.fit();
      } catch {
        logger.debug('Failed to apply settings update to log viewer');
      }
    }, [
      settings.fontSize,
      settings.fontFamily,
      settings.fontWeight,
      settings.lineHeight,
      settings.letterSpacing,
      settings.scrollback,
      settings.terminalThemeName,
    ]);

    return (
      <div
        ref={containerRef}
        className={cn('w-full h-full', className)}
        style={{ minHeight: 100 }}
      />
    );
  }
);

XtermLogViewer.displayName = 'XtermLogViewer';
