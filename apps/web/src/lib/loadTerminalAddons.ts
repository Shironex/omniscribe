import type { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { createLogger } from '@omniscribe/shared';
import { requestWebgl } from '@/lib/webglPool';

const logger = createLogger('TerminalInit');

export interface LoadedAddons {
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

/**
 * Request WebGL acceleration for the terminal through the shared pool. Browsers
 * cap live WebGL contexts, so the pool attaches at most MAX_WEBGL_CONTEXTS
 * addons across all terminals — the rest run on xterm's default renderer. The
 * addon module is code-split and loaded lazily inside the pool; the canvas
 * renderer paints meanwhile. See `lib/webglPool.ts`.
 */
function loadWebglAsync(terminal: Terminal, sessionId: number, isVisible: boolean): void {
  requestWebgl(String(sessionId), terminal, isVisible);
}

/**
 * Load all addons onto a Terminal instance and open it in the container.
 * Includes FitAddon, WebLinksAddon, SearchAddon, and pooled WebGL (attached
 * via the shared WebGL pool, with default-renderer fallback).
 *
 * `isVisible` seeds the pool's LRU bookkeeping — a terminal can initialize
 * while its project tab is hidden (inactive grids stay mounted), so we must not
 * assume freshly-opened terminals are visible.
 *
 * Factory function — no React hooks. Performs terminal DOM setup as a side effect.
 */
export function loadTerminalAddons(
  terminal: Terminal,
  container: HTMLElement,
  sessionId: number,
  isVisible = true
): LoadedAddons {
  const fitAddon = new FitAddon();
  // URI is validated by Electron's setWindowOpenHandler in the main process
  // which checks isExternalUrlAllowed() before calling shell.openExternal()
  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    window.open(uri, '_blank');
  });
  const searchAddon = new SearchAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.loadAddon(searchAddon);

  logger.info('Terminal opened for session', sessionId);
  terminal.open(container);

  // Route WebGL through the shared pool — see loadWebglAsync above for the why.
  loadWebglAsync(terminal, sessionId, isVisible);

  return { fitAddon, searchAddon };
}
