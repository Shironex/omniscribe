import type { PluginContext, PluginLogger, Disposable } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PluginStorageService } from './plugin-storage.service';
import { createPluginEventInterface } from './plugin-events';

/**
 * Extended plugin context with backend-specific capabilities.
 * Adds storage and event interface beyond the base PluginContext.
 */
export interface BackendPluginContext extends PluginContext {
  /** Isolated key-value storage for this plugin */
  storage: {
    get: <T>(key: string, defaultValue?: T) => T | undefined;
    set: <T>(key: string, value: T) => void;
    delete: (key: string) => void;
    has: (key: string) => boolean;
  };
  /** Scoped event interface for plugin communication */
  events: {
    emit: (event: string, payload?: unknown) => void;
    on: (event: string, handler: (data: unknown) => void) => () => void;
    off: (event: string, handler: (data: unknown) => void) => void;
  };
}

/**
 * Create a full backend plugin context for activation.
 * Includes logger, subscriptions, storage, and event interface.
 */
export function createPluginContext(
  pluginId: string,
  eventEmitter: EventEmitter2,
  storageService: PluginStorageService
): BackendPluginContext {
  const logger = createLogger(`Plugin:${pluginId}`);
  const subscriptions: Disposable[] = [];

  const pluginLogger: PluginLogger = {
    info: (msg, ...args) => logger.info(msg, ...args),
    warn: (msg, ...args) => logger.warn(msg, ...args),
    error: (msg, ...args) => logger.error(msg, ...args),
    debug: (msg, ...args) => logger.debug(msg, ...args),
  };

  return {
    pluginId,
    logger: pluginLogger,
    subscriptions,
    storage: storageService.createStorageInterface(pluginId),
    events: createPluginEventInterface(eventEmitter, pluginId),
  };
}

/**
 * Dispose all subscriptions in a plugin context.
 * Called during plugin deactivation.
 */
export function disposePluginContext(context: PluginContext): void {
  for (const disposable of context.subscriptions) {
    try {
      disposable.dispose();
    } catch {
      // Swallow disposal errors -- log at call site if needed
    }
  }
  context.subscriptions.length = 0;
}
