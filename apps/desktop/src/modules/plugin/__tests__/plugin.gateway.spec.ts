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
    it('should invoke a valid method on the plugin and return result', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'customMethod',
        args: ['arg1', 'arg2'],
      };
      const mockPlugin = {
        customMethod: jest.fn().mockResolvedValue('result-value'),
      };
      mockRegistryService.listProviders.mockReturnValue([
        createMockProviderInfo('test-mode', { id: 'test-provider' }),
      ]);
      mockRegistryService.getProviderEntry.mockReturnValue({
        activated: true,
        plugin: mockPlugin,
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result).toEqual({ result: 'result-value' });
      expect(mockPlugin.customMethod).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return error when plugin is not found', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'nonexistent',
        method: 'foo',
      };
      mockRegistryService.listProviders.mockReturnValue([]);

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toContain('No provider found');
    });

    it('should return error when provider is not activated', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'foo',
      };
      mockRegistryService.listProviders.mockReturnValue([
        createMockProviderInfo('test-mode', { id: 'test-provider' }),
      ]);
      mockRegistryService.getProviderEntry.mockReturnValue({
        activated: false,
        plugin: {},
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toContain('not activated');
    });

    it('should return error when method does not exist on plugin', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'nonExistentMethod',
      };
      mockRegistryService.listProviders.mockReturnValue([
        createMockProviderInfo('test-mode', { id: 'test-provider' }),
      ]);
      mockRegistryService.getProviderEntry.mockReturnValue({
        activated: true,
        plugin: {},
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result.error).toContain("Method 'nonExistentMethod' not found");
    });

    it('should catch and return error when invoked method throws', async () => {
      const payload: PluginInvokePayload = {
        pluginId: 'test-provider',
        method: 'failingMethod',
      };
      const mockPlugin = {
        failingMethod: jest.fn().mockRejectedValue(new Error('Method crashed')),
      };
      mockRegistryService.listProviders.mockReturnValue([
        createMockProviderInfo('test-mode', { id: 'test-provider' }),
      ]);
      mockRegistryService.getProviderEntry.mockReturnValue({
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
        method: 'noArgs',
      };
      const mockPlugin = {
        noArgs: jest.fn().mockResolvedValue('ok'),
      };
      mockRegistryService.listProviders.mockReturnValue([
        createMockProviderInfo('test-mode', { id: 'test-provider' }),
      ]);
      mockRegistryService.getProviderEntry.mockReturnValue({
        activated: true,
        plugin: mockPlugin,
        manifest: { id: 'test-provider' },
      });

      const result = await gateway.handleInvoke(mockSocket, payload);

      expect(result).toEqual({ result: 'ok' });
      expect(mockPlugin.noArgs).toHaveBeenCalledWith();
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
