import { ipcMain } from 'electron';
import Store from 'electron-store';
import { createLogger } from '@omniscribe/shared';

const store = new Store();
const logger = createLogger('IPC:Store');

/**
 * Security: exact-match allowlist of store keys.
 *
 * The previous implementation allowed bare 'preferences' as a root key
 * AND used a prefix-match rule. That combination effectively allowed
 * everything under 'preferences.*', which let the renderer scribble
 * arbitrary keys into the persisted preferences blob.
 *
 * This list is exact-match only. To allow nested writes, list every
 * accepted leaf path explicitly (or extend ALLOWED_NESTED_PREFIXES).
 */
const ALLOWED_STORE_KEYS = new Set<string>([
  // Workspace state
  'workspace.tabs',
  'workspace.activeTabId',
  'workspace.preferences',
  'workspace.quickActions',
  'quick-actions',
  // Window state
  'window.bounds',
  'window.maximized',
  // Curated user preferences (enumerated, not prefix-matched)
  'preferences.theme',
  'preferences.fontSize',
  'preferences.fontFamily',
  'preferences.terminalFontSize',
  'preferences.autoSave',
  'preferences.updateChannel',
  'preferences.worktree',
  'preferences.notifications',
  // Recent projects
  'recentProjects',
  // MCP settings
  'mcp.enabledServers',
  // Session defaults
  'session.defaultModel',
  'session.defaultMode',
]);

/**
 * Prefixes whose nested paths the renderer is allowed to read/write.
 * `workspace.*` is broad because the workspace store mirrors a typed
 * object schema with no secrets. `preferences.*` is explicitly NOT
 * here — every preference must be enumerated by name above.
 */
const ALLOWED_NESTED_PREFIXES = ['workspace.', 'window.'] as const;

/**
 * Check if a key is allowed.
 *
 * Exact match is always preferred. Nested keys (`workspace.tabs.0`,
 * `window.bounds.width`) are accepted only when they fall under an
 * explicit prefix in `ALLOWED_NESTED_PREFIXES`.
 */
function isKeyAllowed(key: string): boolean {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (ALLOWED_STORE_KEYS.has(key)) return true;
  for (const prefix of ALLOWED_NESTED_PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length) return true;
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
