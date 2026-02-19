/**
 * Base Plugin Types
 *
 * Defines the foundational interfaces that all Omniscribe plugins implement.
 * Both provider plugins and frontend plugins extend OmniscribePlugin.
 */

import type { PluginType } from './manifest';

/**
 * Base interface for all Omniscribe plugins.
 *
 * Every plugin -- whether provider, frontend, or both -- implements this interface.
 * It defines the common lifecycle (activate/deactivate) and identity properties.
 */
export interface OmniscribePlugin {
  /** Unique plugin identifier matching the manifest `id` field */
  readonly id: string;

  /** Plugin type matching the manifest `type` field */
  readonly type: PluginType;

  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Called when the plugin is activated.
   * Use the context to register contributions, subscribe to events, and initialize state.
   * All disposables should be added to `context.subscriptions` for automatic cleanup.
   */
  activate(context: PluginContext): Promise<void>;

  /**
   * Called when the plugin is deactivated.
   * Clean up any resources not tracked via `context.subscriptions`.
   */
  deactivate(): Promise<void>;
}

/**
 * Context provided to a plugin during activation.
 * Contains the plugin's identity, a scoped logger, and a subscriptions array
 * for tracking disposables that should be cleaned up on deactivation.
 */
export interface PluginContext {
  /** The ID of the plugin being activated */
  pluginId: string;

  /** Scoped logger instance for the plugin */
  logger: PluginLogger;

  /**
   * Array of disposables that will be disposed when the plugin deactivates.
   * Push disposables here during activate() for automatic cleanup.
   */
  subscriptions: Disposable[];
}

/**
 * Logger interface for plugins.
 * Each plugin receives a scoped logger that prefixes output with the plugin ID.
 */
export interface PluginLogger {
  /** Log an informational message */
  info(message: string, ...args: unknown[]): void;

  /** Log a warning message */
  warn(message: string, ...args: unknown[]): void;

  /** Log an error message */
  error(message: string, ...args: unknown[]): void;

  /** Log a debug message (only visible in development) */
  debug(message: string, ...args: unknown[]): void;
}

/**
 * A resource that can be disposed to free up resources.
 * Follows the VS Code Disposable convention for cleanup management.
 *
 * @example
 * ```typescript
 * const subscription = eventEmitter.on('data', handler);
 * context.subscriptions.push({ dispose: () => subscription.off() });
 * ```
 */
export interface Disposable {
  /** Release resources held by this disposable */
  dispose(): void;
}
