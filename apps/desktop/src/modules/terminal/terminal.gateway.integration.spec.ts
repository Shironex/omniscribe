/**
 * Terminal Gateway Integration Tests
 *
 * Tests the full WebSocket flow: client -> gateway -> service -> event -> broadcast
 * using a real NestJS application with real socket.io connections.
 * The PTY layer is mocked at the TerminalService boundary.
 */
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Socket } from 'socket.io-client';
import { createTestApp, getAppPort } from '../../../test/integration/helpers/create-test-app';
import {
  createSocketClient,
  connectClient,
  waitForEvent,
  emitWithAck,
} from '../../../test/integration/helpers/socket-client';
import { TerminalModule } from './terminal.module';
import { TerminalService } from './terminal.service';

// Mock node-pty to prevent real shell spawning
jest.mock('node-pty', () => ({
  spawn: jest.fn(),
}));

describe('TerminalGateway (integration)', () => {
  let app: INestApplication;
  let client: Socket;
  let mockTerminalService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockTerminalService = {
      spawn: jest.fn().mockReturnValue(1),
      spawnCommand: jest.fn().mockReturnValue(1),
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn().mockResolvedValue(undefined),
      hasSession: jest.fn().mockReturnValue(true),
      getScrollback: jest.fn().mockReturnValue('previous output'),
      pause: jest.fn(),
      resume: jest.fn(),
      isPaused: jest.fn().mockReturnValue(false),
      getSessionIds: jest.fn().mockReturnValue([]),
      getExternalId: jest.fn().mockReturnValue(undefined),
      findByExternalId: jest.fn().mockReturnValue(undefined),
      getPid: jest.fn().mockReturnValue(1234),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    };

    app = await createTestApp({
      modules: [TerminalModule],
      overrides: [{ token: TerminalService, value: mockTerminalService }],
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    client = createSocketClient(getAppPort(app));
    await connectClient(client);
  });

  afterEach(() => {
    client?.disconnect();
  });

  it('should handle terminal:spawn and return sessionId', async () => {
    const response = await emitWithAck<{ sessionId: number }>(client, 'terminal:spawn', {
      cwd: '/tmp/test',
    });

    expect(response).toEqual({ sessionId: 1 });
    expect(mockTerminalService.spawn).toHaveBeenCalledWith('/tmp/test', undefined);
  });

  it('should handle terminal:input and forward to service', async () => {
    // First spawn to register session
    await emitWithAck(client, 'terminal:spawn', { cwd: '/tmp/test' });

    // Send input (fire-and-forget, no ack)
    client.emit('terminal:input', { sessionId: 1, data: 'ls -la\n' });

    // Wait a tick for the event to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockTerminalService.write).toHaveBeenCalledWith(1, 'ls -la\n');
  });

  it('should handle terminal:resize and forward to service', async () => {
    client.emit('terminal:resize', { sessionId: 1, cols: 120, rows: 40 });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockTerminalService.resize).toHaveBeenCalledWith(1, 120, 40);
  });

  it('should handle terminal:kill and return success', async () => {
    const response = await emitWithAck<{ success: boolean }>(client, 'terminal:kill', {
      sessionId: 1,
    });

    expect(response.success).toBe(true);
    expect(mockTerminalService.kill).toHaveBeenCalledWith(1);
  });

  it('should handle terminal:join and receive scrollback', async () => {
    const response = await emitWithAck<{ success: boolean; scrollback?: string }>(
      client,
      'terminal:join',
      { sessionId: 1 }
    );

    expect(response.success).toBe(true);
    expect(response.scrollback).toBe('previous output');
    expect(mockTerminalService.getScrollback).toHaveBeenCalledWith(1);
  });

  it('should broadcast terminal:output when terminal.output event is emitted', async () => {
    // First spawn and join to be in the terminal room
    await emitWithAck(client, 'terminal:spawn', { cwd: '/tmp/test' });

    // Set up listener for terminal:output
    const outputPromise = waitForEvent<{ sessionId: number; data: string }>(
      client,
      'terminal:output'
    );

    // Emit the internal event that the TerminalService would emit
    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('terminal.output', { sessionId: 1, data: 'hello world' });

    const output = await outputPromise;
    expect(output.sessionId).toBe(1);
    expect(output.data).toBe('hello world');
  });

  it('should broadcast terminal:closed when terminal.closed event is emitted', async () => {
    // First spawn and join to be in the terminal room
    await emitWithAck(client, 'terminal:spawn', { cwd: '/tmp/test' });

    // Set up listener for terminal:closed
    const closedPromise = waitForEvent<{ sessionId: number; exitCode: number }>(
      client,
      'terminal:closed'
    );

    // Emit the internal event
    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('terminal.closed', { sessionId: 1, exitCode: 0 });

    const closed = await closedPromise;
    expect(closed.sessionId).toBe(1);
    expect(closed.exitCode).toBe(0);
  });
});
