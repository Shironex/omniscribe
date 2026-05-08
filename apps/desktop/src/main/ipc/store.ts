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
 * Per-key max bytes for the JSON-serialized value. Caps prevent the
 * renderer from filling persistent storage with arbitrarily large
 * payloads (e.g. via a runaway tab snapshot or quick-action body).
 *
 * The default is intentionally generous; tightening per-key as we
 * learn legitimate sizes.
 */
const STORE_SIZE_CAPS_BYTES: Record<string, number> = {
  // Tabs are tiny metadata; even hundreds of tabs fit easily in 1 MB.
  'workspace.tabs': 1_048_576,
  'workspace.activeTabId': 1024,
  'workspace.preferences': 256_000,
  'workspace.quickActions': 1_048_576,
  'quick-actions': 1_048_576,
  'window.bounds': 4096,
  'window.maximized': 64,
  'preferences.theme': 1024,
  'preferences.fontSize': 64,
  'preferences.fontFamily': 1024,
  'preferences.terminalFontSize': 64,
  'preferences.autoSave': 64,
  'preferences.updateChannel': 64,
  'preferences.worktree': 16_384,
  'preferences.notifications': 16_384,
  recentProjects: 256_000,
  'mcp.enabledServers': 1_048_576,
  'session.defaultModel': 1024,
  'session.defaultMode': 1024,
};

const STORE_DEFAULT_CAP_BYTES = 4_194_304; // 4 MB hard ceiling for nested writes

function isWithinSizeCap(key: string, value: unknown): boolean {
  // Quick path: tiny primitive values never trip the cap.
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    // Non-serializable payloads (cycles, BigInt, etc.) are rejected.
    return false;
  }
  if (serialized === undefined) return true; // value was undefined → store will delete
  const byteLength = Buffer.byteLength(serialized, 'utf8');

  // Find the most specific cap. Walk the key shorter and shorter
  // checking for a registered cap; fall back to the default ceiling.
  let cap = STORE_SIZE_CAPS_BYTES[key];
  if (cap === undefined) {
    let probe = key;
    while (probe.includes('.')) {
      probe = probe.slice(0, probe.lastIndexOf('.'));
      if (STORE_SIZE_CAPS_BYTES[probe] !== undefined) {
        cap = STORE_SIZE_CAPS_BYTES[probe];
        break;
      }
    }
  }
  if (cap === undefined) cap = STORE_DEFAULT_CAP_BYTES;
  return byteLength <= cap;
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
    if (!isWithinSizeCap(key, value)) {
      logger.warn(`Blocked store:set for "${key}" — value exceeds size cap`);
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
