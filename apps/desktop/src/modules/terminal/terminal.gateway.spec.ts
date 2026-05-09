import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
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
    conn: {
      on: jest.fn(),
    },
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
    terminalService = {
      spawn: jest.fn().mockReturnValue(1),
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn().mockResolvedValue(undefined),
      hasSession: jest.fn().mockReturnValue(true),
      getScrollback: jest.fn().mockReturnValue(null),
      pause: jest.fn(),
      resume: jest.fn(),
    } as unknown as jest.Mocked<TerminalService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
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

      const sessions = (gateway as any).clientSessions.get('c1') as Set<number>;
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
    afterEach(() => {
      // Some tests in this block schedule deferred cleanup timers; switching
      // back to real timers prevents one test's pending callback from
      // mutating the next test's state. `useRealTimers()` is a safe no-op
      // when real timers are already active.
      jest.useRealTimers();
    });

    it('should remove client tracking data', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      gateway.handleDisconnect(client);

      expect(gateway.getClientSocket('c1')).toBeUndefined();
    });

    it('should preserve the session set during the CSR grace window', () => {
      jest.useFakeTimers();
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 10);

      gateway.handleDisconnect(client);

      // Ownership stays for the CSR grace window so a resumed socket.id
      // can keep input/resize/kill working without waiting for terminal:join.
      const sessions = (gateway as any).clientSessions.get('c1') as Set<number>;
      expect(sessions).toBeDefined();
      expect(sessions.has(10)).toBe(true);
    });

    it('should wipe the session set after the CSR grace window if no reconnect', () => {
      jest.useFakeTimers();
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 10);

      gateway.handleDisconnect(client);

      // Advance past the 30s CSR grace window.
      jest.advanceTimersByTime(30_001);

      const sessions = (gateway as any).clientSessions.get('c1');
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

    // Regression test for the CSR reconnect race (kirei-review I3, 2026-05-08).
    // Before deferring ownership cleanup, this sequence dropped input silently
    // because `handleDisconnect` wiped the ownership map immediately and
    // `terminal:input` arriving on the resumed socket no longer matched any
    // owned session. With deferred cleanup, the ownership map survives the
    // disconnect → reconnect transition and input flows through.
    it('preserves ownership across disconnect → CSR reconnect with same socket.id', () => {
      jest.useFakeTimers();
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      // Disconnect (CSR window starts).
      gateway.handleDisconnect(client);

      // Same socket.id resumes within the grace window (CSR semantics).
      const resumed = createMockSocket('c1');
      gateway.handleConnection(resumed);

      // Input arriving on the resumed socket BEFORE the renderer re-emits
      // terminal:join should still be accepted, because ownership was
      // preserved across the disconnect.
      gateway.handleInput(resumed, { sessionId: 1, data: 'still mine\n' });

      expect(terminalService.write).toHaveBeenCalledWith(1, 'still mine\n');

      // Advance past the original grace window — the cleanup timer was
      // cleared on reconnect, so ownership remains intact.
      jest.advanceTimersByTime(30_001);
      const sessions = (gateway as any).clientSessions.get('c1') as Set<number>;
      expect(sessions?.has(1)).toBe(true);
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

      const sessions = (gateway as any).clientSessions.get('c1') as Set<number>;
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

    it('should reject relative cwd', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      expect(() => gateway.handleSpawn(client, { cwd: 'not-absolute' })).toThrow(/absolute/);
      expect(terminalService.spawn).not.toHaveBeenCalled();
    });

    it('should reject non-string cwd', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      expect(() => gateway.handleSpawn(client, { cwd: 123 as unknown as string })).toThrow();
      expect(terminalService.spawn).not.toHaveBeenCalled();
    });

    it('should reject env that is not an object of string→string entries', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      expect(() =>
        gateway.handleSpawn(client, {
          env: 'string-not-object' as unknown as Record<string, string>,
        })
      ).toThrow();
      expect(() =>
        gateway.handleSpawn(client, { env: { GOOD: 'ok', BAD: 5 as unknown as string } })
      ).toThrow();
      expect(terminalService.spawn).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleInput
  // =========================================================================

  describe('handleInput', () => {
    it('should write data to the terminal session when owned', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleInput(client, { sessionId: 1, data: 'ls -la\n' });

      expect(terminalService.write).toHaveBeenCalledWith(1, 'ls -la\n');
    });

    it('should reject input when the client does not own the session', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      // No registerClientSession call — client is connected but owns nothing.
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleInput(client, { sessionId: 1, data: 'rm -rf /\n' });

      expect(terminalService.write).not.toHaveBeenCalled();
    });

    it('should reject input from a different client even if some other client owns it', () => {
      const owner = createMockSocket('owner');
      const stranger = createMockSocket('stranger');
      gateway.handleConnection(owner);
      gateway.handleConnection(stranger);
      gateway.registerClientSession('owner', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleInput(stranger, { sessionId: 1, data: 'attack' });

      expect(terminalService.write).not.toHaveBeenCalled();
    });

    it('should not write if session does not exist', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 999);
      terminalService.hasSession.mockReturnValue(false);

      gateway.handleInput(client, { sessionId: 999, data: 'echo hi' });

      expect(terminalService.write).not.toHaveBeenCalled();
    });

    it('should reject non-string data', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleInput(client, { sessionId: 1, data: 123 as any });

      expect(terminalService.write).not.toHaveBeenCalled();
    });

    it('should reject data exceeding 1MB', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
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
    it('should resize the terminal session when owned', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: 120, rows: 40 });

      expect(terminalService.resize).toHaveBeenCalledWith(1, 120, 40);
    });

    it('should reject resize when the client does not own the session', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: 120, rows: 40 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should not resize if session does not exist', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 999);
      terminalService.hasSession.mockReturnValue(false);

      gateway.handleResize(client, { sessionId: 999, cols: 80, rows: 24 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should reject invalid dimensions (zero)', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: 0, rows: 0 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should reject invalid dimensions (negative)', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: -10, rows: 24 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });

    it('should reject non-finite dimensions', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      gateway.handleResize(client, { sessionId: 1, cols: NaN, rows: 24 });

      expect(terminalService.resize).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleKill
  // =========================================================================

  describe('handleKill', () => {
    it('should kill the terminal and return success when owned', async () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 1);
      terminalService.hasSession.mockReturnValue(true);

      const result = await gateway.handleKill(client, { sessionId: 1 });

      expect(terminalService.kill).toHaveBeenCalledWith(1);
      expect(result).toEqual({ success: true });
    });

    it('should reject kill when the client does not own the session', async () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      terminalService.hasSession.mockReturnValue(true);

      const result = await gateway.handleKill(client, { sessionId: 1 });

      expect(terminalService.kill).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, error: 'Not authorized for this session' });
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

      const sessions1 = (gateway as any).clientSessions.get('c1') as Set<number>;
      const sessions2 = (gateway as any).clientSessions.get('c2') as Set<number>;
      expect(sessions1.has(5)).toBe(false);
      expect(sessions2.has(5)).toBe(false);
    });

    it('should leave the terminal room', async () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 3);
      terminalService.hasSession.mockReturnValue(true);

      await gateway.handleKill(client, { sessionId: 3 });

      expect(client.leave).toHaveBeenCalledWith('terminal:3');
    });

    it('should return failure for non-existent session', async () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);
      gateway.registerClientSession('c1', 999);
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

      const sessions = (gateway as any).clientSessions.get('c1') as Set<number>;
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

    // Documents the current trust model (kirei-review I4, 2026-05-08).
    // terminal:join grants ownership to any authenticated socket that knows a
    // sessionId. The WS auth token is the gate; sessionIds themselves are
    // sequential and not secret. If this assertion fails, the trust model
    // has changed — see the TODO(security) comment near handleJoin and the
    // review doc before relaxing the test.
    it('grants ownership to any authenticated socket that calls join with a known sessionId', () => {
      const owner = createMockSocket('owner');
      const stranger = createMockSocket('stranger');
      gateway.handleConnection(owner);
      gateway.handleConnection(stranger);

      // owner spawned session 1
      terminalService.spawn.mockReturnValue(1);
      gateway.handleSpawn(owner, { cwd: '/tmp' });
      terminalService.hasSession.mockReturnValue(true);

      // Sanity: stranger initially cannot send input
      gateway.handleInput(stranger, { sessionId: 1, data: 'before' });
      expect(terminalService.write).not.toHaveBeenCalled();

      // Stranger calls join — current behavior accepts the claim and grants
      // ownership without checking that they spawned the session.
      const result = gateway.handleJoin(stranger, { sessionId: 1 });
      expect(result).toEqual({ success: true, scrollback: undefined });

      // After join the stranger CAN send input. This is the behavior to lock
      // down with an opaque sessionToken if the threat model expands.
      gateway.handleInput(stranger, { sessionId: 1, data: 'after\n' });
      expect(terminalService.write).toHaveBeenCalledWith(1, 'after\n');
    });
  });

  // =========================================================================
  // registerClientSession
  // =========================================================================

  describe('registerClientSession', () => {
    it('should create a new set if client has no sessions yet', () => {
      gateway.registerClientSession('unknown-client', 42);

      const sessions = (gateway as any).clientSessions.get('unknown-client') as Set<number>;
      expect(sessions).toBeDefined();
      expect(sessions.has(42)).toBe(true);
    });

    it('should add to existing set', () => {
      const client = createMockSocket('c1');
      gateway.handleConnection(client);

      gateway.registerClientSession('c1', 10);
      gateway.registerClientSession('c1', 20);

      const sessions = (gateway as any).clientSessions.get('c1') as Set<number>;
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

  // =========================================================================
  // Backpressure
  // =========================================================================

  describe('backpressure', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should pause terminal when pending chars exceed HIGH_WATER_MARK', () => {
      // Emit enough data to exceed ~250KB (HIGH_WATER_MARK = 256_000)
      const largeData = 'x'.repeat(260_000);
      gateway.handleTerminalOutput({ sessionId: 1, data: largeData });

      expect(terminalService.pause).toHaveBeenCalledWith(1);
    });

    it('should track chars not packets — many small writes should not trigger', () => {
      // 100 small packets (100 chars total — well below 256KB)
      for (let i = 0; i < 100; i++) {
        gateway.handleTerminalOutput({ sessionId: 1, data: 'x' });
      }

      expect(terminalService.pause).not.toHaveBeenCalled();
    });

    it('should not pause the same terminal twice', () => {
      // First call triggers pause
      gateway.handleTerminalOutput({ sessionId: 1, data: 'x'.repeat(260_000) });
      expect(terminalService.pause).toHaveBeenCalledTimes(1);

      // Second call should not re-pause (already paused)
      gateway.handleTerminalOutput({ sessionId: 1, data: 'x'.repeat(260_000) });
      expect(terminalService.pause).toHaveBeenCalledTimes(1);
    });

    // PAUSE_SAFETY_TIMEOUT_MS force-resume: if the drain event never fires
    // (e.g. the client closes or stalls), the 15s safety timeout must
    // force-resume the PTY so Claude is never permanently deadlocked.
    it('should force-resume after PAUSE_SAFETY_TIMEOUT_MS (15s) without manual drain', () => {
      jest.useFakeTimers();

      // Trigger backpressure pause
      gateway.handleTerminalOutput({ sessionId: 1, data: 'x'.repeat(260_000) });
      expect(terminalService.pause).toHaveBeenCalledWith(1);

      // Terminal is now paused; drain event never arrives.
      // Before the safety timeout fires, resume should NOT have been called.
      jest.advanceTimersByTime(14_999);
      expect(terminalService.resume).not.toHaveBeenCalled();

      // Advance past the 15s safety window — force-resume must fire.
      jest.advanceTimersByTime(2);
      expect(terminalService.resume).toHaveBeenCalledWith(1);
    });

    it('should NOT force-resume when drain clears backpressure before the timeout', () => {
      jest.useFakeTimers();

      const client = createMockSocket('c1');
      let drainCallback: (() => void) | undefined;
      client.conn.on = jest.fn((_event: string, cb: () => void) => {
        drainCallback = cb;
      });

      gateway.handleConnection(client);

      // Trigger backpressure pause
      gateway.handleTerminalOutput({ sessionId: 1, data: 'x'.repeat(260_000) });
      expect(terminalService.pause).toHaveBeenCalledWith(1);

      // Drain fires at 5s — clears pause and cancels the safety timeout.
      jest.advanceTimersByTime(5_000);
      drainCallback?.();
      expect(terminalService.resume).toHaveBeenCalledWith(1);

      // Advance past the original 15s window to confirm the timer was cancelled
      // (resume must only have been called once — from the drain, not from timeout).
      jest.advanceTimersByTime(11_000);
      expect(terminalService.resume).toHaveBeenCalledTimes(1);
    });
  });
});
