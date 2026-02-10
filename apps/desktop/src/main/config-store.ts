import Store from 'electron-store';
import { createLogger } from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('ConfigStore');

/**
 * Create an electron-store instance with corruption recovery.
 * If the JSON file is corrupted, backs it up and recreates with defaults.
 */
function createSafeStore<T extends Record<string, unknown>>(
  options: ConstructorParameters<typeof Store<T>>[0] = {} as ConstructorParameters<
    typeof Store<T>
  >[0]
): Store<T> {
  try {
    return new Store<T>(options);
  } catch (error) {
    if (error instanceof SyntaxError) {
      // JSON is corrupted — back up and recreate
      const storeName = (options as { name?: string }).name ?? 'config';
      logger.warn(`Store "${storeName}" has corrupted JSON, attempting recovery...`);

      try {
        // Determine the store path by creating a temp store config
        // electron-store uses app.getPath('userData') + name + '.json'
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        const storeFile = path.join(userDataPath, `${storeName}.json`);

        if (fs.existsSync(storeFile)) {
          const backupFile = `${storeFile}.corrupt.${Date.now()}`;
          fs.renameSync(storeFile, backupFile);
          logger.warn(`Backed up corrupted store to ${backupFile}`);
        }
      } catch (backupError) {
        logger.error('Failed to backup corrupted store:', backupError);
      }

      // Retry creating the store — should succeed now with defaults
      return new Store<T>(options);
    }

    // Non-JSON error — rethrow
    throw error;
  }
}

/**
 * Singleton config store (config.json) for main-process concerns:
 * window state, update preferences, and renderer IPC access.
 */
let _configStore: Store | null = null;

export function getConfigStore(): Store {
  if (!_configStore) {
    _configStore = createSafeStore();
  }
  return _configStore;
}

export { createSafeStore };
