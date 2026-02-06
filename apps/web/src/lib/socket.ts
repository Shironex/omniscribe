import { io, Socket } from 'socket.io-client';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('Socket');

const SOCKET_URL = 'ws://localhost:3001';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});

let isConnecting = false;

const CONNECTION_TIMEOUT_MS = 30_000;

interface PendingCaller {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let pendingCallers: PendingCaller[] = [];

function resolvePendingCallers(): void {
  const callers = pendingCallers;
  pendingCallers = [];
  for (const caller of callers) {
    clearTimeout(caller.timer);
    caller.resolve();
  }
}

function rejectPendingCallers(error: Error): void {
  const callers = pendingCallers;
  pendingCallers = [];
  for (const caller of callers) {
    clearTimeout(caller.timer);
    caller.reject(error);
  }
}

export function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    if (isConnecting) {
      // Queue this caller with a timeout
      const timer = setTimeout(() => {
        const idx = pendingCallers.findIndex(c => c.timer === timer);
        if (idx !== -1) {
          pendingCallers.splice(idx, 1);
        }
        reject(new Error('Socket connection timed out'));
      }, CONNECTION_TIMEOUT_MS);

      pendingCallers.push({ resolve, reject, timer });
      return;
    }

    isConnecting = true;

    const onConnect = () => {
      isConnecting = false;
      cleanup();
      resolve();
      resolvePendingCallers();
    };

    const onConnectError = (error: Error) => {
      isConnecting = false;
      cleanup();
      reject(error);
      rejectPendingCallers(error);
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

// Expose socket instance on window for E2E testing.
// Allows Playwright to trigger disconnect/reconnect scenarios and open projects.
// The socket is already accessible via browser devtools so this adds no security risk.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__testSocket = socket;
}

// Re-export socket helpers for convenient access
export {
  emitAsync,
  emitWithErrorHandling,
  emitWithSuccessHandling,
  type EmitOptions,
  type ErrorResponse,
  type SuccessResponse,
} from './socketHelpers';
