import { useCallback } from 'react';
import { createLogger, stripAnsiCodes } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import { toast } from 'sonner';
import { writeToTerminal, writeToTerminalChunked } from '@/lib/terminal';
import { LARGE_PASTE_WARNING_THRESHOLD } from '@/lib/terminal-constants';
import { IS_MAC } from '@/lib/platform';

const logger = createLogger('TerminalKeyboard');

function pasteFromClipboard(sessionIdRef: React.MutableRefObject<number>): void {
  navigator.clipboard
    .readText()
    .then(text => {
      if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
        toast.warning('Large paste detected — sending in chunks');
        writeToTerminalChunked(sessionIdRef.current, text);
      } else {
        writeToTerminal(sessionIdRef.current, text);
      }
    })
    .catch(() => {
      logger.debug('Clipboard read failed (permission denied or unavailable)');
    });
}

function copySelection(terminal: Terminal): void {
  const raw = terminal.getSelection();
  const clean = stripAnsiCodes(raw);
  navigator.clipboard
    .writeText(clean)
    .then(() => {
      toast.success('Copied to clipboard');
    })
    .catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  terminal.clearSelection();
}

/**
 * Hook that creates a keyboard event handler for the terminal.
 * Handles Cmd/Ctrl+C/V/A/F/L, paste chunking, and modifier passthrough.
 */
export function useTerminalKeyboard(
  sessionIdRef: React.MutableRefObject<number>,
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>
): (terminal: Terminal) => void {
  const attachKeyboardHandler = useCallback(
    (terminal: Terminal) => {
      const macOS = IS_MAC;
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
          if (terminal.hasSelection()) {
            copySelection(terminal);
            return false;
          }
          return true;
        }

        // Primary+V: paste
        if (isPrimaryModifier && !e.shiftKey && key === 'v' && e.type === 'keydown') {
          pasteFromClipboard(sessionIdRef);
          return false;
        }

        // Ctrl+Shift+C/V: Linux-style copy/paste
        if (e.ctrlKey && e.shiftKey && key === 'c' && e.type === 'keydown') {
          if (terminal.hasSelection()) {
            copySelection(terminal);
          }
          return false;
        }
        if (e.ctrlKey && e.shiftKey && key === 'v' && e.type === 'keydown') {
          pasteFromClipboard(sessionIdRef);
          return false;
        }

        // Primary+A: select all terminal content
        if (isPrimaryModifier && !e.shiftKey && key === 'a' && e.type === 'keydown') {
          terminal.selectAll();
          return false;
        }

        // Primary+L: clear terminal scrollback
        if (isPrimaryModifier && !e.shiftKey && key === 'l' && e.type === 'keydown') {
          terminal.clear();
          return false;
        }

        // Let primary modifier + number pass through for tab switching
        if (isPrimaryModifier && key >= '1' && key <= '9') {
          return false;
        }

        return true;
      });
    },
    [sessionIdRef, setShowSearch]
  );

  return attachKeyboardHandler;
}
