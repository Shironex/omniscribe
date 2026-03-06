import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { McpStatusServerService } from './mcp-status-server.service';
import { McpSessionRegistryService } from './services/mcp-session-registry.service';
import * as http from 'http';

// Mock swarm modules to prevent transitive electron-store import chain
// and provide the class tokens for ModuleRef.get()
const mockSwarmService = {
  getAgentsForSwarm: jest.fn().mockReturnValue([]),
  getSwarmContext: jest.fn(),
  spawnTeammate: jest.fn(),
  addTaskToAgent: jest.fn(),
};
const mockSwarmTaskService = {
  getAssignment: jest.fn(),
  reportResult: jest.fn(),
  claimFiles: jest.fn(),
  releaseFiles: jest.fn(),
  createTask: jest.fn(),
};
const mockSwarmMessagingService = {
  sendMessage: jest.fn(),
  getMessages: jest.fn(),
  markRead: jest.fn(),
};

jest.mock('../swarm/swarm.service', () => ({
  SwarmService: class MockSwarmService {},
}));
jest.mock('../swarm/swarm-task.service', () => ({
  SwarmTaskService: class MockSwarmTaskService {},
}));
jest.mock('../swarm/swarm-messaging.service', () => ({
  SwarmMessagingService: class MockSwarmMessagingService {},
}));

// Mock only crypto.randomUUID while keeping the rest of crypto intact
// (NestJS uses crypto.createHash internally for module tokens)
jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    randomUUID: jest.fn(() => 'test-uuid-1234'),
  };
});

// Mock http module
jest.mock('http', () => {
  const mockServer = {
    listen: jest.fn(),
    close: jest.fn(),
    once: jest.fn().mockReturnThis(),
  };

  return {
    createServer: jest.fn(() => mockServer),
    __mockServer: mockServer,
  };
});

const httpModule = http as unknown as {
  createServer: jest.Mock;
  __mockServer: {
    listen: jest.Mock;
    close: jest.Mock;
    once: jest.Mock;
  };
};

/** Helper: creates a mock ModuleRef that returns our swarm service mocks */
function createMockModuleRef() {
  return {
    get: jest.fn((token: unknown) => {
      const { SwarmService } = jest.requireMock('../swarm/swarm.service');
      const { SwarmTaskService } = jest.requireMock('../swarm/swarm-task.service');
      const { SwarmMessagingService } = jest.requireMock('../swarm/swarm-messaging.service');
      if (token === SwarmService) return mockSwarmService;
      if (token === SwarmTaskService) return mockSwarmTaskService;
      if (token === SwarmMessagingService) return mockSwarmMessagingService;
      return undefined;
    }),
  } as unknown as jest.Mocked<ModuleRef>;
}

