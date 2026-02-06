import { Test, TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { TerminalGateway } from './terminal.gateway';
import { TerminalService } from './terminal.service';

// ---------------------------------------------------------------------------
// Mock factories
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
  const server = {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  } as unknown as Server;
  return server;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TerminalGateway', () => {
  let gateway: TerminalGateway;
  let terminalService: jest.Mocked<TerminalService>;
  let mockServer: Server;

  beforeEach(async () => {
    // Reset static Maps between tests
    (TerminalGateway as any).clientSessions = new Map();
    (TerminalGateway as any).connectedClients = new Map();

    terminalService = {
      spawn: jest.fn().mockReturnValue(1),
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn().mockResolvedValue(undefined),
      hasSession: jest.fn().mockReturnValue(true),
      getScrollback: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<TerminalService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [TerminalGateway, { provide: TerminalService, useValue: terminalService }],
    }).compile();

    gateway = module.get<TerminalGateway>(TerminalGateway);

    mockServer = createMockServer();
    gateway.server = mockServer;
  });

  // =========================================================================
  // afterInit
  // =========================================================================

  describe('afterInit', () => {
    it('should complete without errors', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  // =========================================================================
  // handleConnection
  // =========================================================================

  describe('handleConnection', () => {
    it('should create a new session set for a new client', () => {
      const client = createMockSocket('new-client');

      gateway.handleConnection(client);

      // The client should now be tracked
      expect(gateway.getClientSocket('new-client')).toBe(client);
    });

    it('should store the client socket reference', () => {
      const client = createMockSocket('c1');

      gateway.handleConnection(client);

      expect(gateway.getClientSocket('c1')).toBe(client);
    });

    it('should not clear existing sessions on reconnection', () => {
      const client1 = createMockSocket('c1');
      gateway.handleConnection(client1);

      // Register a session for this client externally
      gateway.registerClientSession('c1', 42);

      // Simulate reconnection with same client ID but new socket object
      const client1Reconnect = createMockSocket('c1');
      gateway.handleConnection(client1Reconnect);

      const sessions = (TerminalGateway as any).clientSessions.get('c1') as Set<number>;
      expect(sessions).toBeDefined();
      expect(sessions.has(42)).toBe(true);
    });

    it('should update the socket reference on reconnection', () => {
      const client1 = createMockSocket('c1');
      gateway.handleConnection(client1);

      const client1Reconnect = createMockSocket('c1');
      gateway.handleConnection(client1Reconnect);

      expect(gateway.getClientSocket('c1')).toBe(client1Reconnect);
    });
  });

  // =========================================================================
  // handleDisconnect
  // =========================================================================

  describe('handleDisconnect', () => {
    it('should remove client tracking data', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      gateway.handleDisconnect(client);

      expect(gateway.getClientSocket('c1')).toBeUndefined();
    });

    it('should remove the session set for the client', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 10);

      gateway.handleDisconnect(client);

      const sessions = (TerminalGateway as any).clientSessions.get('c1');
      expect(sessions).toBeUndefined();
    });

    it('should not kill terminal sessions on disconnect', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      // Spawn a terminal
      gateway.handleSpawn(client, { cwd: '/tmp' });

      gateway.handleDisconnect(client);

      // kill should NOT have been called
      expect(terminalService.kill).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleSpawn
  // =========================================================================

  describe('handleSpawn', () => {
    it('should delegate to terminalService.spawn and return sessionId', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      terminalService.spawn.mockReturnValue(7);
      const result = gateway.handleSpawn(client, { cwd: '/projects/app' });

      expect(terminalService.spawn).toHaveBeenCalledWith('/projects/app', undefined);
      expect(result).toEqual({ sessionId: 7 });
    });

    it('should pass env to terminalService.spawn', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      const env = { NODE_ENV: 'test' };
      gateway.handleSpawn(client, { cwd: '/app', env });

      expect(terminalService.spawn).toHaveBeenCalledWith('/app', env);
    });

    it('should track session ownership for the client', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      terminalService.spawn.mockReturnValue(5);
      gateway.handleSpawn(client, { cwd: '/app' });

      const sessions = (TerminalGateway as any).clientSessions.get('c1') as Set<number>;
      expect(sessions.has(5)).toBe(true);
    });

    it('should join the terminal room', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      terminalService.spawn.mockReturnValue(3);
      gateway.handleSpawn(client, { cwd: '/app' });

      expect(client.join).toHaveBeenCalledWith('terminal:3');
    });

    it('should handle undefined payload fields gracefully', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      terminalService.spawn.mockReturnValue(1);
      const result = gateway.handleSpawn(client, {} as any);

      expect(terminalService.spawn).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual({ sessionId: 1 });
    });
  });

  // =========================================================================
  // handleInput
  // =========================================================================

  describe('handleInput', () => {
    it('should write data to the terminal session', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleInput(client, { sessionId: 1, data: 'ls -la\n' });

      expect(terminalService.write).toHaveBeenCalledWith(1, 'ls -la\n');
    });

    it('should not write if session does not exist', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(false);

      gateway.handleInput(client, { sessionId: 999, data: 'echo hi' });

      expect(terminalService.write).not.toHaveBeenCalled();
    });

    it('should reject non-string data', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleInput(client, { sessionId: 1, data: 123 as any });

      expect(terminalService.write).not.toHaveBeenCalled();
    });

    it('should reject data exceeding 1MB', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      const largeData = 'x'.repeat(1_048_577); // 1MB + 1 byte
      gateway.handleInput(client, { sessionId: 1, data: largeData });

      expect(terminalService.write).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleResize
  // =========================================================================

  describe('handleResize', () => {
    it('should resize the terminal session', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: 120, rows: 40 });

      expect(terminalService.resize).toHaveBeenCalledWith(1, 120, 40);
    });

    it('should not resize if session does not exist', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(false);

      gateway.handleResize(client, { sessionId: 999, cols: 80, rows: 24 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should reject invalid dimensions (zero)', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: 0, rows: 0 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should reject invalid dimensions (negative)', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: -10, rows: 24 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should reject non-finite dimensions', () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: NaN, rows: 24 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleKill
  // =========================================================================

  describe('handleKill', () => {
    it('should kill the terminal and return success', async () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(true);

      const result = await gateway.handleKill(client, { sessionId: 1 });

      expect(terminalService.kill).toHaveBeenCalledWith(1);
      expect(result).toEqual({ success: true });
    });

    it('should clean up session tracking for all clients', async () => {
      const client1 = createMockSocket('c1');
      const client2 = createMockSocket('c2');
      gateway.handleConnection(client1);
      gateway.handleConnection(client2);

      // Both clients own session 5
      gateway.registerClientSession('c1', 5);
      gateway.registerClientSession('c2', 5);

      terminalService.hasSession.mockReturnValue(true);

      await gateway.handleKill(client1, { sessionId: 5 });

      const sessions1 = (TerminalGateway as any).clientSessions.get('c1') as Set<number>;
      const sessions2 = (TerminalGateway as any).clientSessions.get('c2') as Set<number>;
      expect(sessions1.has(5)).toBe(false);
      expect(sessions2.has(5)).toBe(false);
    });

    it('should leave the terminal room', async () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(true);

      await gateway.handleKill(client, { sessionId: 3 });

      expect(client.leave).toHaveBeenCalledWith('terminal:3');
    });

    it('should return failure for non-existent session', async () => {
      const client = createMockSocket('c1');
      terminalService.hasSession.mockReturnValue(false);

      const result = await gateway.handleKill(client, { sessionId: 999 });

      expect(terminalService.kill).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Terminal session 999 not found',
      });
    });
  });

  // =========================================================================
  // handleJoin
  // =========================================================================

  describe('handleJoin', () => {
    it('should join the room and track ownership', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(true);

      const result = gateway.handleJoin(client, { sessionId: 10 });

      expect(client.join).toHaveBeenCalledWith('terminal:10');
      expect(result).toEqual({ success: true, scrollback: undefined });

      const sessions = (TerminalGateway as any).clientSessions.get('c1') as Set<number>;
      expect(sessions.has(10)).toBe(true);
    });

    it('should return scrollback data when available', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(true);
      terminalService.getScrollback.mockReturnValue('previous output data');

      const result = gateway.handleJoin(client, { sessionId: 10 });

      expect(result).toEqual({ success: true, scrollback: 'previous output data' });
    });

    it('should return error for non-existent session', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(false);

      const result = gateway.handleJoin(client, { sessionId: 999 });

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Terminal session 999 not found',
      });
    });
  });

  // =========================================================================
  // registerClientSession
  // =========================================================================

  describe('registerClientSession', () => {
    it('should create a new set if client has no sessions yet', () => {
      gateway.registerClientSession('unknown-client', 42);

      const sessions = (TerminalGateway as any).clientSessions.get('unknown-client') as Set<number>;
      expect(sessions).toBeDefined();
      expect(sessions.has(42)).toBe(true);
    });

    it('should add to existing set', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      gateway.registerClientSession('c1', 10);
      gateway.registerClientSession('c1', 20);

      const sessions = (TerminalGateway as any).clientSessions.get('c1') as Set<number>;
      expect(sessions.has(10)).toBe(true);
      expect(sessions.has(20)).toBe(true);
    });
  });

  // =========================================================================
  // getClientSocket
  // =========================================================================

  describe('getClientSocket', () => {
    it('should return the socket for a connected client', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      expect(gateway.getClientSocket('c1')).toBe(client);
    });

    it('should return undefined for an unknown client', () => {
      expect(gateway.getClientSocket('nonexistent')).toBeUndefined();
    });
  });

  // =========================================================================
  // handleTerminalOutput
  // =========================================================================

  describe('handleTerminalOutput', () => {
    it('should emit via server.to(room) when server is available', () => {
      gateway.handleTerminalOutput({ sessionId: 5, data: 'hello world' });

      expect(mockServer.to).toHaveBeenCalledWith('terminal:5');
      expect(mockServer.emit).toHaveBeenCalledWith('terminal:output', {
        sessionId: 5,
        data: 'hello world',
      });
    });

    it('should fallback to direct client emit when server is undefined', () => {
      // Remove server
      gateway.server = undefined as any;

      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 3);

      gateway.handleTerminalOutput({ sessionId: 3, data: 'fallback data' });

      expect(client.emit).toHaveBeenCalledWith('terminal:output', {
        sessionId: 3,
        data: 'fallback data',
      });
    });

    it('should emit to all clients that own the session in fallback mode', () => {
      gateway.server = undefined as any;

      const client1 = createMockSocket('c1');
      const client2 = createMockSocket('c2');
      gateway.handleConnection(client1);
      gateway.handleConnection(client2);
      gateway.registerClientSession('c1', 7);
      gateway.registerClientSession('c2', 7);

      gateway.handleTerminalOutput({ sessionId: 7, data: 'broadcast' });

      expect(client1.emit).toHaveBeenCalledWith('terminal:output', {
        sessionId: 7,
        data: 'broadcast',
      });
      expect(client2.emit).toHaveBeenCalledWith('terminal:output', {
        sessionId: 7,
        data: 'broadcast',
      });
    });

    it('should not emit to clients that do not own the session in fallback mode', () => {
      gateway.server = undefined as any;

      const owner = createMockSocket('owner');
      const bystander = createMockSocket('bystander');
      gateway.handleConnection(owner);
      gateway.handleConnection(bystander);
      gateway.registerClientSession('owner', 2);
      // bystander does NOT own session 2

      gateway.handleTerminalOutput({ sessionId: 2, data: 'private' });

      expect(owner.emit).toHaveBeenCalled();
      expect(bystander.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleTerminalClosed
  // =========================================================================

  describe('handleTerminalClosed', () => {
    it('should emit via server.to(room) when server is available', () => {
      gateway.handleTerminalClosed({ sessionId: 4, exitCode: 0 });

      expect(mockServer.to).toHaveBeenCalledWith('terminal:4');
      expect(mockServer.emit).toHaveBeenCalledWith('terminal:closed', {
        sessionId: 4,
        exitCode: 0,
        signal: undefined,
      });
    });

    it('should include signal in the payload', () => {
      gateway.handleTerminalClosed({ sessionId: 4, exitCode: 1, signal: 9 });

      expect(mockServer.emit).toHaveBeenCalledWith('terminal:closed', {
        sessionId: 4,
        exitCode: 1,
        signal: 9,
      });
    });

    it('should fallback to direct client emit when server is undefined', () => {
      gateway.server = undefined as any;

      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 6);

      gateway.handleTerminalClosed({ sessionId: 6, exitCode: 130 });

      expect(client.emit).toHaveBeenCalledWith('terminal:closed', {
        sessionId: 6,
        exitCode: 130,
        signal: undefined,
      });
    });

    it('should emit to all clients that own the session in fallback mode', () => {
      gateway.server = undefined as any;

      const client1 = createMockSocket('c1');
      const client2 = createMockSocket('c2');
      gateway.handleConnection(client1);
      gateway.handleConnection(client2);
      gateway.registerClientSession('c1', 8);
      gateway.registerClientSession('c2', 8);

      gateway.handleTerminalClosed({ sessionId: 8, exitCode: 0 });

      expect(client1.emit).toHaveBeenCalledWith('terminal:closed', {
        sessionId: 8,
        exitCode: 0,
        signal: undefined,
      });
      expect(client2.emit).toHaveBeenCalledWith('terminal:closed', {
        sessionId: 8,
        exitCode: 0,
        signal: undefined,
      });
    });

    it('should not emit to clients that do not own the session in fallback mode', () => {
      gateway.server = undefined as any;

      const owner = createMockSocket('owner');
      const other = createMockSocket('other');
      gateway.handleConnection(owner);
      gateway.handleConnection(other);
      gateway.registerClientSession('owner', 9);

      gateway.handleTerminalClosed({ sessionId: 9, exitCode: 0 });

      expect(owner.emit).toHaveBeenCalled();
      expect(other.emit).not.toHaveBeenCalled();
    });
  });
});
