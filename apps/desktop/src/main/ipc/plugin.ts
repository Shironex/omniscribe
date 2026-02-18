import { ipcMain } from 'electron';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';

const logger = createLogger('IPC:Plugin');

/**
 * Register plugin-related IPC handlers.
 *
 * Provides a bridge for the renderer process to invoke plugin methods
 * via Electron IPC (bypassing WebSocket for synchronous-style calls).
 *
 * Currently handles:
 * - plugin:invoke -- Invoke a method on a plugin by ID
 *
 * Note: The actual plugin resolution happens on the backend via NestJS.
 * This IPC bridge forwards the invoke request to the backend socket.
 * For Phase 12, this is a placeholder that returns an error since
 * the backend socket connection is not available in the main process.
 * The actual invoke flow goes through WebSocket (PluginGateway).
 */
export function registerPluginIpc(): void {
  ipcMain.handle(
    'plugin:invoke',
    async (_event, pluginId: string, method: string, ..._args: unknown[]) => {
      try {
        logger.debug(`Plugin invoke: ${pluginId}.${method}()`);
        // Plugin invocation is primarily handled via WebSocket (PluginGateway).
        // This IPC bridge exists for cases where the renderer needs a direct
        // main-process plugin call (e.g., before WebSocket connection is established).
        // Phase 13+ may add direct NestJS service access here via app reference.
        return {
          error: 'Plugin invoke via IPC is not yet implemented. Use WebSocket plugin:invoke event.',
        };
      } catch (error) {
        const msg = extractErrorMessage(error);
        logger.error(`Plugin invoke failed: ${msg}`);
        return { error: msg };
      }
    }
  );
}

/**
 * Clean up plugin IPC handlers.
 */
export function cleanupPluginIpc(): void {
  ipcMain.removeHandler('plugin:invoke');
}
