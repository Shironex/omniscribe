import { Test, TestingModule } from '@nestjs/testing';
import { PluginRegistryService } from '../plugin-registry.service';
import type { RegisteredProvider } from '../types';
import type { AiProviderPlugin, CliDetectionResult, PluginManifest } from '@omniscribe/plugin-api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'test-provider',
    type: 'provider',
    displayName: 'Test Provider',
    description: 'A test provider plugin',
    ...overrides,
  };
}

function createMockPlugin(aiMode = 'test-mode'): AiProviderPlugin {
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
    activate: jest.fn(),
    deactivate: jest.fn(),
  } as unknown as AiProviderPlugin;
}

function createMockProvider(
  aiMode = 'test-mode',
  overrides?: Partial<RegisteredProvider>
): RegisteredProvider {
  return {
    manifest: createMockManifest({ id: aiMode }),
    plugin: createMockPlugin(aiMode),
    cliStatus: { installed: true },
    enabled: true,
    activated: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginRegistryService', () => {
  let service: PluginRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PluginRegistryService],
    }).compile();

    service = module.get<PluginRegistryService>(PluginRegistryService);
  });

  // ================================================================
  // registerProvider
  // ================================================================
  describe('registerProvider', () => {
    it('should register a provider and retrieve it by aiMode', () => {
      const entry = createMockProvider('my-ai');

      service.registerProvider(entry);

      const result = service.getProvider('my-ai');
      expect(result).toBe(entry.plugin);
    });

    it('should overwrite existing provider for same aiMode with warning', () => {
      const first = createMockProvider('my-ai');
      const second = createMockProvider('my-ai', {
        manifest: createMockManifest({ id: 'my-ai', displayName: 'Second Provider' }),
      });

      service.registerProvider(first);
      service.registerProvider(second);

      const result = service.getProvider('my-ai');
      expect(result).toBe(second.plugin);
    });
  });

  // ================================================================
  // getProvider
  // ================================================================
  describe('getProvider', () => {
    it('should return the plugin instance when found, enabled, and activated', () => {
      const entry = createMockProvider('test-mode');
      service.registerProvider(entry);

      expect(service.getProvider('test-mode')).toBe(entry.plugin);
    });

    it('should throw when no provider is registered for aiMode', () => {
      expect(() => service.getProvider('nonexistent')).toThrow(
        'No provider registered for aiMode: nonexistent'
      );
    });

    it('should throw when provider is disabled', () => {
      const entry = createMockProvider('test-mode', { enabled: false });
      service.registerProvider(entry);

      expect(() => service.getProvider('test-mode')).toThrow("Provider 'test-mode' is disabled");
    });

    it('should throw when provider is not activated', () => {
      const entry = createMockProvider('test-mode', { activated: false });
      service.registerProvider(entry);

      expect(() => service.getProvider('test-mode')).toThrow(
        "Provider 'test-mode' is not activated"
      );
    });
  });

  // ================================================================
  // getProviderEntry
  // ================================================================
  describe('getProviderEntry', () => {
    it('should return full entry for registered provider', () => {
      const entry = createMockProvider('test-mode');
      service.registerProvider(entry);

      const result = service.getProviderEntry('test-mode');
      expect(result).toBe(entry);
    });

    it('should return undefined for unknown aiMode', () => {
      expect(service.getProviderEntry('unknown')).toBeUndefined();
    });
  });

  // ================================================================
  // getProviderEntryByPluginId
  // ================================================================
  describe('getProviderEntryByPluginId', () => {
    it('should return entry for registered plugin ID', () => {
      const entry = createMockProvider('my-ai', {
        manifest: createMockManifest({ id: 'my-plugin' }),
      });
      service.registerProvider(entry);

      expect(service.getProviderEntryByPluginId('my-plugin')).toBe(entry);
    });

    it('should return undefined for unknown plugin ID', () => {
      expect(service.getProviderEntryByPluginId('nonexistent')).toBeUndefined();
    });

    it('should update secondary index when overwriting same aiMode', () => {
      const first = createMockProvider('my-ai', {
        manifest: createMockManifest({ id: 'plugin-v1' }),
      });
      const second = createMockProvider('my-ai', {
        manifest: createMockManifest({ id: 'plugin-v2' }),
      });

      service.registerProvider(first);
      service.registerProvider(second);

      expect(service.getProviderEntryByPluginId('plugin-v2')).toBe(second);
    });

    it('should handle two providers with different aiModes but distinct plugin IDs', () => {
      const entryA = createMockProvider('ai-a', {
        manifest: createMockManifest({ id: 'plugin-a' }),
      });
      const entryB = createMockProvider('ai-b', {
        manifest: createMockManifest({ id: 'plugin-b' }),
      });

      service.registerProvider(entryA);
      service.registerProvider(entryB);

      expect(service.getProviderEntryByPluginId('plugin-a')).toBe(entryA);
      expect(service.getProviderEntryByPluginId('plugin-b')).toBe(entryB);
    });
  });

  // ================================================================
  // isPluginMode
  // ================================================================
  describe('isPluginMode', () => {
    it('should return true for registered plugin mode', () => {
      service.registerProvider(createMockProvider('custom-ai'));
      expect(service.isPluginMode('custom-ai')).toBe(true);
    });

    it('should return false for built-in mode (claude)', () => {
      expect(service.isPluginMode('claude')).toBe(false);
    });

    it('should return false for unknown mode', () => {
      expect(service.isPluginMode('unknown')).toBe(false);
    });
  });

  // ================================================================
  // isValidMode
  // ================================================================
  describe('isValidMode', () => {
    it('should return true for built-in mode claude', () => {
      expect(service.isValidMode('claude')).toBe(true);
    });

    it('should return true for built-in mode plain', () => {
      expect(service.isValidMode('plain')).toBe(true);
    });

    it('should return true for registered plugin mode', () => {
      service.registerProvider(createMockProvider('custom-ai'));
      expect(service.isValidMode('custom-ai')).toBe(true);
    });

    it('should return false for unknown mode', () => {
      expect(service.isValidMode('unknown')).toBe(false);
    });
  });

  // ================================================================
  // listProviders
  // ================================================================
  describe('listProviders', () => {
    it('should return serializable ProviderInfo array', () => {
      const entry = createMockProvider('my-ai', {
        manifest: createMockManifest({
          id: 'my-ai',
          displayName: 'My AI',
          description: 'My AI provider',
          icon: 'my-icon.svg',
        }),
      });
      service.registerProvider(entry);

      const result = service.listProviders();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'my-ai',
        displayName: 'My AI',
        description: 'My AI provider',
        aiMode: 'my-ai',
        icon: 'my-icon.svg',
        enabled: true,
        activated: true,
        cliStatus: { installed: true },
      });
    });

    it('should return empty array when no providers registered', () => {
      expect(service.listProviders()).toEqual([]);
    });

    it('should return multiple providers', () => {
      service.registerProvider(createMockProvider('ai-1'));
      service.registerProvider(createMockProvider('ai-2'));

      expect(service.listProviders()).toHaveLength(2);
    });
  });

  // ================================================================
  // markActivated
  // ================================================================
  describe('markActivated', () => {
    it('should mark provider as activated and store context', () => {
      const entry = createMockProvider('test-mode', { activated: false });
      service.registerProvider(entry);

      const mockContext = { pluginId: 'test-provider', subscriptions: [] } as any;
      const result = service.markActivated('test-mode', mockContext);

      expect(result).toBe(true);
      const updated = service.getProviderEntry('test-mode');
      expect(updated?.activated).toBe(true);
      expect(updated?.context).toBe(mockContext);
    });

    it('should return false for unknown aiMode', () => {
      expect(service.markActivated('unknown', {} as any)).toBe(false);
    });
  });

  // ================================================================
  // markDeactivated
  // ================================================================
  describe('markDeactivated', () => {
    it('should mark provider as deactivated and clear context', () => {
      const entry = createMockProvider('test-mode', {
        activated: true,
        context: { pluginId: 'test-provider', subscriptions: [] } as any,
      });
      service.registerProvider(entry);

      const result = service.markDeactivated('test-mode');

      expect(result).toBe(true);
      const updated = service.getProviderEntry('test-mode');
      expect(updated?.activated).toBe(false);
      expect(updated?.context).toBeUndefined();
    });

    it('should return false for unknown aiMode', () => {
      expect(service.markDeactivated('unknown')).toBe(false);
    });

    it('should be safe to call when already deactivated', () => {
      const entry = createMockProvider('test-mode', { activated: false });
      service.registerProvider(entry);

      const result = service.markDeactivated('test-mode');

      expect(result).toBe(true);
      expect(service.getProviderEntry('test-mode')?.activated).toBe(false);
    });
  });

  // ================================================================
  // setEnabled
  // ================================================================
  describe('setEnabled', () => {
    it('should enable a disabled provider and return true', () => {
      const entry = createMockProvider('test-mode', { enabled: false });
      service.registerProvider(entry);

      const result = service.setEnabled('test-mode', true);

      expect(result).toBe(true);
      expect(entry.enabled).toBe(true);
    });

    it('should disable an enabled provider and return true', () => {
      const entry = createMockProvider('test-mode', { enabled: true });
      service.registerProvider(entry);

      const result = service.setEnabled('test-mode', false);

      expect(result).toBe(true);
      expect(entry.enabled).toBe(false);
    });

    it('should return false for unknown aiMode', () => {
      expect(service.setEnabled('unknown', true)).toBe(false);
    });
  });

  // ================================================================
  // updateCliStatus
  // ================================================================
  describe('updateCliStatus', () => {
    it('should update CLI status on existing entry', () => {
      const entry = createMockProvider('test-mode', {
        cliStatus: { installed: false },
      });
      service.registerProvider(entry);

      const newStatus: CliDetectionResult = {
        installed: true,
        version: '2.0.0',
        path: '/usr/bin/test-cli',
      };
      service.updateCliStatus('test-mode', newStatus);

      expect(entry.cliStatus).toEqual(newStatus);
    });

    it('should be a no-op for unknown aiMode', () => {
      // Should not throw
      expect(() => service.updateCliStatus('unknown', { installed: true })).not.toThrow();
    });
  });

  // ================================================================
  // getAvailableProviders
  // ================================================================
  describe('getAvailableProviders', () => {
    it('should return only enabled, activated, CLI-installed providers', () => {
      // This one should be available
      service.registerProvider(
        createMockProvider('available', {
          enabled: true,
          activated: true,
          cliStatus: { installed: true },
        })
      );
      // Disabled
      service.registerProvider(
        createMockProvider('disabled', {
          enabled: false,
          activated: true,
          cliStatus: { installed: true },
        })
      );
      // Not activated
      service.registerProvider(
        createMockProvider('inactive', {
          enabled: true,
          activated: false,
          cliStatus: { installed: true },
        })
      );
      // CLI not installed
      service.registerProvider(
        createMockProvider('no-cli', {
          enabled: true,
          activated: true,
          cliStatus: { installed: false },
        })
      );

      const available = service.getAvailableProviders();

      expect(available).toHaveLength(1);
      expect(available[0].plugin.aiMode).toBe('available');
    });

    it('should return empty array when no providers qualify', () => {
      service.registerProvider(createMockProvider('disabled', { enabled: false }));

      expect(service.getAvailableProviders()).toEqual([]);
    });
  });
});
