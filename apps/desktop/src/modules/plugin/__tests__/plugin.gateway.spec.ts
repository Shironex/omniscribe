import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { PluginGateway } from '../plugin.gateway';
import { PluginRegistryService } from '../plugin-registry.service';
import { PluginLoaderService } from '../plugin-loader.service';
import type { ProviderInfo, PluginSetEnabledPayload, PluginInvokePayload } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

function createMockServer(): Server {
  return {
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Server;
}

function createMockProviderInfo(
  aiMode = 'test-mode',
  overrides?: Partial<ProviderInfo>
): ProviderInfo {
  return {
    id: 'test-provider',
    displayName: 'Test Provider',
    description: 'A test provider plugin',
    aiMode,
    enabled: true,
    activated: true,
    cliStatus: { installed: true },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockRegistryService = {
  listProviders: jest.fn().mockReturnValue([]),
  setEnabled: jest.fn().mockReturnValue(true),
  getProviderEntry: jest.fn(),
  getProviderEntryByPluginId: jest.fn(),
  getProvider: jest.fn(),
};

const mockLoaderService = {
  activateProvider: jest.fn().mockResolvedValue(true),
  deactivateProvider: jest.fn().mockResolvedValue(true),
  refreshCliDetection: jest.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginGateway', () => {
  let gateway: PluginGateway;
  let mockSocket: Socket;
  let mockServer: Server;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([]), EventEmitterModule.forRoot()],
      providers: [
        PluginGateway,
        { provide: PluginRegistryService, useValue: mockRegistryService },
        { provide: PluginLoaderService, useValue: mockLoaderService },
      ],
    }).compile();

    gateway = module.get<PluginGateway>(PluginGateway);
    mockSocket = createMockSocket();
    mockServer = createMockServer();
    gateway.server = mockServer;
  });

  // ================================================================
  // handleListProviders
  // ================================================================
  describe('handleListProviders', () => {
    it('should return providers from registry', () => {
      const providers = [createMockProviderInfo('ai-1'), createMockProviderInfo('ai-2')];
      mockRegistryService.listProviders.mockReturnValue(providers);

      const result = gateway.handleListProviders(mockSocket);

      expect(result).toEqual({ providers });
      expect(mockRegistryService.listProviders).toHaveBeenCalled();
    });

    it('should return empty providers array on error', () => {
      mockRegistryService.listProviders.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = gateway.handleListProviders(mockSocket);

      expect(result).toEqual({ providers: [] });
    });
  });

  // ================================================================
  // handleSetEnabled
  // ================================================================
  describe('handleSetEnabled', () => {
    it('should enable a provider and trigger activation', async () => {
      const payload: PluginSetEnabledPayload = { aiMode: 'test-mode', enabled: true };
      mockRegistryService.setEnabled.mockReturnValue(true);
      mockRegistryService.getProviderEntry.mockReturnValue({
        activated: false,
        plugin: {},
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleSetEnabled(mockSocket, payload);

      expect(result).toEqual({ success: true });
      expect(mockRegistryService.setEnabled).toHaveBeenCalledWith('test-mode', true);
      expect(mockLoaderService.activateProvider).toHaveBeenCalledWith('test-mode');
      expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-enabled', {
        aiMode: 'test-mode',
        enabled: true,
      });
    });

    it('should disable a provider without deactivation call', async () => {
      const payload: PluginSetEnabledPayload = { aiMode: 'test-mode', enabled: false };
      mockRegistryService.setEnabled.mockReturnValue(true);

      const result = await gateway.handleSetEnabled(mockSocket, payload);

      expect(result).toEqual({ success: true });
      expect(mockRegistryService.setEnabled).toHaveBeenCalledWith('test-mode', false);
      expect(mockLoaderService.activateProvider).not.toHaveBeenCalled();
      expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-enabled', {
        aiMode: 'test-mode',
        enabled: false,
      });
    });

    it('should return error when provider is unknown', async () => {
      const payload: PluginSetEnabledPayload = { aiMode: 'unknown', enabled: true };
      mockRegistryService.setEnabled.mockReturnValue(false);

      const result = await gateway.handleSetEnabled(mockSocket, payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No provider registered');
    });

    it('should not activate if already activated', async () => {
      const payload: PluginSetEnabledPayload = { aiMode: 'test-mode', enabled: true };
      mockRegistryService.setEnabled.mockReturnValue(true);
      mockRegistryService.getProviderEntry.mockReturnValue({
        activated: true,
        plugin: {},
        manifest: { id: 'test-provider' },
      });

      await gateway.handleSetEnabled(mockSocket, payload);

      expect(mockLoaderService.activateProvider).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // handleRefreshProviders
  // ================================================================
  describe('handleRefreshProviders', () => {
    it('should call refreshCliDetection and return updated list', async () => {
      const providers = [createMockProviderInfo()];
      mockRegistryService.listProviders.mockReturnValue(providers);

      const result = await gateway.handleRefreshProviders(mockSocket);

      expect(mockLoaderService.refreshCliDetection).toHaveBeenCalled();
      expect(result).toEqual({ providers });
    });

    it('should return current providers even on refresh error', async () => {
      const providers = [createMockProviderInfo()];
      mockLoaderService.refreshCliDetection.mockRejectedValue(new Error('Refresh failed'));
      mockRegistryService.listProviders.mockReturnValue(providers);

      const result = await gateway.handleRefreshProviders(mockSocket);

      expect(result).toEqual({ providers });
    });
  });

  // ================================================================
  // handleInvoke
  // ================================================================
  describe('handleInvoke', () => {
    it('should invoke an allowed method on the plugin and return result', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'detectCli',
        args: ['arg1', 'arg2'],
      };
      const mockPlugin = {
        detectCli: jest.fn().mockResolvedValue('result-value'),
      };
      mockRegistryService.getProviderEntryByPluginId.mockReturnValue({
        activated: true,
        plugin: mockPlugin,
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result).toEqual({ result: 'result-value' });
      expect(mockPlugin.detectCli).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return error when plugin is not found', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'nonexistent',
        method: 'detectCli',
      };
      mockRegistryService.getProviderEntryByPluginId.mockReturnValue(undefined);

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toContain('No provider found');
    });

    it('should return error when provider is not activated', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'detectCli',
      };
      mockRegistryService.getProviderEntryByPluginId.mockReturnValue({
        activated: false,
        plugin: {},
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toContain('not activated');
    });

    it('should return error when allowed method does not exist on plugin', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'parseUsage',
      };
      mockRegistryService.getProviderEntryByPluginId.mockReturnValue({
        activated: true,
        plugin: {},
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toContain("Method 'parseUsage' not found");
    });

    it('should catch and return error when invoked method throws', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'detectCli',
      };
      const mockPlugin = {
        detectCli: jest.fn().mockRejectedValue(new Error('Method crashed')),
      };
      mockRegistryService.getProviderEntryByPluginId.mockReturnValue({
        activated: true,
        plugin: mockPlugin,
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toBe('Method crashed');
    });

    it('should default args to empty array when not provided', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'detectCli',
      };
      const mockPlugin = {
        detectCli: jest.fn().mockResolvedValue('ok'),
      };
      mockRegistryService.getProviderEntryByPluginId.mockReturnValue({
        activated: true,
        plugin: mockPlugin,
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result).toEqual({ result: 'ok' });
      expect(mockPlugin.detectCli).toHaveBeenCalledWith();
    });

    // ================================================================
    // Security: method allowlist enforcement
    // ================================================================
    describe('method allowlist', () => {
      it('should reject prototype method: constructor', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'constructor',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
        expect(mockRegistryService.getProviderEntryByPluginId).not.toHaveBeenCalled();
      });

      it('should reject prototype method: __proto__', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: '__proto__',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it('should reject prototype method: toString', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'toString',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it('should reject prototype method: hasOwnProperty', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'hasOwnProperty',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it('should reject lifecycle method: activate', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'activate',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it('should reject lifecycle method: deactivate', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'deactivate',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it('should reject internal accessor: getSessionReader', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'getSessionReader',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it('should reject arbitrary method names', async () => {
        const payload: PluginInvokePayload = {
          pluginId: 'test-provider',
          method: 'arbitraryDangerousMethod',
        };

        const result = await gateway.handleInvoke(mockSocket, payload);

        expect(result.error).toContain('not allowed for remote invocation');
      });

      it.each([
        'detectCli',
        'buildLaunchCommand',
        'parseTerminalStatus',
        'parseUsage',
        'readSessionHistory',
        'buildResumeCommand',
        'buildForkCommand',
        'buildContinueCommand',
        'getMcpConfig',
        'getSystemPromptAdditions',
      ])('should allow AiProviderPlugin method: %s', async method => {
        const mockPlugin = {
          [method]: jest.fn().mockResolvedValue('ok'),
        };
        mockRegistryService.getProviderEntryByPluginId.mockReturnValue({
          activated: true,
          plugin: mockPlugin,
          manifest: { id: 'test-provider' },
        });

        const result = await gateway.handleInvoke(mockSocket, {
          pluginId: 'test-provider',
          method,
        });

        expect(result).toEqual({ result: 'ok' });
      });
    });
  });

  // ================================================================
  // handlePluginEvent (internal event broadcast)
  // ================================================================
  describe('handlePluginEvent', () => {
    it('should broadcast provider list to all WebSocket clients', () => {
      const providers = [createMockProviderInfo()];
      mockRegistryService.listProviders.mockReturnValue(providers);

      gateway.handlePluginEvent({ pluginId: 'test-provider' });

      expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-status', { providers });
    });

    it('should also broadcast error when event payload contains error', () => {
      const providers = [createMockProviderInfo()];
      mockRegistryService.listProviders.mockReturnValue(providers);

      gateway.handlePluginEvent({
        pluginId: 'test-provider',
        error: 'Something went wrong',
      });

      expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-status', { providers });
      expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-error', {
        pluginId: 'test-provider',
        error: 'Something went wrong',
      });
    });

    it('should not throw when listProviders fails during broadcast', () => {
      mockRegistryService.listProviders.mockImplementation(() => {
        throw new Error('Registry error');
      });

      expect(() => gateway.handlePluginEvent({ pluginId: 'test-provider' })).not.toThrow();
    });
  });
});
