import { io, Socket } from 'socket.io-client';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('Socket');

const SOCKET_URL = 'ws://localhost:3001';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});

let isConnecting = false;

export function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    if (isConnecting) {
      // Wait for existing connection attempt
      const checkConnection = setInterval(() => {
        if (socket.connected) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 100);
      return;
    }

    isConnecting = true;

    const onConnect = () => {
      isConnecting = false;
      cleanup();
      resolve();
    };

    const onConnectError = (error: Error) => {
      isConnecting = false;
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);

    socket.connect();
  });
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}

// Connection event handlers
socket.on('connect', () => {
  logger.info('Connected to server');
});

socket.on('disconnect', reason => {
  logger.warn('Disconnected:', reason);
});

socket.on('reconnect', attemptNumber => {
  logger.info('Reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_attempt', attemptNumber => {
  logger.debug('Reconnection attempt', attemptNumber);
});

socket.on('reconnect_error', error => {
  logger.error('Reconnection error:', error);
});

socket.on('reconnect_failed', () => {
  logger.error('Reconnection failed after all attempts');
});

export default socket;

// Re-export socket helpers for convenient access
export {
  emitAsync,
  emitWithErrorHandling,
  emitWithSuccessHandling,
  type EmitOptions,
  type ErrorResponse,
  type SuccessResponse,
} from './socketHelpers';
