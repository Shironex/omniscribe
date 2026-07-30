/**
 * Plugin Activation Event Types
 *
 * Plugins declare when they should be activated. Until an activation event
 * fires, the plugin code is not loaded. This enables deferred loading
 * even for bundled plugins, improving startup performance.
 */

/**
 * Simple activation event triggers.
 *
 * - `'onStartup'`       - Activate when Omniscribe starts (use sparingly)
 * - `'onSessionCreate'` - Activate when any session is created
 * - `'onSettingsOpen'`  - Activate when the settings modal opens
 * - `'onThemeChange'`   - Activate when the theme changes (for theme plugins)
 * - `'*'`               - Always activate (equivalent to onStartup)
 */
export type ActivationEvent =
  'onStartup' | 'onSessionCreate' | 'onSettingsOpen' | 'onThemeChange' | '*';

/**
 * Parameterized activation event for mode-specific activation.
 * Used by provider plugins to activate only when their specific AI mode is used.
 *
 * @example
 * ```typescript
 * // Claude plugin activates only for Claude sessions
 * { event: 'onSessionCreateWithMode', mode: 'claude' }
 *
 * // Codex plugin activates only for Codex sessions
 * { event: 'onSessionCreateWithMode', mode: 'codex' }
 * ```
 */
export interface ActivationEventWithMode {
  event: 'onSessionCreateWithMode';
  mode: string;
}

/**
 * A plugin activation trigger.
 * Can be a simple event string or a parameterized event with additional data.
 */
export type PluginActivation = ActivationEvent | ActivationEventWithMode;
