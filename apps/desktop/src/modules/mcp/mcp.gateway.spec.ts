import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { McpGateway } from './mcp.gateway';
import { McpStatusServerService } from './mcp-status-server.service';
import {
  McpDiscoveryService,
  McpWriterService,
  McpProjectCacheService,
  McpSessionRegistryService,
  McpTrackingService,
} from './services';
import { McpCapabilityRegistryService } from './services/mcp-capability-registry.service';
import { McpCapabilityStateService } from './services/mcp-capability-state.service';
import type { McpCapability } from './capabilities/capability.types';

// ---- Helpers ----

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
  } as unknown as Server;
}

// ---- Tests ----

describe('McpGateway', () => {
  let gateway: McpGateway;
  let discoveryService: jest.Mocked<McpDiscoveryService>;
  let writerService: jest.Mocked<McpWriterService>;
  let projectCache: jest.Mocked<McpProjectCacheService>;
  let sessionRegistry: jest.Mocked<McpSessionRegistryService>;
  let trackingService: jest.Mocked<McpTrackingService>;
  let statusServer: jest.Mocked<McpStatusServerService>;
  let capRegistry: jest.Mocked<McpCapabilityRegistryService>;
  let capState: jest.Mocked<McpCapabilityStateService>;
  let mockServer: Server;
  let mockSocket: Socket;

  beforeEach(async () => {
    discoveryService = {
      discoverServers: jest.fn(),
    } as unknown as jest.Mocked<McpDiscoveryService>;

    writerService = {
      writeConfig: jest.fn(),
      removeConfig: jest.fn(),
      generateProjectHash: jest.fn(),
      getInternalMcpInfo: jest.fn(),
    } as unknown as jest.Mocked<McpWriterService>;

    projectCache = {
      setServers: jest.fn(),
      getServers: jest.fn(),
    } as unknown as jest.Mocked<McpProjectCacheService>;

    sessionRegistry = {
      setEnabledServers: jest.fn(),
      getEnabledServers: jest.fn(),
      clearEnabledServers: jest.fn(),
    } as unknown as jest.Mocked<McpSessionRegistryService>;

    trackingService = {
      cleanup: jest.fn(),
    } as unknown as jest.Mocked<McpTrackingService>;

    statusServer = {
      isRunning: jest.fn(),
      getPort: jest.fn(),
      getStatusUrl: jest.fn(),
      getInstanceId: jest.fn(),
    } as unknown as jest.Mocked<McpStatusServerService>;

    capRegistry = {
      list: jest.fn().mockReturnValue([]),
      get: jest.fn(),
    } as unknown as jest.Mocked<McpCapabilityRegistryService>;

    capState = {
      getEnabled: jest.fn().mockReturnValue([]),
      setEnabled: jest.fn(),
      toggle: jest.fn(),
      getElectronCdpPort: jest.fn().mockReturnValue(9222),
      setElectronCdpPort: jest.fn(),
    } as unknown as jest.Mocked<McpCapabilityStateService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [
        McpGateway,
        { provide: McpDiscoveryService, useValue: discoveryService },
        { provide: McpWriterService, useValue: writerService },
        { provide: McpProjectCacheService, useValue: projectCache },
        { provide: McpSessionRegistryService, useValue: sessionRegistry },
        { provide: McpTrackingService, useValue: trackingService },
        { provide: McpStatusServerService, useValue: statusServer },
        { provide: McpCapabilityRegistryService, useValue: capRegistry },
        { provide: McpCapabilityStateService, useValue: capState },
      ],
    }).compile();

    gateway = module.get<McpGateway>(McpGateway);

    // Inject the mock server
    mockServer = createMockServer();
    (gateway as any).server = mockServer;

    mockSocket = createMockSocket();
  });

  // ================================================================
  // afterInit
  // ================================================================
  describe('afterInit', () => {
    it('should initialize without error', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  // ================================================================
  // handleDiscover
  // ================================================================
  describe('handleDiscover', () => {
    const sampleServers = [
      {
        id: 'server-1',
        name: 'server-1',
        transport: 'stdio' as const,
        command: 'node',
        args: ['server.js'],
        enabled: true,
        autoConnect: false,
      },
      {
        id: 'server-2',
        name: 'server-2',
        transport: 'sse' as const,
        url: 'http://localhost:3000',
        enabled: true,
        autoConnect: false,
      },
    ];

    it('should discover servers and cache them', async () => {
      discoveryService.discoverServers.mockResolvedValue(sampleServers);

      const result = await gateway.handleDiscover({ projectPath: '/my/project' }, mockSocket);

      expect(result.servers).toEqual(sampleServers);
      expect(result.error).toBeUndefined();
      expect(discoveryService.discoverServers).toHaveBeenCalledWith('/my/project');
      expect(projectCache.setServers).toHaveBeenCalledWith('/my/project', sampleServers);
    });

    it('should return empty servers when no servers found', async () => {
      discoveryService.discoverServers.mockResolvedValue([]);

      const result = await gateway.handleDiscover({ projectPath: '/empty/project' }, mockSocket);

      expect(result.servers).toEqual([]);
      expect(result.error).toBeUndefined();
      expect(projectCache.setServers).toHaveBeenCalledWith('/empty/project', []);
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleDiscover({ projectPath: '' }, mockSocket);

      expect(result.servers).toEqual([]);
      expect(result.error).toBe('Invalid projectPath: must be a non-empty string');
      expect(discoveryService.discoverServers).not.toHaveBeenCalled();
      expect(projectCache.setServers).not.toHaveBeenCalled();
    });

    it('should return error when payload is null', async () => {
      const result = await gateway.handleDiscover(null as any, mockSocket);

      expect(result.servers).toEqual([]);
      expect(result.error).toBe('Invalid projectPath: must be a non-empty string');
      expect(discoveryService.discoverServers).not.toHaveBeenCalled();
    });

    it('should return error when payload is undefined', async () => {
      const result = await gateway.handleDiscover(undefined as any, mockSocket);

      expect(result.servers).toEqual([]);
      expect(result.error).toBe('Invalid projectPath: must be a non-empty string');
    });

    it('should return error when discoveryService throws', async () => {
      discoveryService.discoverServers.mockRejectedValue(new Error('Discovery failed'));

      const result = await gateway.handleDiscover({ projectPath: '/my/project' }, mockSocket);

      expect(result.servers).toEqual([]);
      expect(result.error).toBe('Discovery failed');
      expect(projectCache.setServers).not.toHaveBeenCalled();
    });

    it('should return "Unknown error" when non-Error is thrown', async () => {
      discoveryService.discoverServers.mockRejectedValue('string error');

      const result = await gateway.handleDiscover({ projectPath: '/my/project' }, mockSocket);

      expect(result.servers).toEqual([]);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ================================================================
  // handleSetEnabled
  // ================================================================
  describe('handleSetEnabled', () => {
    const payload = {
      projectPath: '/my/project',
      sessionId: 'session-1',
      serverIds: ['server-a', 'server-b'],
    };

    it('should set enabled servers and broadcast the change', () => {
      const result = gateway.handleSetEnabled(payload, mockSocket);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(sessionRegistry.setEnabledServers).toHaveBeenCalledWith('/my/project', 'session-1', [
        'server-a',
        'server-b',
      ]);
      expect(mockServer.emit).toHaveBeenCalledWith('mcp:enabled-changed', {
        projectPath: '/my/project',
        sessionId: 'session-1',
        serverIds: ['server-a', 'server-b'],
      });
    });

    it('should broadcast with empty serverIds', () => {
      const emptyPayload = {
        projectPath: '/my/project',
        sessionId: 'session-1',
        serverIds: [],
      };

      const result = gateway.handleSetEnabled(emptyPayload, mockSocket);

      expect(result.success).toBe(true);
      expect(sessionRegistry.setEnabledServers).toHaveBeenCalledWith(
        '/my/project',
        'session-1',
        []
      );
      expect(mockServer.emit).toHaveBeenCalledWith('mcp:enabled-changed', {
        projectPath: '/my/project',
        sessionId: 'session-1',
        serverIds: [],
      });
    });

    it('should return error when sessionRegistry throws', () => {
      sessionRegistry.setEnabledServers.mockImplementation(() => {
        throw new Error('Registry failure');
      });

      const result = gateway.handleSetEnabled(payload, mockSocket);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Registry failure');
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('should return "Unknown error" when non-Error is thrown', () => {
      sessionRegistry.setEnabledServers.mockImplementation(() => {
        throw 42;
      });

      const result = gateway.handleSetEnabled(payload, mockSocket);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ================================================================
  // handleWriteConfig
  // ================================================================
  describe('handleWriteConfig', () => {
    const enabledServer = {
      id: 'server-1',
      name: 'server-1',
      transport: 'stdio' as const,
      command: 'node',
      args: ['server.js'],
      enabled: true,
      autoConnect: false,
    };
    const disabledServer = {
      id: 'server-2',
      name: 'server-2',
      transport: 'stdio' as const,
      command: 'python',
      args: ['s2.py'],
      enabled: false,
      autoConnect: false,
    };

    it('should filter to enabled servers and write config', async () => {
      writerService.writeConfig.mockResolvedValue('/path/to/config.json');

      const result = await gateway.handleWriteConfig(
        {
          workingDir: '/work/dir',
          sessionId: 'session-1',
          projectPath: '/my/project',
          servers: [enabledServer, disabledServer],
        },
        mockSocket
      );

      expect(result.success).toBe(true);
      expect(result.configPath).toBe('/path/to/config.json');
      expect(result.error).toBeUndefined();

      // Should only pass enabled servers to writerService
      expect(writerService.writeConfig).toHaveBeenCalledWith(
        '/work/dir',
        'session-1',
        '/my/project',
        [enabledServer]
      );
    });

    it('should pass empty array when no servers are enabled', async () => {
      writerService.writeConfig.mockResolvedValue('/path/to/config.json');

      const result = await gateway.handleWriteConfig(
        {
          workingDir: '/work/dir',
          sessionId: 'session-1',
          projectPath: '/my/project',
          servers: [disabledServer],
        },
        mockSocket
      );

      expect(result.success).toBe(true);
      expect(writerService.writeConfig).toHaveBeenCalledWith(
        '/work/dir',
        'session-1',
        '/my/project',
        []
      );
    });

    it('should handle all servers enabled', async () => {
      const anotherEnabled = { ...disabledServer, enabled: true };
      writerService.writeConfig.mockResolvedValue('/path/to/config.json');

      const result = await gateway.handleWriteConfig(
        {
          workingDir: '/work/dir',
          sessionId: 'session-1',
          projectPath: '/my/project',
          servers: [enabledServer, anotherEnabled],
        },
        mockSocket
      );

      expect(result.success).toBe(true);
      expect(writerService.writeConfig).toHaveBeenCalledWith(
        '/work/dir',
        'session-1',
        '/my/project',
        [enabledServer, anotherEnabled]
      );
    });

    it('should return error when writerService throws', async () => {
      writerService.writeConfig.mockRejectedValue(new Error('Write failed'));

      const result = await gateway.handleWriteConfig(
        {
          workingDir: '/work/dir',
          sessionId: 'session-1',
          projectPath: '/my/project',
          servers: [enabledServer],
        },
        mockSocket
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Write failed');
      expect(result.configPath).toBeUndefined();
    });

    it('should return "Unknown error" when non-Error is thrown', async () => {
      writerService.writeConfig.mockRejectedValue(null);

      const result = await gateway.handleWriteConfig(
        {
          workingDir: '/work/dir',
          sessionId: 'session-1',
          projectPath: '/my/project',
          servers: [enabledServer],
        },
        mockSocket
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ================================================================
  // handleGetEnabled
  // ================================================================
  describe('handleGetEnabled', () => {
    it('should return enabled server IDs from registry', () => {
      sessionRegistry.getEnabledServers.mockReturnValue(['server-a', 'server-b']);

      const result = gateway.handleGetEnabled(
        { projectPath: '/my/project', sessionId: 'session-1' },
        mockSocket
      );

      expect(result.serverIds).toEqual(['server-a', 'server-b']);
      expect(sessionRegistry.getEnabledServers).toHaveBeenCalledWith('/my/project', 'session-1');
    });

    it('should return empty array when no servers are enabled', () => {
      sessionRegistry.getEnabledServers.mockReturnValue([]);

      const result = gateway.handleGetEnabled(
        { projectPath: '/my/project', sessionId: 'session-1' },
        mockSocket
      );

      expect(result.serverIds).toEqual([]);
    });
  });

  // ================================================================
  // handleGetServers
  // ================================================================
  describe('handleGetServers', () => {
    it('should return cached servers from project cache', () => {
      const cachedServers = [
        {
          id: 'cached-1',
          name: 'cached-1',
          transport: 'stdio' as const,
          command: 'node',
          enabled: true,
          autoConnect: false,
        },
      ];
      projectCache.getServers.mockReturnValue(cachedServers);

      const result = gateway.handleGetServers({ projectPath: '/my/project' }, mockSocket);

      expect(result.servers).toEqual(cachedServers);
      expect(projectCache.getServers).toHaveBeenCalledWith('/my/project');
    });

    it('should return empty array when no servers are cached', () => {
      projectCache.getServers.mockReturnValue([]);

      const result = gateway.handleGetServers({ projectPath: '/other/project' }, mockSocket);

      expect(result.servers).toEqual([]);
    });
  });

  // ================================================================
  // handleRemoveConfig
  // ================================================================
  describe('handleRemoveConfig', () => {
    const payload = {
      workingDir: '/work/dir',
      sessionId: 'session-1',
      projectPath: '/my/project',
    };

    it('should remove config, clear registry, and clean up tracking', async () => {
      writerService.removeConfig.mockResolvedValue(true);
      writerService.generateProjectHash.mockReturnValue('hash-abc');
      trackingService.cleanup.mockResolvedValue(undefined);

      const result = await gateway.handleRemoveConfig(payload, mockSocket);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify cleanup chain
      expect(writerService.removeConfig).toHaveBeenCalledWith('/work/dir', 'session-1');
      expect(sessionRegistry.clearEnabledServers).toHaveBeenCalledWith('/my/project', 'session-1');
      expect(writerService.generateProjectHash).toHaveBeenCalledWith('/my/project');
      expect(trackingService.cleanup).toHaveBeenCalledWith('hash-abc', 'session-1');
    });

    it('should return false when removeConfig returns false', async () => {
      writerService.removeConfig.mockResolvedValue(false);
      writerService.generateProjectHash.mockReturnValue('hash-abc');
      trackingService.cleanup.mockResolvedValue(undefined);

      const result = await gateway.handleRemoveConfig(payload, mockSocket);

      expect(result.success).toBe(false);
      // Still should clean up registry and tracking even if removeConfig returns false
      expect(sessionRegistry.clearEnabledServers).toHaveBeenCalled();
      expect(trackingService.cleanup).toHaveBeenCalled();
    });

    it('should return error when writerService.removeConfig throws', async () => {
      writerService.removeConfig.mockRejectedValue(new Error('Remove failed'));

      const result = await gateway.handleRemoveConfig(payload, mockSocket);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Remove failed');
    });

    it('should return error when sessionRegistry.clearEnabledServers throws', async () => {
      writerService.removeConfig.mockResolvedValue(true);
      sessionRegistry.clearEnabledServers.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      const result = await gateway.handleRemoveConfig(payload, mockSocket);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Clear failed');
    });

    it('should return error when trackingService.cleanup throws', async () => {
      writerService.removeConfig.mockResolvedValue(true);
      writerService.generateProjectHash.mockReturnValue('hash-abc');
      trackingService.cleanup.mockRejectedValue(new Error('Cleanup failed'));

      const result = await gateway.handleRemoveConfig(payload, mockSocket);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cleanup failed');
    });

    it('should return "Unknown error" when non-Error is thrown', async () => {
      writerService.removeConfig.mockRejectedValue('string error');

      const result = await gateway.handleRemoveConfig(payload, mockSocket);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ================================================================
  // handleGetInternalStatus
  // ================================================================
  describe('handleGetInternalStatus', () => {
    it('should return internal MCP info from writerService', () => {
      writerService.getInternalMcpInfo.mockReturnValue({
        available: true,
        path: '/path/to/mcp-server/index.cjs',
      });

      const result = gateway.handleGetInternalStatus();

      expect(result).toEqual({
        available: true,
        path: '/path/to/mcp-server/index.cjs',
      });
      expect(writerService.getInternalMcpInfo).toHaveBeenCalled();
    });

    it('should return not-available status when MCP server is not found', () => {
      writerService.getInternalMcpInfo.mockReturnValue({
        available: false,
        path: null,
      });

      const result = gateway.handleGetInternalStatus();

      expect(result).toEqual({
        available: false,
        path: null,
      });
    });
  });

  // ================================================================
  // handleGetStatusServerInfo
  // ================================================================
  describe('handleGetStatusServerInfo', () => {
    it('should return status server info when running', () => {
      statusServer.isRunning.mockReturnValue(true);
      statusServer.getPort.mockReturnValue(49200);
      statusServer.getStatusUrl.mockReturnValue('http://127.0.0.1:49200/status');
      statusServer.getInstanceId.mockReturnValue('instance-uuid-123');

      const result = gateway.handleGetStatusServerInfo();

      expect(result).toEqual({
        running: true,
        port: 49200,
        statusUrl: 'http://127.0.0.1:49200/status',
        instanceId: 'instance-uuid-123',
      });
    });

    it('should return not-running status when server is stopped', () => {
      statusServer.isRunning.mockReturnValue(false);
      statusServer.getPort.mockReturnValue(null);
      statusServer.getStatusUrl.mockReturnValue(null);
      statusServer.getInstanceId.mockReturnValue('instance-uuid-123');

      const result = gateway.handleGetStatusServerInfo();

      expect(result).toEqual({
        running: false,
        port: null,
        statusUrl: null,
        instanceId: 'instance-uuid-123',
      });
    });
  });

  // ================================================================
  // onSessionTasks (event handler)
  // ================================================================
  describe('onSessionTasks', () => {
    it('should broadcast session tasks event to all clients', () => {
      gateway.onSessionTasks({
        sessionId: 'session-1',
        tasks: [
          { id: 'task-1', subject: 'Implement feature', status: 'in_progress' },
          { id: 'task-2', subject: 'Write tests', status: 'pending' },
        ],
      });

      expect(mockServer.emit).toHaveBeenCalledWith('session:tasks', {
        sessionId: 'session-1',
        tasks: [
          { id: 'task-1', subject: 'Implement feature', status: 'in_progress' },
          { id: 'task-2', subject: 'Write tests', status: 'pending' },
        ],
      });
    });

    it('should include sessionId and tasks in the emitted payload', () => {
      gateway.onSessionTasks({
        sessionId: 'session-42',
        tasks: [{ id: 'task-a', subject: 'Deploy', status: 'completed' }],
      });

      const emitCall = (mockServer.emit as jest.Mock).mock.calls[0];
      expect(emitCall[0]).toBe('session:tasks');
      expect(emitCall[1]).toHaveProperty('sessionId', 'session-42');
      expect(emitCall[1]).toHaveProperty('tasks');
      expect(emitCall[1].tasks).toHaveLength(1);
    });

    it('should handle empty tasks array', () => {
      gateway.onSessionTasks({
        sessionId: 'session-1',
        tasks: [],
      });

      expect(mockServer.emit).toHaveBeenCalledWith('session:tasks', {
        sessionId: 'session-1',
        tasks: [],
      });
    });

    it('should call server.emit exactly once per tasks event', () => {
      gateway.onSessionTasks({
        sessionId: 'session-1',
        tasks: [{ id: 'task-1', subject: 'Something', status: 'pending' }],
      });

      expect(mockServer.emit).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // handleCapabilityList
  // ================================================================
  describe('handleCapabilityList', () => {
    const fakeCaps: McpCapability[] = [
      { id: 'omniscribe', label: 'Omniscribe', description: 'd1', buildConfig: jest.fn() },
      { id: 'playwright-web', label: 'PW', description: 'd2', buildConfig: jest.fn() },
    ];

    it('returns capabilities merged with per-project enabled state', async () => {
      capRegistry.list.mockReturnValue(fakeCaps);
      capState.getEnabled.mockReturnValue(['omniscribe']);

      const result = await gateway.handleCapabilityList({ projectPath: '/p' }, mockSocket);

      expect(result.error).toBeUndefined();
      expect(result.capabilities).toEqual([
        { id: 'omniscribe', label: 'Omniscribe', description: 'd1', enabled: true },
        { id: 'playwright-web', label: 'PW', description: 'd2', enabled: false },
      ]);
      expect(capState.getEnabled).toHaveBeenCalledWith('/p');
    });

    it('returns error for missing projectPath', async () => {
      const result = await gateway.handleCapabilityList({ projectPath: '' }, mockSocket);
      expect(result.capabilities).toEqual([]);
      expect(result.error).toBe('Invalid projectPath: must be a non-empty string');
    });

    it('propagates requiresDev and disabledReason from preflight', async () => {
      const capWithPreflight: McpCapability = {
        id: 'playwright-electron',
        label: 'PE',
        description: 'd3',
        requiresDev: true,
        buildConfig: jest.fn(),
        preflight: jest.fn().mockResolvedValue({ ok: false, reason: 'CDP not enabled' }),
      };
      capRegistry.list.mockReturnValue([capWithPreflight]);
      capState.getEnabled.mockReturnValue([]);

      const result = await gateway.handleCapabilityList({ projectPath: '/p' }, mockSocket);

      expect(result.error).toBeUndefined();
      expect(result.capabilities).toHaveLength(1);
      expect(result.capabilities[0]).toEqual({
        id: 'playwright-electron',
        label: 'PE',
        description: 'd3',
        enabled: false,
        requiresDev: true,
        disabledReason: 'CDP not enabled',
        electronCdpPort: 9222,
      });
      expect(capWithPreflight.preflight).toHaveBeenCalled();
    });

    it('omits disabledReason when preflight returns ok', async () => {
      const capWithPreflight: McpCapability = {
        id: 'playwright-electron',
        label: 'PE',
        description: 'd3',
        requiresDev: true,
        buildConfig: jest.fn(),
        preflight: jest.fn().mockResolvedValue({ ok: true }),
      };
      capRegistry.list.mockReturnValue([capWithPreflight]);
      capState.getEnabled.mockReturnValue([]);

      const result = await gateway.handleCapabilityList({ projectPath: '/p' }, mockSocket);

      expect(result.capabilities[0].disabledReason).toBeUndefined();
      expect(result.capabilities[0].requiresDev).toBe(true);
    });
  });

  // ================================================================
  // handleCapabilityToggle
  // ================================================================
  describe('handleCapabilityToggle', () => {
    it('toggles capability, broadcasts CAPABILITY_CHANGED, returns enabledIds', () => {
      capRegistry.get.mockReturnValue({
        id: 'playwright-web',
        label: 'PW',
        description: '',
        buildConfig: jest.fn(),
      } satisfies McpCapability);
      capState.toggle.mockReturnValue(['omniscribe', 'playwright-web']);

      const result = gateway.handleCapabilityToggle(
        { projectPath: '/p', capabilityId: 'playwright-web', enabled: true },
        mockSocket
      );

      expect(result).toEqual({
        success: true,
        enabledIds: ['omniscribe', 'playwright-web'],
      });
      expect(capState.toggle).toHaveBeenCalledWith('/p', 'playwright-web', true);
      expect(mockServer.emit).toHaveBeenCalledWith('mcp:capability-changed', {
        projectPath: '/p',
        enabledIds: ['omniscribe', 'playwright-web'],
      });
    });

    it('returns error for unknown capability id without broadcasting', () => {
      capRegistry.get.mockReturnValue(undefined);

      const result = gateway.handleCapabilityToggle(
        { projectPath: '/p', capabilityId: 'nope', enabled: true },
        mockSocket
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown capability: nope');
      expect(capState.toggle).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('returns error for missing projectPath', () => {
      const result = gateway.handleCapabilityToggle(
        { projectPath: '', capabilityId: 'x', enabled: true },
        mockSocket
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid projectPath: must be a non-empty string');
    });

    it('CAPABILITY_LIST surfaces electronCdpPort on playwright-electron descriptor', async () => {
      const cap: McpCapability = {
        id: 'playwright-electron',
        label: 'PE',
        description: 'd',
        buildConfig: jest.fn(),
      };
      capRegistry.list.mockReturnValue([cap]);
      capState.getEnabled.mockReturnValue([]);
      (capState.getElectronCdpPort as jest.Mock).mockReturnValue(9555);

      const result = await gateway.handleCapabilityList({ projectPath: '/p' }, mockSocket);

      expect(result.capabilities[0].electronCdpPort).toBe(9555);
      expect(capState.getElectronCdpPort).toHaveBeenCalledWith('/p');
    });

    it('returns error when capState.toggle throws', () => {
      capRegistry.get.mockReturnValue({
        id: 'playwright-web',
        label: 'PW',
        description: '',
        buildConfig: jest.fn(),
      } satisfies McpCapability);
      capState.toggle.mockImplementation(() => {
        throw new Error('boom');
      });

      const result = gateway.handleCapabilityToggle(
        { projectPath: '/p', capabilityId: 'playwright-web', enabled: true },
        mockSocket
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });
  });

  // ================================================================
  // handleCapabilitySetPort
  // ================================================================
  describe('handleCapabilitySetPort', () => {
    beforeEach(() => {
      capRegistry.get.mockReturnValue({
        id: 'playwright-electron',
        label: 'PE',
        description: '',
        buildConfig: jest.fn(),
      } satisfies McpCapability);
    });

    it('persists the port and broadcasts CAPABILITY_CHANGED', () => {
      capState.getEnabled.mockReturnValue(['playwright-electron']);

      const result = gateway.handleCapabilitySetPort(
        { projectPath: '/p', capabilityId: 'playwright-electron', port: 9555 },
        mockSocket
      );

      expect(result).toEqual({ success: true, port: 9555 });
      expect(capState.setElectronCdpPort).toHaveBeenCalledWith('/p', 9555);
      expect(mockServer.emit).toHaveBeenCalledWith('mcp:capability-changed', {
        projectPath: '/p',
        enabledIds: ['playwright-electron'],
      });
    });

    it('rejects ports below 1024', () => {
      const result = gateway.handleCapabilitySetPort(
        { projectPath: '/p', capabilityId: 'playwright-electron', port: 80 },
        mockSocket
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/between 1024 and 65535/);
      expect(capState.setElectronCdpPort).not.toHaveBeenCalled();
    });

    it('rejects ports above 65535', () => {
      const result = gateway.handleCapabilitySetPort(
        { projectPath: '/p', capabilityId: 'playwright-electron', port: 70000 },
        mockSocket
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/between 1024 and 65535/);
    });

    it('rejects non-integer ports', () => {
      const result = gateway.handleCapabilitySetPort(
        { projectPath: '/p', capabilityId: 'playwright-electron', port: 9222.5 },
        mockSocket
      );
      expect(result.success).toBe(false);
    });

    it('rejects unknown capability ids', () => {
      capRegistry.get.mockReturnValue(undefined);
      const result = gateway.handleCapabilitySetPort(
        { projectPath: '/p', capabilityId: 'nope', port: 9222 },
        mockSocket
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown capability: nope');
    });

    it('rejects capabilities that do not accept a port', () => {
      capRegistry.get.mockReturnValue({
        id: 'playwright-web',
        label: 'PW',
        description: '',
        buildConfig: jest.fn(),
      } satisfies McpCapability);
      const result = gateway.handleCapabilitySetPort(
        { projectPath: '/p', capabilityId: 'playwright-web', port: 9222 },
        mockSocket
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not accept a port/);
    });

    it('rejects empty projectPath', () => {
      const result = gateway.handleCapabilitySetPort(
        { projectPath: '', capabilityId: 'playwright-electron', port: 9222 },
        mockSocket
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/projectPath/);
    });
  });
});
