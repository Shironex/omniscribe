/**
 * NestJS test application factory for WebSocket integration tests.
 *
 * Creates a real NestJS application with socket.io transport on a random port.
 * Modules are imported as-is with optional provider overrides (e.g., mock TerminalService).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

export interface ProviderOverride {
  /** Provider token (class reference or injection token) */
  token: any;
  /** Mock value to use in place of the real provider */
  value: any;
}

export interface CreateTestAppOptions {
  /** NestJS modules to import */
  modules: any[];
  /** Provider overrides (class reference -> mock value) */
  overrides?: ProviderOverride[];
  /** Enable throttler with real limits (default: false -- disabled for most tests) */
  enableThrottler?: boolean;
}

/**
 * Create a NestJS test application with socket.io support.
 *
 * - Always includes EventEmitterModule (gateways rely on @OnEvent)
 * - Throttler is disabled by default (empty config) to avoid rate limiting in tests
 * - Listens on a random port (0) to avoid port conflicts
 */
export async function createTestApp(options: CreateTestAppOptions): Promise<INestApplication> {
  const throttlerConfig = options.enableThrottler
    ? [
        { name: 'short', ttl: 1000, limit: 10 },
        { name: 'medium', ttl: 10000, limit: 50 },
      ]
    : [];

  const builder = Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      ThrottlerModule.forRoot(throttlerConfig),
      ...options.modules,
    ],
  });

  // Apply provider overrides using class references as DI tokens
  if (options.overrides) {
    for (const { token, value } of options.overrides) {
      builder.overrideProvider(token).useValue(value);
    }
  }

  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication();

  // Use socket.io adapter for WebSocket support
  app.useWebSocketAdapter(new IoAdapter(app));

  // Listen on random port to avoid conflicts
  await app.listen(0);

  return app;
}

/**
 * Get the port the test app is listening on.
 */
export function getAppPort(app: INestApplication): number {
  const server = app.getHttpServer();
  const address = server.address();
  if (typeof address === 'string') {
    throw new Error(`Unexpected string address: ${address}`);
  }
  return address!.port;
}
