import { useCallback } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import { writeToTerminal, writeToTerminalChunked } from '@/lib/terminal';
import { LARGE_PASTE_WARNING_THRESHOLD } from '@/lib/terminal-constants';
import { isMacOS } from '@/lib/os-detection';

const logger = createLogger('TerminalKeyboard');

/**
 * Hook that creates a keyboard event handler for the terminal.
 * Handles Cmd/Ctrl+C/V/F, paste chunking, and modifier passthrough.
 */
export function useTerminalKeyboard(
  sessionIdRef: React.MutableRefObject<number>,
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>
): (terminal: Terminal) => void {
  const attachKeyboardHandler = useCallback(
    (terminal: Terminal) => {
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
          if (terminal.hasSelection()) {
            navigator.clipboard.writeText(terminal.getSelection()).catch(() => {
              logger.debug('Clipboard write failed');
            });
            terminal.clearSelection();
            return false;
          }
          return true;
        }

        // Primary+V: paste
        if (isPrimaryModifier && !e.shiftKey && key === 'v' && e.type === 'keydown') {
          navigator.clipboard
            .readText()
            .then(text => {
              if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
                writeToTerminalChunked(sessionIdRef.current, text);
              } else {
                writeToTerminal(sessionIdRef.current, text);
              }
            })
            .catch(() => {
              logger.debug('Clipboard read failed (permission denied or unavailable)');
            });
          return false;
        }

        // Ctrl+Shift+C/V: Linux-style copy/paste
        if (e.ctrlKey && e.shiftKey && key === 'c' && e.type === 'keydown') {
          if (terminal.hasSelection()) {
            navigator.clipboard.writeText(terminal.getSelection()).catch(() => {
              logger.debug('Clipboard write failed');
            });
            terminal.clearSelection();
          }
          return false;
        }
        if (e.ctrlKey && e.shiftKey && key === 'v' && e.type === 'keydown') {
          navigator.clipboard
            .readText()
            .then(text => {
              if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
                writeToTerminalChunked(sessionIdRef.current, text);
              } else {
                writeToTerminal(sessionIdRef.current, text);
              }
            })
            .catch(() => {
              logger.debug('Clipboard read failed (permission denied or unavailable)');
            });
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