describe('McpStatusServerService', () => {
  let service: McpStatusServerService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let sessionRegistry: jest.Mocked<McpSessionRegistryService>;

  beforeEach(async () => {
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    sessionRegistry = {
      getProjectPath: jest.fn(),
      getRegisteredSessions: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<McpSessionRegistryService>;

    // Reset swarm mocks
    mockSwarmService.getAgentsForSwarm.mockReturnValue([]);
    mockSwarmService.getSwarmContext.mockReset();
    mockSwarmService.spawnTeammate.mockReset();
    mockSwarmService.addTaskToAgent.mockReset();
    mockSwarmTaskService.getAssignment.mockReset();
    mockSwarmTaskService.reportResult.mockReset();
    mockSwarmTaskService.claimFiles.mockReset();
    mockSwarmTaskService.releaseFiles.mockReset();
    mockSwarmTaskService.createTask.mockReset();
    mockSwarmMessagingService.sendMessage.mockReset();
    mockSwarmMessagingService.getMessages.mockReset();
    mockSwarmMessagingService.markRead.mockReset();

    // Reset mocks
    httpModule.createServer.mockClear();
    httpModule.__mockServer.listen.mockClear();
    httpModule.__mockServer.close.mockClear();
    httpModule.__mockServer.once.mockClear();
    httpModule.__mockServer.once.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpStatusServerService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: McpSessionRegistryService, useValue: sessionRegistry },
        { provide: ModuleRef, useValue: createMockModuleRef() },
      ],
    }).compile();

    service = module.get<McpStatusServerService>(McpStatusServerService);
  });

  describe('getInstanceId', () => {
    it('should return the generated instance ID', () => {
      expect(service.getInstanceId()).toBe('test-uuid-1234');
    });
  });

  describe('isRunning', () => {
    it('should return false before server is started', () => {
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('getPort', () => {
    it('should return null before server is started', () => {
      expect(service.getPort()).toBeNull();
    });
  });

  describe('getStatusUrl', () => {
    it('should return null when server is not running', () => {
      expect(service.getStatusUrl()).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('should be callable without error when server is not running', async () => {
      await service.onModuleDestroy();

      expect(service.isRunning()).toBe(false);
    });
  });

  describe('public API consistency', () => {
    it('should have consistent state when not running', () => {
      expect(service.isRunning()).toBe(false);
      expect(service.getPort()).toBeNull();
      expect(service.getStatusUrl()).toBeNull();
      expect(service.getInstanceId()).toBe('test-uuid-1234');
    });
  });
});

/**
 * Integration-style tests for the HTTP request handling logic.
 * These exercise handleRequest and handleStatusUpdate via a captured
 * request handler from http.createServer().
 */
describe('McpStatusServerService - Request Handling', () => {
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let sessionRegistry: jest.Mocked<McpSessionRegistryService>;
  let requestHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null;
  let mainServer: {
    listen: jest.Mock;
    close: jest.Mock;
    once: jest.Mock;
  };

  beforeEach(() => {
    requestHandler = null;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    sessionRegistry = {
      getProjectPath: jest.fn(),
      getRegisteredSessions: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<McpSessionRegistryService>;

    // Reset swarm mocks
    mockSwarmService.getAgentsForSwarm.mockReturnValue([]);
    mockSwarmService.getSwarmContext.mockReset();
    mockSwarmService.spawnTeammate.mockReset();
    mockSwarmService.addTaskToAgent.mockReset();
    mockSwarmTaskService.getAssignment.mockReset();
    mockSwarmTaskService.reportResult.mockReset();
    mockSwarmTaskService.claimFiles.mockReset();
    mockSwarmTaskService.releaseFiles.mockReset();
    mockSwarmTaskService.createTask.mockReset();
    mockSwarmMessagingService.sendMessage.mockReset();
    mockSwarmMessagingService.getMessages.mockReset();
    mockSwarmMessagingService.markRead.mockReset();

    mainServer = {
      listen: jest.fn(),
      close: jest.fn(),
      once: jest.fn().mockReturnThis(),
    };

    /**
     * http.createServer is called in two contexts:
     * 1. findAvailablePort() - no handler argument, creates test servers to probe ports
     * 2. startServer() - with handler argument, creates the actual server
     *
     * We need to handle both. For port probing we simulate the port being available.
     * For the real server we capture the handler.
     */
    httpModule.createServer.mockImplementation((handler?: unknown) => {
      if (typeof handler === 'function') {
        // This is the real server creation with request handler
        requestHandler = handler as (req: http.IncomingMessage, res: http.ServerResponse) => void;
        return mainServer;
      }

      // This is a port-probing server from findAvailablePort
      const testServer = {
        listen: jest.fn(),
        close: jest.fn((cb?: () => void) => {
          if (cb) cb();
        }),
        once: jest.fn().mockReturnThis(),
      };

      // When listen is called, simulate the port being available
      testServer.listen.mockImplementation(() => {
        // Find and invoke the 'listening' callback
        const listeningCall = testServer.once.mock.calls.find(
          (c: unknown[]) => c[0] === 'listening'
        );
        if (listeningCall) {
          (listeningCall[1] as () => void)();
        }
      });

      return testServer;
    });

    // The real server's listen should invoke its callback
    mainServer.listen.mockImplementation((_port: number, _host: string, callback: () => void) => {
      callback();
    });
  });

  async function initService(): Promise<McpStatusServerService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpStatusServerService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: McpSessionRegistryService, useValue: sessionRegistry },
        { provide: ModuleRef, useValue: createMockModuleRef() },
      ],
    }).compile();

    const svc = module.get<McpStatusServerService>(McpStatusServerService);
    await svc.onModuleInit();
    return svc;
  }

  function simulateRequest(
    method: string,
    url: string,
    body: string
  ): { req: http.IncomingMessage; res: http.ServerResponse } {
    const dataCallbacks: Array<(chunk: string) => void> = [];
    const endCallbacks: Array<() => void> = [];

    const req = {
      method,
      url,
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'data') dataCallbacks.push(cb as (chunk: string) => void);
        if (event === 'end') endCallbacks.push(cb as () => void);
      }),
      destroy: jest.fn(),
    } as unknown as http.IncomingMessage;

    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as unknown as http.ServerResponse;

    // Invoke the handler
    if (requestHandler) {
      requestHandler(req, res);
    }

    // Send body data and end
    for (const cb of dataCallbacks) {
      cb(body);
    }
    for (const cb of endCallbacks) {
      cb();
    }

    return { req, res };
  }

  it('should return 404 for non-POST requests', async () => {
    await initService();

    const { res } = simulateRequest('GET', '/status', '');

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(404, {
      'Content-Type': 'application/json',
    });
  });

  it('should return 404 for non-POST requests to /tasks', async () => {
    await initService();

    const { res } = simulateRequest('GET', '/tasks', '');

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(404, {
      'Content-Type': 'application/json',
    });
  });

  it('should return 404 for POST to wrong path', async () => {
    await initService();

    const { res } = simulateRequest('POST', '/other', '{}');

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(404, {
      'Content-Type': 'application/json',
    });
  });

  it('should return 400 for invalid JSON body', async () => {
    await initService();

    const { res } = simulateRequest('POST', '/status', 'not json');

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(400, {
      'Content-Type': 'application/json',
    });
  });

  it('should return 400 for invalid JSON body on /tasks', async () => {
    await initService();

    const { res } = simulateRequest('POST', '/tasks', 'not json');

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(400, {
      'Content-Type': 'application/json',
    });
  });

  it('should reject status update with wrong instance ID', async () => {
    await initService();

    const payload = JSON.stringify({
      sessionId: 'session-1',
      instanceId: 'wrong-instance',
      state: 'working',
      timestamp: new Date().toISOString(),
    });

    const { res } = simulateRequest('POST', '/status', payload);

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });
    const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
    expect(responseBody.accepted).toBe(false);
    expect(responseBody.reason).toBe('instance_mismatch');
  });

  it('should reject status update for unknown session', async () => {
    sessionRegistry.getProjectPath.mockReturnValue(undefined);

    await initService();

    const payload = JSON.stringify({
      sessionId: 'unknown-session',
      instanceId: 'test-uuid-1234',
      state: 'working',
      timestamp: new Date().toISOString(),
    });

    const { res } = simulateRequest('POST', '/status', payload);

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });
    const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
    expect(responseBody.accepted).toBe(false);
    expect(responseBody.reason).toBe('unknown_session');
  });

  it('should accept valid status update and emit MCP_STATUS_RECEIVED event', async () => {
    sessionRegistry.getProjectPath.mockReturnValue('/project');

    await initService();

    const payload = JSON.stringify({
      sessionId: 'session-1',
      instanceId: 'test-uuid-1234',
      state: 'working',
      message: 'Processing request',
      timestamp: new Date().toISOString(),
    });

    const { res } = simulateRequest('POST', '/status', payload);

    expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });
    const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
    expect(responseBody.accepted).toBe(true);

    expect(eventEmitter.emit).toHaveBeenCalledWith('session.mcp-status-received', {
      sessionId: 'session-1',
      status: 'working',
      message: 'Processing request',
      needsInputPrompt: undefined,
    });
  });

  it('should pass needsInputPrompt in emitted event', async () => {
    sessionRegistry.getProjectPath.mockReturnValue('/project');

    await initService();

    const payload = JSON.stringify({
      sessionId: 'session-1',
      instanceId: 'test-uuid-1234',
      state: 'needs_input',
      message: 'Waiting for input',
      needsInputPrompt: 'Please provide API key',
      timestamp: new Date().toISOString(),
    });

    simulateRequest('POST', '/status', payload);

    expect(eventEmitter.emit).toHaveBeenCalledWith('session.mcp-status-received', {
      sessionId: 'session-1',
      status: 'needs_input',
      message: 'Waiting for input',
      needsInputPrompt: 'Please provide API key',
    });
  });

  it('should report as running after init', async () => {
    const svc = await initService();

    expect(svc.isRunning()).toBe(true);
    expect(svc.getPort()).not.toBeNull();
    expect(svc.getStatusUrl()).toContain('/status');
  });

  it('should include port in status URL', async () => {
    const svc = await initService();
    const port = svc.getPort();
    const url = svc.getStatusUrl();

    expect(url).toBe(`http://127.0.0.1:${port}/status`);
  });

  it('should stop server on module destroy', async () => {
    const svc = await initService();

    mainServer.close.mockImplementation((cb: () => void) => {
      cb();
    });

    await svc.onModuleDestroy();

    expect(mainServer.close).toHaveBeenCalled();
    expect(svc.isRunning()).toBe(false);
    expect(svc.getPort()).toBeNull();
  });

  // ================================================================
  // POST /tasks
  // ================================================================
  describe('POST /tasks', () => {
    it('should accept valid task payload and emit session.tasks event', async () => {
      sessionRegistry.getProjectPath.mockReturnValue('/project');

      await initService();

      const payload = JSON.stringify({
        sessionId: 'session-1',
        instanceId: 'test-uuid-1234',
        tasks: [
          { id: 'task-1', subject: 'Implement feature', status: 'in_progress' },
          { id: 'task-2', subject: 'Write tests', status: 'pending' },
        ],
        timestamp: new Date().toISOString(),
      });

      const { res } = simulateRequest('POST', '/tasks', payload);

      expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
      });
      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(true);

      expect(eventEmitter.emit).toHaveBeenCalledWith('session.tasks', {
        sessionId: 'session-1',
        tasks: [
          { id: 'task-1', subject: 'Implement feature', status: 'in_progress' },
          { id: 'task-2', subject: 'Write tests', status: 'pending' },
        ],
      });
    });

    it('should reject task update with wrong instance ID', async () => {
      await initService();

      const payload = JSON.stringify({
        sessionId: 'session-1',
        instanceId: 'wrong-instance',
        tasks: [{ id: 'task-1', subject: 'Do something', status: 'pending' }],
        timestamp: new Date().toISOString(),
      });

      const { res } = simulateRequest('POST', '/tasks', payload);

      expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
      });
      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(false);
      expect(responseBody.reason).toBe('instance_mismatch');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject task update for unknown session', async () => {
      sessionRegistry.getProjectPath.mockReturnValue(undefined);

      await initService();

      const payload = JSON.stringify({
        sessionId: 'unknown-session',
        instanceId: 'test-uuid-1234',
        tasks: [{ id: 'task-1', subject: 'Do something', status: 'pending' }],
        timestamp: new Date().toISOString(),
      });

      const { res } = simulateRequest('POST', '/tasks', payload);

      expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
      });
      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(false);
      expect(responseBody.reason).toBe('unknown_session');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle empty tasks array', async () => {
      sessionRegistry.getProjectPath.mockReturnValue('/project');

      await initService();

      const payload = JSON.stringify({
        sessionId: 'session-1',
        instanceId: 'test-uuid-1234',
        tasks: [],
        timestamp: new Date().toISOString(),
      });

      const { res } = simulateRequest('POST', '/tasks', payload);

      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(true);

      expect(eventEmitter.emit).toHaveBeenCalledWith('session.tasks', {
        sessionId: 'session-1',
        tasks: [],
      });
    });

    it('should handle payload with multiple tasks', async () => {
      sessionRegistry.getProjectPath.mockReturnValue('/project');

      await initService();

      const tasks = [
        { id: 'task-1', subject: 'Task one', status: 'completed' },
        { id: 'task-2', subject: 'Task two', status: 'in_progress' },
        { id: 'task-3', subject: 'Task three', status: 'pending' },
      ];

      const payload = JSON.stringify({
        sessionId: 'session-1',
        instanceId: 'test-uuid-1234',
        tasks,
        timestamp: new Date().toISOString(),
      });

      const { res } = simulateRequest('POST', '/tasks', payload);

      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(true);

      expect(eventEmitter.emit).toHaveBeenCalledWith('session.tasks', {
        sessionId: 'session-1',
        tasks,
      });
    });

    it('should handle payload with undefined tasks (defaults to empty array)', async () => {
      sessionRegistry.getProjectPath.mockReturnValue('/project');

      await initService();

      const payload = JSON.stringify({
        sessionId: 'session-1',
        instanceId: 'test-uuid-1234',
        timestamp: new Date().toISOString(),
      });

      const { res } = simulateRequest('POST', '/tasks', payload);

      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(true);

      expect(eventEmitter.emit).toHaveBeenCalledWith('session.tasks', {
        sessionId: 'session-1',
        tasks: [],
      });
    });
  });

  describe('POST /swarm/*', () => {
    const memberAgent = { id: 'agent-1', role: 'builder', sessionId: 'session-1' };
    const leadAgent = { id: 'agent-lead', role: 'lead', sessionId: 'session-1' };

    function initSwarmSession(agent: typeof memberAgent | typeof leadAgent = memberAgent) {
      sessionRegistry.getProjectPath.mockReturnValue('/project');
      mockSwarmService.getAgentsForSwarm.mockReturnValue([agent as any]);
    }

    function swarmPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        sessionId: 'session-1',
        instanceId: 'test-uuid-1234',
        swarmId: 'swarm-1',
        ...overrides,
      };
    }

    it('gets assignments and updates the agent task count', async () => {
      initSwarmSession();
      mockSwarmTaskService.getAssignment.mockReturnValue({
        id: 'task-1',
        swarmId: 'swarm-1',
      } as any);
      await initService();

      const { res } = simulateRequest(
        'POST',
        '/swarm/get-assignment',
        JSON.stringify(swarmPayload())
      );

      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(true);
      expect(responseBody.task.id).toBe('task-1');
      expect(mockSwarmTaskService.getAssignment).toHaveBeenCalledWith(
        'swarm-1',
        'agent-1',
        'builder'
      );
      expect(mockSwarmService.addTaskToAgent).toHaveBeenCalledWith('swarm-1', 'agent-1', 'task-1');
    });

    it('reports task results with the reporting agent id', async () => {
      initSwarmSession();
      mockSwarmTaskService.reportResult.mockReturnValue({
        id: 'task-1',
        status: 'completed',
      } as any);
      await initService();

      const { res } = simulateRequest(
        'POST',
        '/swarm/report-result',
        JSON.stringify(
          swarmPayload({
            taskId: 'task-1',
            result: 'done',
            status: 'completed',
          })
        )
      );

      const responseBody = JSON.parse((res.end as jest.Mock).mock.calls[0][0]);
      expect(responseBody.accepted).toBe(true);
      expect(mockSwarmTaskService.reportResult).toHaveBeenCalledWith(
        'swarm-1',
        'task-1',
        'agent-1',
        'done',
        'completed'
      );
    });

    it('claims and releases files for the validated agent', async () => {
      initSwarmSession();
      mockSwarmTaskService.claimFiles.mockReturnValue({ claimed: ['src/app.ts'], denied: [] });
      await initService();

      const claimRes = simulateRequest(
        'POST',
        '/swarm/claim-files',
        JSON.stringify(swarmPayload({ files: ['src/app.ts'] }))
      ).res;
      expect(JSON.parse((claimRes.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
        claimed: ['src/app.ts'],
        denied: [],
      });
      expect(mockSwarmTaskService.claimFiles).toHaveBeenCalledWith('swarm-1', 'agent-1', [
        'src/app.ts',
      ]);

      const releaseRes = simulateRequest(
        'POST',
        '/swarm/release-files',
        JSON.stringify(swarmPayload({ files: ['src/app.ts'] }))
      ).res;
      expect(JSON.parse((releaseRes.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
      });
      expect(mockSwarmTaskService.releaseFiles).toHaveBeenCalledWith('swarm-1', 'agent-1', [
        'src/app.ts',
      ]);
    });

    it('sends and fetches swarm messages, marking fetched messages as read', async () => {
      initSwarmSession();
      mockSwarmMessagingService.sendMessage.mockReturnValue({ id: 'msg-1' } as any);
      mockSwarmMessagingService.getMessages.mockReturnValue([
        { id: 'msg-1', content: 'hello' },
        { id: 'msg-2', content: 'world' },
      ] as any);
      await initService();

      const sendRes = simulateRequest(
        'POST',
        '/swarm/send-message',
        JSON.stringify(
          swarmPayload({
            toAgentId: 'agent-2',
            content: 'hello',
            type: 'info',
          })
        )
      ).res;
      expect(JSON.parse((sendRes.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
        message: { id: 'msg-1' },
      });
      expect(mockSwarmMessagingService.sendMessage).toHaveBeenCalledWith(
        'swarm-1',
        'agent-1',
        'agent-2',
        'hello',
        'info'
      );

      const getRes = simulateRequest(
        'POST',
        '/swarm/get-messages',
        JSON.stringify(swarmPayload())
      ).res;
      expect(JSON.parse((getRes.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
        messages: [
          { id: 'msg-1', content: 'hello' },
          { id: 'msg-2', content: 'world' },
        ],
      });
      expect(mockSwarmMessagingService.markRead).toHaveBeenCalledWith('swarm-1', [
        'msg-1',
        'msg-2',
      ]);
    });

    it('returns swarm context for members', async () => {
      initSwarmSession();
      mockSwarmService.getSwarmContext.mockReturnValue({
        swarm: { id: 'swarm-1' },
        agents: [],
        tasks: [],
        recentMessages: [],
      } as any);
      await initService();

      const { res } = simulateRequest('POST', '/swarm/get-context', JSON.stringify(swarmPayload()));

      expect(JSON.parse((res.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
        swarm: { id: 'swarm-1' },
        agents: [],
        tasks: [],
        recentMessages: [],
      });
    });

    it('allows only the lead agent to spawn teammates and create tasks', async () => {
      initSwarmSession();
      await initService();

      const spawnRes = simulateRequest(
        'POST',
        '/swarm/spawn-teammate',
        JSON.stringify(swarmPayload({ role: 'builder' }))
      ).res;
      expect(spawnRes.writeHead as jest.Mock).toHaveBeenCalledWith(403, {
        'Content-Type': 'application/json',
      });

      const taskRes = simulateRequest(
        'POST',
        '/swarm/create-task',
        JSON.stringify(swarmPayload({ subject: 'Create task' }))
      ).res;
      expect(taskRes.writeHead as jest.Mock).toHaveBeenCalledWith(403, {
        'Content-Type': 'application/json',
      });
    });

    it('spawns teammates and creates tasks for the lead agent', async () => {
      initSwarmSession(leadAgent);
      mockSwarmService.spawnTeammate.mockResolvedValue({ id: 'agent-2', role: 'builder' } as any);
      mockSwarmTaskService.createTask.mockReturnValue({ id: 'task-2', subject: 'Build it' } as any);
      await initService();

      const spawnRes = simulateRequest(
        'POST',
        '/swarm/spawn-teammate',
        JSON.stringify(swarmPayload({ role: 'builder', taskDescription: 'Build it' }))
      ).res;
      await Promise.resolve();
      expect(JSON.parse((spawnRes.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
        agent: { id: 'agent-2', role: 'builder' },
      });

      const taskRes = simulateRequest(
        'POST',
        '/swarm/create-task',
        JSON.stringify(
          swarmPayload({
            subject: 'Build it',
            description: 'Implement the feature',
            assignedRole: 'builder',
            dependsOn: ['task-1'],
          })
        )
      ).res;
      expect(JSON.parse((taskRes.end as jest.Mock).mock.calls[0][0])).toEqual({
        accepted: true,
        task: { id: 'task-2', subject: 'Build it' },
      });
      expect(mockSwarmTaskService.createTask).toHaveBeenCalledWith('swarm-1', {
        subject: 'Build it',
        description: 'Implement the feature',
        assignedRole: 'builder',
        dependsOn: ['task-1'],
      });
    });

    it('rejects swarm requests for sessions outside the swarm', async () => {
      sessionRegistry.getProjectPath.mockReturnValue('/project');
      mockSwarmService.getAgentsForSwarm.mockReturnValue([]);
      await initService();

      const { res } = simulateRequest('POST', '/swarm/get-context', JSON.stringify(swarmPayload()));

      expect(res.writeHead as jest.Mock).toHaveBeenCalledWith(400, {
        'Content-Type': 'application/json',
      });
      expect(JSON.parse((res.end as jest.Mock).mock.calls[0][0])).toEqual({
        error: 'Session is not a member of the specified swarm',
      });
    });
  });
});
