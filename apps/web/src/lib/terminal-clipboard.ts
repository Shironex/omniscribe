import type { Terminal } from '@xterm/xterm';
import { stripAnsiCodes } from '@omniscribe/shared';
import { toast } from 'sonner';
import { writeClipboard } from '@/lib/clipboard';

/**
 * Copy the current terminal selection to the clipboard.
 *
 * Strips ANSI escape codes, writes via Electron IPC (or Web Clipboard API
 * fallback), shows a toast, and clears the selection on success.
 */
export function copyTerminalSelection(terminal: Terminal): void {
  const raw = terminal.getSelection();
  const clean = stripAnsiCodes(raw);
  writeClipboard(clean)
    .then(() => {
      terminal.clearSelection();
      toast.success('Copied to clipboard');
    })
    .catch(() => {
      toast.error('Failed to copy to clipboard');
    });
}
