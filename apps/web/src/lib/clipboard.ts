/**
 * Write text to the system clipboard.
 *
 * Prefers the Electron IPC clipboard API (works in production on Windows
 * where `navigator.clipboard` fails on `file://` origins) and falls back
 * to the standard Web Clipboard API.
 */
export function writeClipboard(text: string): Promise<void> {
  if (window.electronAPI?.app?.clipboardWrite) {
    return window.electronAPI.app.clipboardWrite(text);
  }
  return navigator.clipboard.writeText(text);
}
