/**
 * Base Frontend Plugin
 *
 * Abstract base class for plugins that only contribute UI elements.
 * Plugin authors extend this and implement activate() to register
 * their UI contributions via the FrontendPluginContext.
 *
 * @example
 * ```typescript
 * class MyThemePlugin extends BaseFrontendPlugin {
 *   readonly id = 'my-theme';
 *   readonly displayName = 'My Theme';
 *
 *   async activate(context: FrontendPluginContext) {
 *     context.subscriptions.push(
 *       context.registerTheme({
 *         id: 'custom-dark',
 *         label: 'Custom Dark',
 *         isDark: true,
 *         color: '#1a1a2e',
 *         cssProperties: { '--background': '240 10% 3.9%' },
 *       })
 *     );
 *   }
 * }
 * ```
 */

import type { PluginActivation } from '../types/activation';
import type { FrontendPlugin, FrontendPluginContext } from '../types/frontend';

export abstract class BaseFrontendPlugin implements FrontendPlugin {
  /**
   * Unique plugin identifier.
   * Must match the `id` field in the plugin's package.json `omniscribe` manifest.
   */
  abstract readonly id: string;

  /**
   * Human-readable display name shown in the UI.
   */
  abstract readonly displayName: string;

  /**
   * Plugin type. Frontend-only plugins are always 'frontend'.
   */
  readonly type: 'frontend' = 'frontend' as const;

  /**
   * Default activation events: activate on startup.
   * Override to customize activation behavior.
   */
  readonly activationEvents: PluginActivation[] = ['onStartup'];

  /**
   * Called when the plugin is activated. No-op by default.
   * Override to register UI contributions via the context.
   */
  async activate(_context: FrontendPluginContext): Promise<void> {
    // No-op default -- override in subclass
  }

  /**
   * Called when the plugin is deactivated. No-op by default.
   * Override to clean up resources not tracked via context.subscriptions.
   */
  async deactivate(): Promise<void> {
    // No-op default -- override in subclass
  }
}
