import type { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { createLogger } from '@omniscribe/shared';
import { FilePathLinkProvider } from '@/lib/terminal-link-provider';

const logger = createLogger('TerminalInit');

export interface LoadedAddons {
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

/**
 * Load all addons onto a Terminal instance and open it in the container.
 * Includes FitAddon, WebLinksAddon, SearchAddon, WebGL (with canvas fallback),
 * and FilePathLinkProvider.
 *
 * Pure function — no React hooks or side effects beyond terminal setup.
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

  // Try WebGL rendering with canvas fallback
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
    });
    terminal.loadAddon(webglAddon);
    logger.debug('WebGL addon loaded successfully');
  } catch {
    logger.debug('WebGL addon failed, using canvas fallback');
  }

  // Register file path link provider
  terminal.registerLinkProvider(new FilePathLinkProvider(terminal));

  return { fitAddon, searchAddon };
}
