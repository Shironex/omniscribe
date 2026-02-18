import type {
  PluginManifest,
  AiProviderPlugin,
  CliDetectionResult,
  OmniscribePlugin,
} from '@omniscribe/plugin-api';

/** Definition for registering a plugin at bootstrap */
export interface PluginDefinition {
  /** Plugin manifest from package.json omniscribe field */
  manifest: PluginManifest;
  /** Factory function that creates the plugin instance */
  createPlugin: () => OmniscribePlugin;
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
}

/** Serializable provider info for WebSocket transport (no class instances) */
export interface ProviderInfo {
  id: string;
  displayName: string;
  description: string;
  aiMode: string;
  icon?: string;
  enabled: boolean;
  activated: boolean;
  cliStatus: CliDetectionResult;
}

/** Plugin invoke request payload */
export interface PluginInvokePayload {
  pluginId: string;
  method: string;
  args?: unknown[];
}

/** Plugin set-enabled payload */
export interface PluginSetEnabledPayload {
  aiMode: string;
  enabled: boolean;
}

/**
 * PLUGIN_API_VERSION constant.
 * Used for version compatibility checking (separate from app version).
 * Plugins declare min/max core version against this.
 */
export const PLUGIN_API_VERSION = '1.0.0';
