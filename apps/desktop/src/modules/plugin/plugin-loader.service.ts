import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isProviderPlugin, validateManifest } from '@omniscribe/plugin-api';
import type { OmniscribePlugin, CliDetectionResult } from '@omniscribe/plugin-api';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { PluginDefinition } from './types';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginStorageService } from './plugin-storage.service';
import { createPluginContext, disposePluginContext } from './plugin-context.factory';
import { InternalPluginEvents } from '../shared/events';

/**
 * Plugin discovery, activation, and lifecycle management.
 *
 * Receives PluginDefinition[] at bootstrap (via DI injection), validates manifests,
 * instantiates plugins, runs CLI detection, registers providers in the registry,
 * and handles activate/deactivate lifecycle.
 *
 * SAFETY: Every call to a plugin method (detectCli, activate, deactivate) is
 * wrapped in try/catch to ensure plugin errors never crash the app.
 */
@Injectable()
export class PluginLoaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('PluginLoader');

  constructor(
    @Inject('PLUGIN_DEFINITIONS') private readonly definitions: PluginDefinition[],
    private readonly registry: PluginRegistryService,
    private readonly storageService: PluginStorageService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /**
   * Called by NestJS after module initialization.
   * Loads all plugin definitions sequentially.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log(`Loading ${this.definitions.length} plugin definition(s)`);
    for (const definition of this.definitions) {
      await this.loadPlugin(definition);
    }
    this.logger.log(
      `Plugin loading complete. ${this.registry.listProviders().length} provider(s) registered.`
    );
  }

  /**
   * Refresh CLI detection for all registered providers.
   * Called by the gateway when the user requests a CLI status refresh.
   */
  async refreshCliDetection(): Promise<void> {
    const providers = this.registry.listProviders();
    this.logger.log(`Refreshing CLI detection for ${providers.length} provider(s)`);
    for (const providerInfo of providers) {
      const entry = this.registry.getProviderEntry(providerInfo.aiMode);
      if (!entry) continue;
      try {
        const cliStatus = await entry.plugin.detectCli();
        this.registry.updateCliStatus(providerInfo.aiMode, cliStatus);
        this.eventEmitter.emit(InternalPluginEvents.CLI_DETECTED(providerInfo.id), {
          pluginId: providerInfo.id,
          cliStatus,
        });
      } catch (error) {
        const msg = extractErrorMessage(error);
        this.logger.warn(`CLI detection failed for '${providerInfo.aiMode}': ${msg}`);
        this.registry.updateCliStatus(providerInfo.aiMode, { installed: false, error: msg });
      }
    }
  }

  /**
   * Activate a provider plugin that is registered but not yet activated.
   * Creates a plugin context with storage and event interfaces, then calls activate().
   * Returns false if the provider doesn't exist, is already activated, or activation fails.
   */
  async activateProvider(aiMode: string): Promise<boolean> {
    const entry = this.registry.getProviderEntry(aiMode);
    if (!entry || entry.activated) return false;
    try {
      const context = createPluginContext(
        entry.manifest.id,
        this.eventEmitter,
        this.storageService
      );
      await entry.plugin.activate(context);
      this.registry.markActivated(aiMode, context);
      this.eventEmitter.emit(InternalPluginEvents.ACTIVATED(entry.manifest.id), {
        pluginId: entry.manifest.id,
      });
      this.logger.log(`Activated provider '${entry.plugin.aiMode}'`);
      return true;
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.error(`Failed to activate provider '${aiMode}': ${msg}`);
      this.eventEmitter.emit(InternalPluginEvents.ERROR(entry.manifest.id), {
        pluginId: entry.manifest.id,
        error: msg,
      });
      return false;
    }
  }

  /**
   * Deactivate a provider plugin.
   * Calls deactivate() on the plugin and marks it as deactivated.
   * Even if deactivation throws, the entry is marked deactivated (best-effort cleanup).
   */
  async deactivateProvider(aiMode: string): Promise<boolean> {
    const entry = this.registry.getProviderEntry(aiMode);
    if (!entry || !entry.activated) return false;
    // Save context ref before clearing via registry (needed for disposal in finally)
    const context = entry.context;
    try {
      await entry.plugin.deactivate();
      this.registry.markDeactivated(aiMode);
      this.eventEmitter.emit(InternalPluginEvents.DEACTIVATED(entry.manifest.id), {
        pluginId: entry.manifest.id,
      });
      this.logger.log(`Deactivated provider '${entry.plugin.aiMode}'`);
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Error deactivating provider '${aiMode}': ${msg}`);
      // Mark as deactivated regardless -- best-effort cleanup
      this.registry.markDeactivated(aiMode);
    } finally {
      // Dispose context subscriptions regardless of deactivation success/failure
      if (context) {
        disposePluginContext(context);
      }
    }
    return true;
  }

  /**
   * Load a single plugin definition: validate manifest, instantiate plugin,
   * run CLI detection, and register the provider.
   */
  private async loadPlugin(definition: PluginDefinition): Promise<void> {
    const { manifest } = definition;

    // Validate manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      this.logger.error(
        `Invalid manifest for plugin '${manifest.id}': ${validation.errors.join(', ')}`
      );
      return;
    }

    // Instantiate plugin
    let plugin: OmniscribePlugin;
    try {
      plugin = definition.createPlugin();
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.error(`Failed to instantiate plugin '${manifest.id}': ${msg}`);
      return;
    }

    // Only register provider plugins (skip frontend-only plugins on the backend)
    if (!isProviderPlugin(plugin)) {
      this.logger.warn(`Plugin '${manifest.id}' is not a provider plugin, skipping`);
      return;
    }

    // Detect CLI (safe -- never crashes app)
    let cliStatus: CliDetectionResult;
    try {
      cliStatus = await plugin.detectCli();
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`CLI detection error for '${manifest.id}': ${msg}`);
      cliStatus = { installed: false, error: msg };
    }

    // Register the provider (honor autoEnable flag, default disabled)
    const enabled = definition.autoEnable ?? false;
    this.registry.registerProvider({
      manifest,
      plugin,
      cliStatus,
      enabled,
      activated: false,
    });

    // Emit CLI detection event for observers
    this.eventEmitter.emit(InternalPluginEvents.CLI_DETECTED(manifest.id), {
      pluginId: manifest.id,
      cliStatus,
    });

    // Auto-activate if requested (e.g., first-party Claude provider)
    if (definition.autoActivate && enabled) {
      const activated = await this.activateProvider(plugin.aiMode);
      if (activated) {
        this.logger.log(`Auto-activated provider '${plugin.aiMode}'`);
      }
    }
  }

  /**
   * Called by NestJS during application shutdown.
   * Deactivates all active providers for graceful cleanup.
   */
  async onModuleDestroy(): Promise<void> {
    const providers = this.registry.listProviders();
    const activeProviders = providers.filter(p => p.activated);
    if (activeProviders.length === 0) return;

    this.logger.log(`Shutting down ${activeProviders.length} active provider(s)`);
    for (const provider of activeProviders) {
      try {
        await this.deactivateProvider(provider.aiMode);
      } catch (error) {
        const msg = extractErrorMessage(error);
        this.logger.warn(`Error during shutdown deactivation of '${provider.aiMode}': ${msg}`);
      }
    }
  }
}
