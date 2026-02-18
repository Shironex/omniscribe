/**
 * Base Full Plugin
 *
 * Abstract base class for plugins that provide both backend (provider) and
 * frontend (UI) contributions. Extends BaseProviderPlugin and implements
 * FrontendPlugin, giving a single class that handles both lifecycles.
 *
 * The backend lifecycle is handled by `activate(context: PluginContext)` inherited
 * from BaseProviderPlugin. The frontend lifecycle uses `activateFrontend(context)`.
 *
 * @example
 * ```typescript
 * class ClaudePlugin extends BaseFullPlugin {
 *   readonly id = 'claude';
 *   readonly displayName = 'Claude Code';
 *   readonly aiMode = 'claude';
 *
 *   // Provider: required methods
 *   async detectCli() { ... }
 *   buildLaunchCommand(context) { ... }
 *   parseTerminalStatus(output) { ... }
 *
 *   // Frontend: UI registrations
 *   async activateFrontend(context: FrontendPluginContext) {
 *     context.subscriptions.push(
 *       context.registerSettingsSection({ ... }),
 *       context.registerUsagePanel({ ... }),
 *     );
 *   }
 * }
 * ```
 */

import { BaseProviderPlugin } from './BaseProviderPlugin';
import type { FrontendPlugin, FrontendPluginContext } from '../types/frontend';
import type { PluginActivation } from '../types/activation';

export abstract class BaseFullPlugin extends BaseProviderPlugin implements FrontendPlugin {
  /**
   * Full plugins provide both provider and frontend contributions.
   */
  override readonly type: 'both' = 'both' as const;

  /**
   * Default activation events for full plugins.
   * Combines the provider's mode-based activation with startup activation.
   * Override to customize.
   */
  override get activationEvents(): PluginActivation[] {
    return [{ event: 'onSessionCreateWithMode', mode: this.aiMode }, 'onStartup'];
  }

  /**
   * Called when the plugin's frontend is activated.
   * Use the FrontendPluginContext to register UI contributions.
   * This is separate from the backend `activate()` lifecycle.
   *
   * @param context - Frontend plugin context with registerXxx methods
   */
  abstract activateFrontend(context: FrontendPluginContext): Promise<void>;
}
