import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { McpStatusServerService } from './mcp-status-server.service';
import { McpSessionRegistryService } from './services/mcp-session-registry.service';
import * as http from 'http';

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

  it('should accept valid status update and emit event', async () => {
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

    expect(eventEmitter.emit).toHaveBeenCalledWith('session.status', {
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

    expect(eventEmitter.emit).toHaveBeenCalledWith('session.status', {
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
});
