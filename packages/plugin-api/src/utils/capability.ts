/**
 * Capability Utilities
 *
 * Helper functions for querying provider plugin capabilities.
 * Used by the core to determine what UI to render and what
 * optional methods to call on a provider plugin.
 */

import type { AiProviderPlugin } from '../types/provider';
import type { ProviderCapabilities, SessionOperation } from '../types/capabilities';

/**
 * Check if a provider plugin has a specific capability enabled.
 *
 * Works with both boolean capabilities (supportsMcp, supportsUsage, etc.)
 * and Set capabilities (supportedOperations). For Sets, returns true
 * if the Set is non-empty.
 *
 * @param plugin - The provider plugin to check
 * @param capability - The capability key to check
 * @returns True if the capability is enabled (boolean true or non-empty Set)
 *
 * @example
 * ```typescript
 * if (hasCapability(plugin, 'supportsMcp')) {
 *   const mcpConfig = await plugin.getMcpConfig?.(sessionId, projectPath);
 * }
 * ```
 */
export function hasCapability(
  plugin: AiProviderPlugin,
  capability: keyof ProviderCapabilities
): boolean {
  const value = plugin.capabilities[capability];
  if (value instanceof Set) {
    return value.size > 0;
  }
  return Boolean(value);
}

/**
 * Check if a provider plugin supports a specific session operation.
 *
 * @param plugin - The provider plugin to check
 * @param operation - The operation to check for (resume, fork, continue)
 * @returns True if the operation is in the plugin's supportedOperations set
 *
 * @example
 * ```typescript
 * if (supportsOperation(plugin, 'resume')) {
 *   const cmd = plugin.buildResumeCommand?.(sessionId, context);
 * }
 * ```
 */
export function supportsOperation(plugin: AiProviderPlugin, operation: SessionOperation): boolean {
  return plugin.capabilities.supportedOperations.has(operation);
}

/**
 * Get the full capabilities object from a provider plugin.
 * Simple accessor for consistent capability access patterns.
 *
 * @param plugin - The provider plugin
 * @returns The plugin's ProviderCapabilities object
 */
export function getCapabilities(plugin: AiProviderPlugin): ProviderCapabilities {
  return plugin.capabilities;
}
