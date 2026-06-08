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
 *
 * Scoped to the actual object/array-valued branches of the schema so
 * scalar leaves (e.g. `workspace.activeTabId`, `window.maximized`)
 * cannot be reshaped into objects via paths like
 * `workspace.activeTabId.injected`. `preferences.*` is intentionally
 * NOT here — every preference must be enumerated by exact name above.
 */
const ALLOWED_NESTED_PREFIXES = [
  'workspace.tabs.',
  'workspace.preferences.',
  'workspace.quickActions.',
  'window.bounds.',
] as const;

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

type SizeCheckResult = 'ok' | 'oversize' | 'unserializable';

/**
 * Result of a `store:set`. Returned to the renderer so a rejected write
 * (unauthorized key, size cap, unserializable value) surfaces to the user
 * instead of silently dropping persisted state.
 */
export type StoreSetResult =
  | { ok: true }
  | { ok: false; reason: 'unauthorized' | 'oversize' | 'unserializable' };

/**
 * Find the nearest registered size cap walking up the key tree.
 * Returns `[capKey, capBytes]` where `capKey` is the segment-prefix
 * that owns the cap (may equal `key`), or `undefined` if none.
 */
function findEnclosingCap(key: string): [string, number] | undefined {
  if (STORE_SIZE_CAPS_BYTES[key] !== undefined) {
    return [key, STORE_SIZE_CAPS_BYTES[key]];
  }
  let probe = key;
  while (probe.includes('.')) {
    probe = probe.slice(0, probe.lastIndexOf('.'));
    if (STORE_SIZE_CAPS_BYTES[probe] !== undefined) {
      return [probe, STORE_SIZE_CAPS_BYTES[probe]];
    }
  }
  return undefined;
}

/**
 * Apply a `set(key, value)` mutation against `root`, where `path` is
 * the dot-segments of `key` *relative to* the cap-owning ancestor.
 *
 * Returns the resulting structure. Numeric segments materialize as
 * array indices when the parent is already an array (or absent and
 * the next segment is also numeric); otherwise objects are created.
 *
 * Pure: never mutates `root` in place.
 */
function applyMutation(root: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value;

  const [head, ...rest] = path;
  const isNumeric = /^\d+$/.test(head);

  if (Array.isArray(root)) {
    const idx = Number(head);
    const next = root.slice();
    if (Number.isFinite(idx) && idx >= 0) {
      next[idx] = applyMutation(root[idx], rest, value);
    } else {
      // Non-numeric segment under an array — fall through to object form.
      return { ...root, [head]: applyMutation(undefined, rest, value) };
    }
    return next;
  }

  if (root !== null && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    return { ...obj, [head]: applyMutation(obj[head], rest, value) };
  }

  // Materialize a fresh container for missing/scalar slots.
  if (isNumeric) {
    const arr: unknown[] = [];
    arr[Number(head)] = applyMutation(undefined, rest, value);
    return arr;
  }
  return { [head]: applyMutation(undefined, rest, value) };
}

/**
 * Check whether `set(key, value)` would push the nearest-capped
 * ancestor over its byte budget. Measuring the ancestor (not just the
 * leaf) prevents unbounded growth via many individually capped
 * children — e.g. writing `workspace.tabs.<n>` repeatedly.
 *
 * Returns `'unserializable'` for cycles/BigInt, `'oversize'` when the
 * cap would be breached, `'ok'` otherwise. Splitting the result lets
 * the caller log a precise reason.
 */
function checkSizeCap(key: string, value: unknown): SizeCheckResult {
  const enclosing = findEnclosingCap(key);
  const [capKey, cap] = enclosing ?? ['', STORE_DEFAULT_CAP_BYTES];

  // Compute the value to measure: when an ancestor owns the cap, fold
  // the pending mutation into a clone of the current ancestor; when
  // the leaf itself owns the cap (or no cap is registered), measure
  // the new leaf value directly.
  let measured: unknown;
  if (enclosing && capKey !== key) {
    const current = store.get(capKey);
    const relative = key.slice(capKey.length + 1).split('.');
    measured = applyMutation(current, relative, value);
  } else {
    measured = value;
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(measured);
  } catch {
    // Cycles, BigInt, or other non-JSON payloads.
    return 'unserializable';
  }
  if (serialized === undefined) return 'ok'; // undefined → store will delete

  return Buffer.byteLength(serialized, 'utf8') <= cap ? 'ok' : 'oversize';
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

  ipcMain.handle('store:set', (_event, key: string, value: unknown): StoreSetResult => {
    if (!isKeyAllowed(key)) {
      logger.warn(`Blocked store:set for unauthorized key: ${key}`);
      return { ok: false, reason: 'unauthorized' };
    }
    const sizeCheck = checkSizeCap(key, value);
    if (sizeCheck === 'unserializable') {
      logger.warn(`Blocked store:set for "${key}" — value is not JSON-serializable`);
      return { ok: false, reason: 'unserializable' };
    }
    if (sizeCheck === 'oversize') {
      logger.warn(`Blocked store:set for "${key}" — value exceeds size cap`);
      return { ok: false, reason: 'oversize' };
    }
    store.set(key, value);
    return { ok: true };
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
