import type { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('TerminalInit');

export interface LoadedAddons {
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

/**
 * Load WebGL rendering after the terminal opens. The addon is split off
 * the eager bundle: it pulls in shaders + GL boilerplate (~5–20 KB gzip)
 * and is best-effort anyway, so a tiny delay before WebGL kicks in is
 * fine — the canvas renderer paints meanwhile.
 */
function loadWebglAsync(terminal: Terminal): void {
  void import('@xterm/addon-webgl')
    .then(mod => {
      try {
        const webglAddon = new mod.WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        terminal.loadAddon(webglAddon);
        logger.debug('WebGL addon loaded successfully');
      } catch {
        logger.debug('WebGL addon failed, using canvas fallback');
      }
    })
    .catch(() => {
      // Module-load failure (offline cache miss, etc.) — canvas fallback continues.
      logger.debug('WebGL addon dynamic import failed, using canvas fallback');
    });
}

/**
 * Load all addons onto a Terminal instance and open it in the container.
 * Includes FitAddon, WebLinksAddon, SearchAddon, and WebGL (loaded
 * asynchronously with canvas fallback).
 *
 * Factory function — no React hooks. Performs terminal DOM setup as a side effect.
 */
export function loadTerminalAddons(
  terminal: Terminal,
  container: HTMLElement,
  sessionId: number
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

  // Defer WebGL — see loadWebglAsync above for the why.
  loadWebglAsync(terminal);

  return { fitAddon, searchAddon };
}
