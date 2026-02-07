/**
 * MCP Gateway Integration Tests
 *
 * Tests MCP server discovery, config writing, and status broadcast flows
 * with a real NestJS application and real socket.io connections.
 * All MCP sub-services are mocked at the service boundary.
 */
import { Module, INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Socket } from 'socket.io-client';
import { createTestApp, getAppPort } from '../../../test/integration/helpers/create-test-app';
import {
  createSocketClient,
  connectClient,
  waitForEvent,
  emitWithAck,
} from '../../../test/integration/helpers/socket-client';
import { McpGateway } from './mcp.gateway';
import { McpDiscoveryService } from './services/mcp-discovery.service';
import { McpWriterService } from './services/mcp-writer.service';
import { McpProjectCacheService } from './services/mcp-project-cache.service';
import { McpSessionRegistryService } from './services/mcp-session-registry.service';
import { McpTrackingService } from './services/mcp-tracking.service';
import { McpStatusServerService } from './mcp-status-server.service';

const mockServers = [
  { id: 'server-1', name: 'Test Server', command: 'node', args: ['server.js'], enabled: true },
];

describe('McpGateway (integration)', () => {
  let app: INestApplication;
  let client: Socket;
  let mockDiscoveryService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockDiscoveryService = {
      discoverServers: jest.fn().mockResolvedValue(mockServers),
    };

    const mockWriterService = {
      writeConfig: jest.fn().mockResolvedValue('/tmp/.mcp.json'),
      removeConfig: jest.fn().mockResolvedValue(true),
      generateProjectHash: jest.fn().mockReturnValue('hash123'),
      getInternalMcpInfo: jest.fn().mockReturnValue({
        serverPath: '/tmp/mcp-server',
        available: true,
      }),
    };

    const mockProjectCache = {
      getServers: jest.fn().mockReturnValue(mockServers),
      setServers: jest.fn(),
    };

    const mockSessionRegistry = {
      getEnabledServers: jest.fn().mockReturnValue(['server-1']),
      setEnabledServers: jest.fn(),
      clearEnabledServers: jest.fn(),
    };

    const mockTrackingService = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const mockStatusServer = {
      isRunning: jest.fn().mockReturnValue(true),
      getPort: jest.fn().mockReturnValue(9876),
      getStatusUrl: jest.fn().mockReturnValue('http://localhost:9876/status'),
      getInstanceId: jest.fn().mockReturnValue('test-instance'),
    };

    @Module({
      providers: [
        McpGateway,
        { provide: McpDiscoveryService, useValue: mockDiscoveryService },
        { provide: McpWriterService, useValue: mockWriterService },
        { provide: McpProjectCacheService, useValue: mockProjectCache },
        { provide: McpSessionRegistryService, useValue: mockSessionRegistry },
        { provide: McpTrackingService, useValue: mockTrackingService },
        { provide: McpStatusServerService, useValue: mockStatusServer },
      ],
    })
    class TestMcpModule {}

    app = await createTestApp({
      modules: [TestMcpModule],
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    client = createSocketClient(getAppPort(app));
    await connectClient(client);
  });

  afterEach(() => {
    client?.disconnect();
  });

  it('should handle mcp:discover and return servers', async () => {
    const response = await emitWithAck<{ servers: any[]; error?: string }>(client, 'mcp:discover', {
      projectPath: '/tmp/test-project',
    });

    expect(response.servers).toHaveLength(1);
    expect(response.servers[0].name).toBe('Test Server');
    expect(response.error).toBeUndefined();
    expect(mockDiscoveryService.discoverServers).toHaveBeenCalledWith('/tmp/test-project');
  });

  it('should handle mcp:get-servers and return cached servers', async () => {
    const response = await emitWithAck<{ servers: any[] }>(client, 'mcp:get-servers', {
      projectPath: '/tmp/test-project',
    });

    expect(response.servers).toHaveLength(1);
  });

  it('should handle mcp:get-enabled and return enabled server IDs', async () => {
    const response = await emitWithAck<{ serverIds: string[] }>(client, 'mcp:get-enabled', {
      projectPath: '/tmp/test-project',
      sessionId: 'session-1',
    });

    expect(response.serverIds).toEqual(['server-1']);
  });

  it('should handle mcp:set-enabled and broadcast change', async () => {
    // Set up a second client to verify broadcast
    const client2 = createSocketClient(getAppPort(app));
    await connectClient(client2);

    const broadcastPromise = waitForEvent<{
      projectPath: string;
      sessionId: string;
      serverIds: string[];
    }>(client2, 'mcp:enabled-changed');

    const response = await emitWithAck<{ success: boolean }>(client, 'mcp:set-enabled', {
      projectPath: '/tmp/test-project',
      sessionId: 'session-1',
      serverIds: ['server-1', 'server-2'],
    });

    expect(response.success).toBe(true);

    const broadcast = await broadcastPromise;
    expect(broadcast.serverIds).toEqual(['server-1', 'server-2']);

    client2.disconnect();
  });

  it('should handle mcp:get-status-server-info and return info', async () => {
    const response = await emitWithAck<{
      running: boolean;
      port: number;
      statusUrl: string;
      instanceId: string;
    }>(client, 'mcp:get-status-server-info', {});

    expect(response.running).toBe(true);
    expect(response.port).toBe(9876);
    expect(response.instanceId).toBe('test-instance');
  });

  it('should broadcast session:status when session.status event is emitted', async () => {
    const statusPromise = waitForEvent<{
      sessionId: string;
      status: string;
    }>(client, 'session:status');

    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('session.status', {
      sessionId: 'session-1',
      status: 'working',
      message: 'Processing...',
    });

    const status = await statusPromise;
    expect(status.sessionId).toBe('session-1');
    expect(status.status).toBe('working');
  });

  it('should return error for mcp:discover without projectPath', async () => {
    const response = await emitWithAck<{ servers: any[]; error?: string }>(
      client,
      'mcp:discover',
      {}
    );

    expect(response.error).toBe('projectPath is required');
    expect(response.servers).toEqual([]);
  });
});
