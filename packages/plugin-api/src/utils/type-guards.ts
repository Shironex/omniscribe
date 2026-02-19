/**
 * Plugin Type Guards
 *
 * Runtime type narrowing functions for determining what kind of plugin
 * an OmniscribePlugin instance is. Used by both plugin authors and
 * the Omniscribe core to safely access type-specific APIs.
 */

import type { OmniscribePlugin } from '../types/plugin';
import type { AiProviderPlugin } from '../types/provider';
import type { FrontendPlugin } from '../types/frontend';

/**
 * Check if a plugin is a provider plugin (type 'provider' or 'both').
 * When true, the plugin implements AiProviderPlugin with capabilities,
 * detectCli, buildLaunchCommand, and parseTerminalStatus.
 *
 * @param plugin - The plugin to check
 * @returns True if the plugin provides AI provider functionality
 */
export function isProviderPlugin(plugin: OmniscribePlugin): plugin is AiProviderPlugin {
  return plugin.type === 'provider' || plugin.type === 'both';
}

/**
 * Check if a plugin is a frontend plugin (type 'frontend' or 'both').
 * When true, the plugin implements FrontendPlugin with UI registration methods.
 *
 * @param plugin - The plugin to check
 * @returns True if the plugin provides frontend UI contributions
 */
export function isFrontendPlugin(plugin: OmniscribePlugin): plugin is FrontendPlugin {
  return plugin.type === 'frontend' || plugin.type === 'both';
}

/**
 * Check if a plugin is a full plugin (type 'both').
 * When true, the plugin implements both AiProviderPlugin and FrontendPlugin.
 *
 * @param plugin - The plugin to check
 * @returns True if the plugin provides both provider and frontend functionality
 */
export function isFullPlugin(
  plugin: OmniscribePlugin
): plugin is AiProviderPlugin & FrontendPlugin {
  return plugin.type === 'both';
}
