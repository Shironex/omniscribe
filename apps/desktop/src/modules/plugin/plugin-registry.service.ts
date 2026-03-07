import { Injectable } from '@nestjs/common';
import type { AiProviderPlugin, CliDetectionResult, PluginContext } from '@omniscribe/plugin-api';
import { createLogger, VALID_AI_MODES } from '@omniscribe/shared';
import type { BuiltinAiMode } from '@omniscribe/shared';
import type { RegisteredProvider, ProviderInfo } from './types';

/**
 * Central registry for provider plugins.
 *
 * Manages the registration, lookup, enable/disable, and validation
 * of AI provider plugins. Every provider interaction in the system
 * goes through this service for dispatch.
 */
@Injectable()
export class PluginRegistryService {
  private readonly logger = createLogger('PluginRegistry');
  private providers = new Map<string, RegisteredProvider>();
  private providersByPluginId = new Map<string, RegisteredProvider>();

  /**
   * Register a provider plugin entry in the registry.
   * If a provider for the same aiMode already exists, it is overwritten with a warning.
   * Third-party plugins (builtIn = false) are rejected if they try to register with a built-in aiMode.
   *
   * @param entry - The provider entry to register
   * @param builtIn - INTERNAL: Only PluginLoaderService should set this to true.
   *                  Controls access to reserved AI modes (claude, plain).
   */
  registerProvider(entry: RegisteredProvider, builtIn = false): void {
    const normalizedMode = entry.plugin.aiMode.trim().toLowerCase();
    if (!builtIn && (VALID_AI_MODES as readonly string[]).some(m => m === normalizedMode)) {
      this.logger.error(
        `Cannot register plugin '${entry.manifest.id}' with built-in aiMode '${entry.plugin.aiMode}'. Registration rejected.`
      );
      return;
    }
    if (this.providers.has(entry.plugin.aiMode)) {
      this.logger.warn(
        `Provider already registered for aiMode '${entry.plugin.aiMode}', overwriting`
      );
    }
    this.providers.set(entry.plugin.aiMode, entry);
    this.providersByPluginId.set(entry.manifest.id, entry);
    this.logger.log(
      `Registered provider '${entry.manifest.displayName}' for aiMode '${entry.plugin.aiMode}'`
    );
  }

  /**
   * Get the activated and enabled provider plugin for the given aiMode.
   * Throws if no provider exists, is disabled, or is not activated.
   */
  getProvider(aiMode: string): AiProviderPlugin {
    const entry = this.providers.get(aiMode);
    if (!entry) {
      throw new Error(`No provider registered for aiMode: ${aiMode}`);
    }
    if (!entry.enabled) {
      throw new Error(`Provider '${aiMode}' is disabled`);
    }
    if (!entry.activated) {
      throw new Error(`Provider '${aiMode}' is not activated`);
    }
    return entry.plugin;
  }

  /**
   * Get the raw registry entry for a provider (may be disabled/deactivated).
   * Returns undefined if no provider is registered for the given aiMode.
   */
  getProviderEntry(aiMode: string): RegisteredProvider | undefined {
    return this.providers.get(aiMode);
  }

  /**
   * Look up a provider entry by its manifest plugin ID (e.g. 'provider-claude').
   * O(1) via secondary index. Returns undefined if no match is found.
   */
  getProviderEntryByPluginId(pluginId: string): RegisteredProvider | undefined {
    return this.providersByPluginId.get(pluginId);
  }

  /**
   * Check if the given aiMode is backed by a registered plugin.
   */
  isPluginMode(aiMode: string): boolean {
    return this.providers.has(aiMode);
  }

  /**
   * List all registered providers as serializable ProviderInfo objects.
   * Suitable for WebSocket transport (no class instances).
   */
  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.values()).map(entry => ({
      id: entry.manifest.id,
      displayName: entry.manifest.displayName,
      description: entry.manifest.description,
      aiMode: entry.plugin.aiMode,
      icon: entry.manifest.icon,
      enabled: entry.enabled,
      activated: entry.activated,
      cliStatus: entry.cliStatus,
    }));
  }

  /**
   * Check if the given aiMode is valid for session creation.
   * Returns true for built-in modes ('claude', 'plain') even with zero plugins,
   * and also for any plugin-registered mode.
   */
  isValidMode(aiMode: string): boolean {
    return (
      (VALID_AI_MODES as readonly string[]).includes(aiMode as BuiltinAiMode) ||
      this.providers.has(aiMode)
    );
  }

  /**
   * Mark a provider as activated and store its context.
   * Returns false if no provider exists for the given aiMode.
   */
  markActivated(aiMode: string, context: PluginContext): boolean {
    const entry = this.providers.get(aiMode);
    if (!entry) return false;
    entry.activated = true;
    entry.context = context;
    this.logger.log(`Provider '${aiMode}' activated`);
    return true;
  }

  /**
   * Mark a provider as deactivated and clear its context.
   * Returns false if no provider exists for the given aiMode.
   */
  markDeactivated(aiMode: string): boolean {
    const entry = this.providers.get(aiMode);
    if (!entry) return false;
    entry.activated = false;
    entry.context = undefined;
    this.logger.log(`Provider '${aiMode}' deactivated`);
    return true;
  }

  /**
   * Enable or disable a registered provider.
   * Returns false if no provider exists for the given aiMode.
   */
  setEnabled(aiMode: string, enabled: boolean): boolean {
    const entry = this.providers.get(aiMode);
    if (!entry) return false;
    entry.enabled = enabled;
    this.logger.log(`Provider '${aiMode}' ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Update the CLI detection result for a provider.
   * No-op if the provider does not exist.
   */
  updateCliStatus(aiMode: string, cliStatus: CliDetectionResult): void {
    const entry = this.providers.get(aiMode);
    if (entry) {
      entry.cliStatus = cliStatus;
    }
  }

  /**
   * Get all providers that are enabled, activated, and have CLI installed.
   * These are the providers actually ready to handle sessions.
   */
  getAvailableProviders(): RegisteredProvider[] {
    return Array.from(this.providers.values()).filter(
      e => e.enabled && e.activated && e.cliStatus.installed
    );
  }
}
