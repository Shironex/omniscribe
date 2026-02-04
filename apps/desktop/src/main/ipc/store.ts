import { ipcMain } from 'electron';
import Store from 'electron-store';
import { createLogger } from '@omniscribe/shared';

const store = new Store();
const logger = createLogger('IPC:Store');

/**
 * Security: Whitelist of allowed store keys
 * Only these keys can be read/written from the renderer process
 */
const ALLOWED_STORE_KEYS = new Set([
  // Workspace state
  'workspace.tabs',
  'workspace.activeTabId',
  'workspace.preferences',
  'workspace.quickActions',
  'quick-actions',  // Legacy key format
  // Window state
  'window.bounds',
  'window.maximized',
  // User preferences
  'preferences.theme',
  'preferences.fontSize',
  'preferences.fontFamily',
  'preferences.terminalFontSize',
  'preferences.autoSave',
  'preferences.worktree',
  'preferences',  // Root preferences object
  // Recent projects
  'recentProjects',
  // MCP settings
  'mcp.enabledServers',
  // Session defaults
  'session.defaultModel',
  'session.defaultMode',
]);

/**
 * Check if a key is allowed (exact match or prefix match for nested keys)
 */
function isKeyAllowed(key: string): boolean {
  // Check exact match
  if (ALLOWED_STORE_KEYS.has(key)) {
    return true;
  }

  // Check if key starts with an allowed prefix (for nested access)
  for (const allowedKey of ALLOWED_STORE_KEYS) {
    if (key.startsWith(`${allowedKey}.`)) {
      return true;
    }
  }

  return false;
}

/**
 * Register electron-store IPC handlers
 */
export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', (_event, key: string) => {
    if (!isKeyAllowed(key)) {
      logger.warn(`Blocked store:get for unauthorized key: ${key}`);
      return undefined;
    }
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    if (!isKeyAllowed(key)) {
      logger.warn(`Blocked store:set for unauthorized key: ${key}`);
      return;
    }
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    if (!isKeyAllowed(key)) {
      logger.warn(`Blocked store:delete for unauthorized key: ${key}`);
      return;
    }
    store.delete(key);
  });

  // Security: Remove store:clear to prevent wiping all data
  // If needed, implement a selective clear for specific key prefixes
  ipcMain.handle('store:clear', () => {
    logger.warn('store:clear is disabled for security reasons');
    // Intentionally do nothing - clearing all data is dangerous
  });
}

/**
 * Clean up electron-store IPC handlers
 */
export function cleanupStoreHandlers(): void {
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
  ipcMain.removeHandler('store:clear');
}
