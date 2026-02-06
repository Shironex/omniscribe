/**
 * Usage Gateway Integration Tests
 *
 * Tests usage data fetching and Claude CLI status flows
 * with a real NestJS application and real socket.io connections.
 * UsageService is mocked at the service boundary.
 *
 * Also includes the rate limiting regression test with real throttler config.
 */
import { Module, INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import { createTestApp, getAppPort } from '../../../test/integration/helpers/create-test-app';
import {
  createSocketClient,
  connectClient,
  emitWithAck,
} from '../../../test/integration/helpers/socket-client';
import { UsageGateway } from './usage.gateway';
import { UsageService } from './usage.service';

describe('UsageGateway (integration)', () => {
  let app: INestApplication;
  let client: Socket;
  let mockUsageService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockUsageService = {
      isAvailable: jest.fn().mockResolvedValue(true),
      fetchUsageData: jest.fn().mockResolvedValue({
        usage: {
          sessionPercentage: 25,
          weeklyPercentage: 40,
          lastUpdated: '2024-01-01T00:00:00Z',
        },
      }),
      getStatus: jest.fn().mockResolvedValue({
        installed: true,
        version: '1.0.27',
        platform: 'darwin',
        arch: 'arm64',
        auth: { authenticated: true },
      }),
    };

    @Module({
      providers: [UsageGateway, { provide: UsageService, useValue: mockUsageService }],
    })
    class TestUsageModule {}

    app = await createTestApp({
      modules: [TestUsageModule],
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

  it('should handle usage:fetch and return usage data', async () => {
    const response = await emitWithAck<{ usage?: any; error?: string }>(client, 'usage:fetch', {
      workingDir: '/tmp/test-project',
    });

    expect(response.usage).toBeDefined();
    expect(response.usage.sessionPercentage).toBe(25);
    expect(response.usage.weeklyPercentage).toBe(40);
    expect(response.error).toBeUndefined();
    expect(mockUsageService.fetchUsageData).toHaveBeenCalledWith('/tmp/test-project');
  });

  it('should return error when CLI is not available', async () => {
    mockUsageService.isAvailable.mockResolvedValueOnce(false);

    const response = await emitWithAck<{ usage?: any; error?: string; message?: string }>(
      client,
      'usage:fetch',
      { workingDir: '/tmp/test-project' }
    );

    expect(response.error).toBe('cli_not_found');
    expect(response.message).toContain('Claude CLI not found');
    expect(response.usage).toBeUndefined();
  });

  it('should handle claude:status and return CLI status', async () => {
    const response = await emitWithAck<{ status: any; error?: string }>(
      client,
      'claude:status',
      {}
    );

    expect(response.status).toBeDefined();
    expect(response.status.installed).toBe(true);
    expect(response.status.version).toBe('1.0.27');
    expect(response.status.auth.authenticated).toBe(true);
    expect(response.error).toBeUndefined();
  });

  it('should handle claude:status with refresh flag', async () => {
    const response = await emitWithAck<{ status: any }>(client, 'claude:status', {
      refresh: true,
    });

    expect(response.status.installed).toBe(true);
    expect(mockUsageService.getStatus).toHaveBeenCalledWith(true);
  });
});

/**
 * Rate Limiting Regression Test
 *
 * Uses the real ThrottlerModule with tight limits to verify
 * that the WsThrottlerGuard blocks rapid-fire events.
 * This guards against Phase 2 rate limiting work being broken.
 *
 * Uses the TerminalGateway because terminal:spawn is NOT @SkipThrottle,
 * so it is subject to rate limiting. When throttled, NestJS WsExceptionsHandler
 * catches the ThrottlerException but does not send an ack, so the client sees
 * an 'exception' event instead.
 */
import { TerminalGateway } from '../terminal/terminal.gateway';
import { TerminalService } from '../terminal/terminal.service';
import { waitForEvent } from '../../../test/integration/helpers/socket-client';

jest.mock('node-pty', () => ({
  spawn: jest.fn(),
}));

describe('Rate Limiting (integration)', () => {
  let app: INestApplication;
  let client: Socket;

  beforeAll(async () => {
    const mockTerminalService = {
      spawn: jest.fn().mockReturnValue(1),
      spawnCommand: jest.fn().mockReturnValue(1),
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn().mockResolvedValue(undefined),
      hasSession: jest.fn().mockReturnValue(true),
      getScrollback: jest.fn().mockReturnValue(null),
      pause: jest.fn(),
      resume: jest.fn(),
      isPaused: jest.fn().mockReturnValue(false),
      getSessionIds: jest.fn().mockReturnValue([]),
      getExternalId: jest.fn().mockReturnValue(undefined),
      findByExternalId: jest.fn().mockReturnValue(undefined),
      getPid: jest.fn().mockReturnValue(1234),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    };

    @Module({
      providers: [TerminalGateway, { provide: TerminalService, useValue: mockTerminalService }],
    })
    class TestThrottleModule {}

    app = await createTestApp({
      modules: [TestThrottleModule],
      enableThrottler: true,
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

  it('should throttle rapid-fire events exceeding the rate limit', async () => {
    // The 'short' throttler allows 10 requests per 1 second.
    // terminal:spawn is NOT @SkipThrottle, so it will be rate limited.
    // When throttled, NestJS emits an 'exception' event to the client.
    // We listen for that exception as proof that throttling is active.

    const exceptionPromise = waitForEvent<{ status: string; message: string }>(
      client,
      'exception',
      5_000
    );

    // Fire 15 rapid terminal:spawn requests to exceed the 10/sec limit
    for (let i = 0; i < 15; i++) {
      client.emit('terminal:spawn', { cwd: '/tmp/test' }, () => {
        // ack callback -- some will receive acks, throttled ones won't
      });
    }

    // Wait for the throttle exception to be emitted.
    // NestJS WsExceptionsHandler converts ThrottlerException to a generic
    // "Internal server error" message, but the presence of an 'exception' event
    // proves the throttler guard is active and blocking excess requests.
    const exception = await exceptionPromise;
    expect(exception.status).toBe('error');
    expect(exception.message).toBeDefined();
  });
});
