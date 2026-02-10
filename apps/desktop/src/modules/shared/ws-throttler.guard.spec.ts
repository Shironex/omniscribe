import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { WsThrottlerGuard } from './ws-throttler.guard';

// ---- Helpers ----

function createMockClient(
  overrides: Partial<{
    address: string;
    id: string;
    remoteAddress: string;
  }> = {}
) {
  return {
    handshake: { address: overrides.address ?? '127.0.0.1' },
    request: overrides.remoteAddress
      ? { socket: { remoteAddress: overrides.remoteAddress } }
      : undefined,
    id: overrides.id ?? 'socket-id-123',
    emit: jest.fn(),
  };
}

function createMockContext(
  client: ReturnType<typeof createMockClient>,
  pattern = 'terminal:input'
): ExecutionContext {
  return {
    switchToWs: () => ({
      getClient: () => client,
      getPattern: () => pattern,
    }),
  } as unknown as ExecutionContext;
}

function createRequestProps(
  context: ExecutionContext,
  overrides: Partial<{
    limit: number;
    ttl: number;
    blockDuration: number;
    throttlerName: string;
  }> = {}
): ThrottlerRequest {
  return {
    context,
    limit: overrides.limit ?? 100,
    ttl: overrides.ttl ?? 60000,
    blockDuration: overrides.blockDuration ?? 0,
    throttler: { name: overrides.throttlerName ?? 'default' },
    generateKey: jest.fn(
      (_ctx: ExecutionContext, tracker: string, name: string) => `${name}-${tracker}`
    ),
  } as unknown as ThrottlerRequest;
}

// ---- Tests ----

