import type {
  PluginManifest,
  PluginContext,
  AiProviderPlugin,
  CliDetectionResult,
  OmniscribePlugin,
} from '@omniscribe/plugin-api';

// Re-export payload types from shared for convenience
export type {
  ProviderInfo,
  PluginInvokePayload,
  PluginSetEnabledPayload,
} from '@omniscribe/shared';

/** Definition for registering a plugin at bootstrap */
export interface PluginDefinition {
  /** Plugin manifest from package.json omniscribe field */
  manifest: PluginManifest;
  /** Factory function that creates the plugin instance */
  createPlugin: () => OmniscribePlugin;
  /** If true, plugin is registered as enabled (default: false) */
  autoEnable?: boolean;
  /** If true, plugin is activated immediately after loading (default: false). Requires autoEnable. */
  autoActivate?: boolean;
}

/** A registered provider in the registry with runtime metadata */
export interface RegisteredProvider {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** The provider plugin instance */
  plugin: AiProviderPlugin;
  /** CLI detection result from last check */
  cliStatus: CliDetectionResult;
  /** Whether the provider is enabled by the user */
  enabled: boolean;
  /** Whether the plugin is currently activated (lifecycle) */
  activated: boolean;
  /** Active plugin context (set during activation, cleared on deactivation) */
  context?: PluginContext;
}

/**
 * PLUGIN_API_VERSION constant.
 * Used for version compatibility checking (separate from app version).
 * Plugins declare min/max core version against this.
 */
export const PLUGIN_API_VERSION = '1.0.0';
