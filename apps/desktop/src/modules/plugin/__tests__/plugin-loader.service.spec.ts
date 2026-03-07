import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PluginLoaderService } from '../plugin-loader.service';
import { PluginRegistryService } from '../plugin-registry.service';
import { PluginStorageService } from '../plugin-storage.service';
import type { PluginDefinition } from '../types';
import type {
  PluginManifest,
  AiProviderPlugin,
  OmniscribePlugin,
  CliDetectionResult,
} from '@omniscribe/plugin-api';

// ---------------------------------------------------------------------------
// Mock electron-store (required by PluginStorageService)
// ---------------------------------------------------------------------------
jest.mock('electron-store', () => {
  return {
    __esModule: true,
    default: class MockStore {
      private data: Map<string, unknown>;
      readonly path = '/mock/store/path.json';

      constructor(options?: { name?: string; defaults?: Record<string, unknown> }) {
        this.data = new Map();
        if (options?.defaults) {
          for (const [key, value] of Object.entries(options.defaults)) {
            this.data.set(key, JSON.parse(JSON.stringify(value)));
          }
        }
      }

      get(key: string, defaultValue?: unknown): unknown {
        if (this.data.has(key)) {
          return JSON.parse(JSON.stringify(this.data.get(key)));
        }
        return defaultValue;
      }

      set(key: string, value: unknown): void {
        this.data.set(key, JSON.parse(JSON.stringify(value)));
      }

      has(key: string): boolean {
        return this.data.has(key);
      }

      delete(key: string): void {
        this.data.delete(key);
      }

      clear(): void {
        this.data.clear();
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createValidManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'test-provider',
    type: 'provider',
    displayName: 'Test Provider',
    description: 'A test provider plugin',
    version: '1.0.0',
    ...overrides,
  };
}

function createMockProviderPlugin(aiMode = 'test-mode'): AiProviderPlugin {
  return {
    id: 'test-provider',
    type: 'provider',
    displayName: 'Test Provider',
    aiMode,
    capabilities: {
      supportsUsage: false,
      supportsSessionHistory: false,
      supportsMcp: false,
      supportedOperations: new Set(),
    },
    activationEvents: [],
    detectCli: jest.fn().mockResolvedValue({ installed: true }),
    buildLaunchCommand: jest.fn(),
    parseTerminalStatus: jest.fn(),
    activate: jest.fn().mockResolvedValue(undefined),
    deactivate: jest.fn().mockResolvedValue(undefined),
  } as unknown as AiProviderPlugin;
}

function createValidDefinition(overrides?: {
  manifest?: Partial<PluginManifest>;
  plugin?: AiProviderPlugin;
}): PluginDefinition {
  const plugin = overrides?.plugin ?? createMockProviderPlugin();
  return {
    manifest: createValidManifest(overrides?.manifest),
    createPlugin: jest.fn().mockReturnValue(plugin),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginLoaderService', () => {
  let service: PluginLoaderService;
  let registry: PluginRegistryService;
  let definitions: PluginDefinition[];

  async function buildModule(defs: PluginDefinition[]): Promise<TestingModule> {
    definitions = defs;
    return Test.createTestingModule({
      providers: [
        PluginLoaderService,
        PluginRegistryService,
        PluginStorageService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn(),
          },
        },
        {
          provide: 'PLUGIN_DEFINITIONS',
          useValue: definitions,
        },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module = await buildModule([]);
    service = module.get<PluginLoaderService>(PluginLoaderService);
    registry = module.get<PluginRegistryService>(PluginRegistryService);
  });

  // ================================================================
  // onModuleInit
  // ================================================================
  describe('onModuleInit', () => {
    it('should complete without error when no definitions', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(registry.listProviders()).toHaveLength(0);
    });

    it('should load a valid provider definition', async () => {
      const def = createValidDefinition();
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      expect(reg.listProviders()).toHaveLength(1);
      expect(def.createPlugin).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // loadPlugin (tested indirectly via onModuleInit)
  // ================================================================
  describe('loadPlugin (via onModuleInit)', () => {
    it('should skip plugin with invalid manifest and not throw', async () => {
      const def: PluginDefinition = {
        manifest: { id: '', type: 'provider', displayName: '', description: '' },
        createPlugin: jest.fn(),
      };
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await expect(loader.onModuleInit()).resolves.not.toThrow();
      expect(reg.listProviders()).toHaveLength(0);
      expect(def.createPlugin).not.toHaveBeenCalled();
    });

    it('should skip plugin when instantiation throws', async () => {
      const def: PluginDefinition = {
        manifest: createValidManifest(),
        createPlugin: jest.fn().mockImplementation(() => {
          throw new Error('Constructor failed');
        }),
      };
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await expect(loader.onModuleInit()).resolves.not.toThrow();
      expect(reg.listProviders()).toHaveLength(0);
    });

    it('should register with installed=false when CLI detection fails', async () => {
      const plugin = createMockProviderPlugin();
      (plugin.detectCli as jest.Mock).mockRejectedValue(new Error('CLI not found'));
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].cliStatus.installed).toBe(false);
    });

    it('should skip non-provider plugins', async () => {
      const frontendPlugin: OmniscribePlugin = {
        id: 'frontend-only',
        type: 'frontend',
        displayName: 'Frontend Plugin',
        activate: jest.fn(),
        deactivate: jest.fn(),
      };
      const def: PluginDefinition = {
        manifest: createValidManifest({ id: 'frontend-only', type: 'frontend' }),
        createPlugin: jest.fn().mockReturnValue(frontendPlugin),
      };
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      expect(reg.listProviders()).toHaveLength(0);
    });

    it('should register provider as disabled by default', async () => {
      const def = createValidDefinition();
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers[0].enabled).toBe(false);
      expect(providers[0].activated).toBe(false);
    });

    it('should load plugin with matching major API version', async () => {
      const def = createValidDefinition({
        manifest: { apiVersion: '1.0.0' },
      });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      expect(reg.listProviders()).toHaveLength(1);
    });

    it('should reject plugin with incompatible major API version', async () => {
      const def = createValidDefinition({
        manifest: { apiVersion: '2.0.0' },
      });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      expect(reg.listProviders()).toHaveLength(0);
      expect(def.createPlugin).not.toHaveBeenCalled();
    });

    it('should load plugin with higher minor API version but log a warning', async () => {
      const def = createValidDefinition({
        manifest: { apiVersion: '1.1.0' },
      });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      // Plugin should still be loaded despite the warning
      expect(reg.listProviders()).toHaveLength(1);
    });

    it('should skip API version check when apiVersion is not set', async () => {
      const def = createValidDefinition({
        manifest: { apiVersion: undefined },
      });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      expect(reg.listProviders()).toHaveLength(1);
    });

    it('should emit CLI_DETECTED event after registration', async () => {
      const def = createValidDefinition();
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const emitter = module.get<EventEmitter2>(EventEmitter2);

      await loader.onModuleInit();

      expect(emitter.emit).toHaveBeenCalledWith(
        'plugin.test-provider.cli-detected',
        expect.objectContaining({
          pluginId: 'test-provider',
          cliStatus: { installed: true },
        })
      );
    });
  });

  // ================================================================
  // activateProvider
  // ================================================================
  describe('activateProvider', () => {
    it('should create context, call activate, and mark as activated', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      const result = await loader.activateProvider('test-mode');

      expect(result).toBe(true);
      expect(plugin.activate).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: 'test-provider',
          logger: expect.any(Object),
          subscriptions: expect.any(Array),
          storage: expect.any(Object),
          events: expect.any(Object),
        })
      );
      const entry = reg.getProviderEntry('test-mode');
      expect(entry?.activated).toBe(true);
    });

    it('should return false for non-existent provider', async () => {
      const result = await service.activateProvider('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for already activated provider', async () => {
      const def = createValidDefinition();
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);

      await loader.onModuleInit();
      await loader.activateProvider('test-mode');
      // Second activation should return false
      const result = await loader.activateProvider('test-mode');
      expect(result).toBe(false);
    });

    it('should log error, emit error event, and return false on activation failure', async () => {
      const plugin = createMockProviderPlugin();
      (plugin.activate as jest.Mock).mockRejectedValue(new Error('Activation failed'));
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const emitter = module.get<EventEmitter2>(EventEmitter2);

      await loader.onModuleInit();
      const result = await loader.activateProvider('test-mode');

      expect(result).toBe(false);
      expect(emitter.emit).toHaveBeenCalledWith(
        'plugin.test-provider.error',
        expect.objectContaining({
          pluginId: 'test-provider',
          error: 'Activation failed',
        })
      );
    });
  });

  // ================================================================
  // deactivateProvider
  // ================================================================
  describe('deactivateProvider', () => {
    it('should call deactivate and mark as deactivated', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      await loader.activateProvider('test-mode');

      const result = await loader.deactivateProvider('test-mode');

      expect(result).toBe(true);
      expect(plugin.deactivate).toHaveBeenCalled();
      expect(reg.getProviderEntry('test-mode')?.activated).toBe(false);
    });

    it('should return false for non-existent provider', async () => {
      const result = await service.deactivateProvider('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for non-activated provider', async () => {
      const def = createValidDefinition();
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);

      await loader.onModuleInit();
      // Not activated -- should return false
      const result = await loader.deactivateProvider('test-mode');
      expect(result).toBe(false);
    });

    it('should still mark as deactivated even when deactivate() throws', async () => {
      const plugin = createMockProviderPlugin();
      (plugin.deactivate as jest.Mock).mockRejectedValue(new Error('Deactivation error'));
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      await loader.activateProvider('test-mode');

      const result = await loader.deactivateProvider('test-mode');

      expect(result).toBe(true);
      expect(reg.getProviderEntry('test-mode')?.activated).toBe(false);
    });

    it('should store context on entry after activation', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      await loader.activateProvider('test-mode');

      const entry = reg.getProviderEntry('test-mode');
      expect(entry?.context).toBeDefined();
      expect(entry?.context?.subscriptions).toEqual([]);
    });

    it('should dispose context subscriptions on deactivation', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      await loader.activateProvider('test-mode');

      // Simulate plugin adding a subscription during activation
      const entry = reg.getProviderEntry('test-mode');
      const mockDisposable = { dispose: jest.fn() };
      entry!.context!.subscriptions.push(mockDisposable);

      await loader.deactivateProvider('test-mode');

      expect(mockDisposable.dispose).toHaveBeenCalled();
      expect(entry?.context).toBeUndefined();
    });

    it('should dispose context even when deactivate() throws', async () => {
      const plugin = createMockProviderPlugin();
      (plugin.deactivate as jest.Mock).mockRejectedValue(new Error('Deactivation error'));
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      await loader.activateProvider('test-mode');

      const entry = reg.getProviderEntry('test-mode');
      const mockDisposable = { dispose: jest.fn() };
      entry!.context!.subscriptions.push(mockDisposable);

      await loader.deactivateProvider('test-mode');

      expect(mockDisposable.dispose).toHaveBeenCalled();
      expect(entry?.context).toBeUndefined();
    });
  });

  // ================================================================
  // onModuleDestroy
  // ================================================================
  describe('onModuleDestroy', () => {
    it('should deactivate all active providers on shutdown', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      def.autoEnable = true;
      def.autoActivate = true;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      expect(reg.getProviderEntry('test-mode')?.activated).toBe(true);

      await loader.onModuleDestroy();

      expect(plugin.deactivate).toHaveBeenCalled();
      expect(reg.getProviderEntry('test-mode')?.activated).toBe(false);
    });

    it('should not throw when no providers are active', async () => {
      const def = createValidDefinition();
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);

      await loader.onModuleInit();
      // Provider is registered but not activated
      await expect(loader.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should continue deactivating other providers if one fails', async () => {
      // First plugin: fails deactivation
      const failingPlugin = createMockProviderPlugin('fail-mode');
      (failingPlugin.deactivate as jest.Mock).mockRejectedValue(new Error('Shutdown error'));
      const failDef = createValidDefinition({
        manifest: { id: 'fail-provider' },
        plugin: failingPlugin,
      });
      failDef.autoEnable = true;
      failDef.autoActivate = true;

      // Second plugin: succeeds deactivation
      const successPlugin = createMockProviderPlugin('ok-mode');
      const okDef = createValidDefinition({
        manifest: { id: 'ok-provider' },
        plugin: successPlugin,
      });
      okDef.autoEnable = true;
      okDef.autoActivate = true;

      const module = await buildModule([failDef, okDef]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);

      await loader.onModuleInit();

      // Should not throw even when first provider's deactivation fails
      await expect(loader.onModuleDestroy()).resolves.not.toThrow();
      // Both providers should have had deactivate() called
      expect(failingPlugin.deactivate).toHaveBeenCalled();
      expect(successPlugin.deactivate).toHaveBeenCalled();
    });
  });

  // ================================================================
  // refreshCliDetection
  // ================================================================
  describe('refreshCliDetection', () => {
    it('should call detectCli and update registry for each provider', async () => {
      const plugin = createMockProviderPlugin();
      const newCliStatus: CliDetectionResult = {
        installed: true,
        version: '3.0.0',
        path: '/usr/bin/test',
      };
      (plugin.detectCli as jest.Mock).mockResolvedValue(newCliStatus);
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      // detectCli was already called once during loading, reset
      (plugin.detectCli as jest.Mock).mockClear();
      (plugin.detectCli as jest.Mock).mockResolvedValue(newCliStatus);

      await loader.refreshCliDetection();

      expect(plugin.detectCli).toHaveBeenCalledTimes(1);
      const providers = reg.listProviders();
      expect(providers[0].cliStatus).toEqual(newCliStatus);
    });

    it('should set installed=false on CLI detection error', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();
      (plugin.detectCli as jest.Mock).mockRejectedValue(new Error('Detection failed'));

      await loader.refreshCliDetection();

      const providers = reg.listProviders();
      expect(providers[0].cliStatus.installed).toBe(false);
      expect(providers[0].cliStatus.error).toBe('Detection failed');
    });
  });

  // ================================================================
  // autoEnable / autoActivate
  // ================================================================
  describe('autoEnable and autoActivate', () => {
    it('should register plugin as enabled when autoEnable is true', async () => {
      const def = createValidDefinition();
      def.autoEnable = true;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].enabled).toBe(true);
      expect(providers[0].activated).toBe(false);
    });

    it('should register plugin as disabled when autoEnable is false (default)', async () => {
      const def = createValidDefinition();
      // autoEnable defaults to false (undefined)
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers[0].enabled).toBe(false);
      expect(providers[0].activated).toBe(false);
    });

    it('should auto-activate plugin when autoEnable and autoActivate are both true', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      def.autoEnable = true;
      def.autoActivate = true;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers[0].enabled).toBe(true);
      expect(providers[0].activated).toBe(true);
      expect(plugin.activate).toHaveBeenCalled();
    });

    it('should NOT auto-activate when autoEnable is true but autoActivate is false', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      def.autoEnable = true;
      def.autoActivate = false;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers[0].enabled).toBe(true);
      expect(providers[0].activated).toBe(false);
      // activate should not be called during loading
      expect(plugin.activate).not.toHaveBeenCalled();
    });

    it('should NOT auto-activate when autoActivate is true but autoEnable is false', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      def.autoEnable = false;
      def.autoActivate = true;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      await loader.onModuleInit();

      const providers = reg.listProviders();
      expect(providers[0].enabled).toBe(false);
      expect(providers[0].activated).toBe(false);
      expect(plugin.activate).not.toHaveBeenCalled();
    });

    it('should log error but not crash when auto-activate fails', async () => {
      const plugin = createMockProviderPlugin();
      (plugin.activate as jest.Mock).mockRejectedValue(new Error('Activation failed'));
      const def = createValidDefinition({ plugin });
      def.autoEnable = true;
      def.autoActivate = true;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const reg = module.get<PluginRegistryService>(PluginRegistryService);

      // Should not throw
      await expect(loader.onModuleInit()).resolves.not.toThrow();

      const providers = reg.listProviders();
      // Plugin is registered and enabled, but activation failed so not activated
      expect(providers).toHaveLength(1);
      expect(providers[0].enabled).toBe(true);
      expect(providers[0].activated).toBe(false);
    });

    it('should emit ACTIVATED event on successful auto-activate', async () => {
      const plugin = createMockProviderPlugin();
      const def = createValidDefinition({ plugin });
      def.autoEnable = true;
      def.autoActivate = true;
      const module = await buildModule([def]);
      const loader = module.get<PluginLoaderService>(PluginLoaderService);
      const emitter = module.get<EventEmitter2>(EventEmitter2);

      await loader.onModuleInit();

      // Should have emitted both CLI_DETECTED and ACTIVATED events
      expect(emitter.emit).toHaveBeenCalledWith(
        'plugin.test-provider.activated',
        expect.objectContaining({ pluginId: 'test-provider' })
      );
    });
  });
});
