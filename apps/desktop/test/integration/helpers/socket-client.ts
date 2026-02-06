/**
 * Socket.io client helpers for WebSocket integration tests.
 *
 * Provides promise-based wrappers around socket.io-client for clean test code.
 */
import { io, Socket } from 'socket.io-client';

/**
 * Create a socket.io client configured for the test server.
 * Does NOT auto-connect -- call connectClient() to connect.
 */
export function createSocketClient(port: number): Socket {
  return io(`http://localhost:${port}`, {
    autoConnect: false,
    transports: ['websocket'],
  });
}

/**
 * Connect a socket client and wait for the 'connect' event.
 * Rejects after timeout if connection fails.
 */
export function connectClient(client: Socket, timeout = 10_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for socket connection'));
    }, timeout);

    client.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    client.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`Socket connection error: ${err.message}`));
    });

    client.connect();
  });
}

/**
 * Wait for a specific event from the server.
 * Resolves with the event data, rejects on timeout.
 */
export function waitForEvent<T = any>(client: Socket, event: string, timeout = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event);
      reject(new Error(`Timeout waiting for event '${event}'`));
    }, timeout);

    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Emit an event and wait for the server's acknowledgement callback.
 * Uses socket.io's built-in ack pattern (callback as last argument).
 */
export function emitWithAck<T = any>(
  client: Socket,
  event: string,
  data: any,
  timeout = 10_000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ack on event '${event}'`));
    }, timeout);

    client.emit(event, data, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
