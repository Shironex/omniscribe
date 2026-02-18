import { Module, DynamicModule, Global } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginGateway } from './plugin.gateway';
import type { PluginDefinition } from './types';

/**
 * NestJS dynamic module for the plugin system.
 *
 * Use `PluginModule.forRoot(definitions)` to bootstrap the module with
 * a list of plugin definitions. The module is @Global so PluginRegistryService
 * and PluginLoaderService are available everywhere without explicit imports.
 *
 * @example
 * ```typescript
 * // In AppModule (Phase 12: empty, Phase 13: with Claude)
 * PluginModule.forRoot([])
 *
 * // With plugins:
 * PluginModule.forRoot([{ manifest: claudeManifest, createPlugin: () => new ClaudePlugin() }])
 * ```
 */
@Global()
@Module({})
export class PluginModule {
  static forRoot(plugins: PluginDefinition[] = []): DynamicModule {
    return {
      module: PluginModule,
      providers: [
        { provide: 'PLUGIN_DEFINITIONS', useValue: plugins },
        PluginRegistryService,
        PluginLoaderService,
        PluginStorageService,
        PluginGateway,
      ],
      exports: [PluginRegistryService, PluginStorageService, PluginLoaderService],
    };
  }
}
