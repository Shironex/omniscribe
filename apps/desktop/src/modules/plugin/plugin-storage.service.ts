import { Injectable } from '@nestjs/common';
import Store from 'electron-store';
import { createLogger } from '@omniscribe/shared';

/**
 * Per-plugin storage isolation using electron-store.
 * Each plugin gets its own JSON file via the `name` parameter.
 * Store files are named `plugin-<pluginId>.json` in the electron userData directory.
 */
@Injectable()
export class PluginStorageService {
  private readonly logger = createLogger('PluginStorage');
  private stores = new Map<string, Store>();

  /** Get or create an isolated store for a plugin */
  getStore(pluginId: string): Store {
    let store = this.stores.get(pluginId);
    if (!store) {
      // Validate plugin ID to prevent path traversal
      if (!/^[a-z0-9-]+$/.test(pluginId)) {
        throw new Error(
          `Invalid plugin ID for storage: '${pluginId}'. Must be lowercase alphanumeric with hyphens.`
        );
      }
      store = new Store({
        name: `plugin-${pluginId}`,
        defaults: {},
      });
      this.stores.set(pluginId, store);
      this.logger.debug(`Created store for plugin '${pluginId}' at ${store.path}`);
    }
    return store;
  }

  /**
   * Create a simple storage interface for plugin context.
   * This is the API surface plugins see (not the raw electron-store).
   */
  createStorageInterface(pluginId: string): {
    get: <T>(key: string, defaultValue?: T) => T | undefined;
    set: <T>(key: string, value: T) => void;
    delete: (key: string) => void;
    has: (key: string) => boolean;
  } {
    const store = this.getStore(pluginId);
    return {
      get: <T>(key: string, defaultValue?: T) => store.get(key, defaultValue) as T | undefined,
      set: <T>(key: string, value: T) => store.set(key, value),
      delete: (key: string) => store.delete(key),
      has: (key: string) => store.has(key),
    };
  }

  /** Clear a plugin's store entirely */
  clearStore(pluginId: string): void {
    const store = this.stores.get(pluginId);
    if (store) {
      store.clear();
      this.stores.delete(pluginId);
      this.logger.debug(`Cleared store for plugin '${pluginId}'`);
    }
  }
}