describe('WsThrottlerGuard', () => {
  let guard: WsThrottlerGuard;
  let mockStorageService: { increment: jest.Mock };
  let mockThrowThrottlingException: jest.Mock;

  beforeEach(() => {
    mockStorageService = {
      increment: jest.fn(),
    };

    mockThrowThrottlingException = jest.fn();

    // Create guard instance and inject mocked dependencies
    guard = new WsThrottlerGuard(
      {} as never, // options (not used in handleRequest)
      {} as never, // storageOptions
      {} as never // reflector
    );

    // Override the storageService and throwThrottlingException
    Object.defineProperty(guard, 'storageService', { value: mockStorageService });
    guard['throwThrottlingException'] = mockThrowThrottlingException;
  });

  it('should allow request when not rate limited', async () => {
    const client = createMockClient();
    const context = createMockContext(client);
    const requestProps = createRequestProps(context);

    mockStorageService.increment.mockResolvedValue({
      isBlocked: false,
      totalHits: 1,
      timeToExpire: 60000,
      timeToBlockExpire: 0,
    });

    const result = await guard.handleRequest(requestProps);

    expect(result).toBe(true);
    expect(client.emit).not.toHaveBeenCalled();
    expect(mockThrowThrottlingException).not.toHaveBeenCalled();
  });

  it('should block request when rate limited', async () => {
    const client = createMockClient();
    const context = createMockContext(client);
    const requestProps = createRequestProps(context, { limit: 10 });

    mockStorageService.increment.mockResolvedValue({
      isBlocked: true,
      totalHits: 11,
      timeToExpire: 60000,
      timeToBlockExpire: 30000,
    });

    await guard.handleRequest(requestProps);

    expect(mockThrowThrottlingException).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        limit: 10,
        isBlocked: true,
        totalHits: 11,
      })
    );
  });

  it('should emit THROTTLED event to client when blocked', async () => {
    const client = createMockClient();
    const context = createMockContext(client, 'terminal:input');
    const requestProps = createRequestProps(context);

    mockStorageService.increment.mockResolvedValue({
      isBlocked: true,
      totalHits: 101,
      timeToExpire: 60000,
      timeToBlockExpire: 5000,
    });

    await guard.handleRequest(requestProps);

    expect(client.emit).toHaveBeenCalledWith('ws:throttled', {
      event: 'terminal:input',
      retryAfter: 5000,
    });
  });

  it('should extract IP from handshake address', async () => {
    const client = createMockClient({ address: '192.168.1.100' });
    const context = createMockContext(client);
    const requestProps = createRequestProps(context);

    mockStorageService.increment.mockResolvedValue({
      isBlocked: false,
      totalHits: 1,
      timeToExpire: 60000,
      timeToBlockExpire: 0,
    });

    await guard.handleRequest(requestProps);

    const generateKey = requestProps.generateKey as jest.Mock;
    expect(generateKey).toHaveBeenCalledWith(context, '192.168.1.100', 'default');
  });

  it('should fall back to client.id when handshake address is not available', async () => {
    const client = {
      handshake: {},
      id: 'fallback-socket-id',
      emit: jest.fn(),
    };
    const context = {
      switchToWs: () => ({
        getClient: () => client,
        getPattern: () => 'terminal:input',
      }),
    } as unknown as ExecutionContext;
    const requestProps = createRequestProps(context);

    mockStorageService.increment.mockResolvedValue({
      isBlocked: false,
      totalHits: 1,
      timeToExpire: 60000,
      timeToBlockExpire: 0,
    });

    await guard.handleRequest(requestProps);

    const generateKey = requestProps.generateKey as jest.Mock;
    expect(generateKey).toHaveBeenCalledWith(context, 'fallback-socket-id', 'default');
  });

  it('should handle emit failure gracefully', async () => {
    const client = createMockClient();
    client.emit.mockImplementation(() => {
      throw new Error('Socket disconnected');
    });
    const context = createMockContext(client);
    const requestProps = createRequestProps(context);

    mockStorageService.increment.mockResolvedValue({
      isBlocked: true,
      totalHits: 101,
      timeToExpire: 60000,
      timeToBlockExpire: 5000,
    });

    // Should not throw even though emit fails
    await expect(guard.handleRequest(requestProps)).resolves.not.toThrow();

    expect(mockThrowThrottlingException).toHaveBeenCalled();
  });

  it('should pass correct key format to storageService.increment', async () => {
    const client = createMockClient({ address: '10.0.0.1' });
    const context = createMockContext(client);
    const requestProps = createRequestProps(context, {
      limit: 50,
      ttl: 30000,
      blockDuration: 10000,
    });

    mockStorageService.increment.mockResolvedValue({
      isBlocked: false,
      totalHits: 1,
      timeToExpire: 30000,
      timeToBlockExpire: 0,
    });

    await guard.handleRequest(requestProps);

    expect(mockStorageService.increment).toHaveBeenCalledWith(
      'default-10.0.0.1', // key generated by generateKey mock
      30000, // ttl
      50, // limit
      10000, // blockDuration
      'default' // throttlerName
    );
  });

  it('should use throttler name from request props', async () => {
    const client = createMockClient();
    const context = createMockContext(client);
    const requestProps = createRequestProps(context);

    // Override throttler name
    (requestProps as { throttler: { name: string } }).throttler.name = 'custom-throttle';

    mockStorageService.increment.mockResolvedValue({
      isBlocked: false,
      totalHits: 1,
      timeToExpire: 60000,
      timeToBlockExpire: 0,
    });

    await guard.handleRequest(requestProps);

    const generateKey = requestProps.generateKey as jest.Mock;
    expect(generateKey).toHaveBeenCalledWith(context, '127.0.0.1', 'custom-throttle');
  });

  it('should fall back to "default" when throttler name is undefined', async () => {
    const client = createMockClient();
    const context = createMockContext(client);
    const requestProps = createRequestProps(context);

    // Set throttler name to undefined
    (requestProps as { throttler: { name: string | undefined } }).throttler.name = undefined;

    mockStorageService.increment.mockResolvedValue({
      isBlocked: false,
      totalHits: 1,
      timeToExpire: 60000,
      timeToBlockExpire: 0,
    });

    await guard.handleRequest(requestProps);

    const generateKey = requestProps.generateKey as jest.Mock;
    expect(generateKey).toHaveBeenCalledWith(context, '127.0.0.1', 'default');
  });

  it('should use getPattern to determine event name for throttle payload', async () => {
    const client = createMockClient();
    const context = createMockContext(client, 'session:create');
    const requestProps = createRequestProps(context);

    mockStorageService.increment.mockResolvedValue({
      isBlocked: true,
      totalHits: 200,
      timeToExpire: 60000,
      timeToBlockExpire: 15000,
    });

    await guard.handleRequest(requestProps);

    expect(client.emit).toHaveBeenCalledWith('ws:throttled', {
      event: 'session:create',
      retryAfter: 15000,
    });
  });
});
