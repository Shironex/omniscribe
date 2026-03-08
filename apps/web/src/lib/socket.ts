import { io, Socket } from 'socket.io-client';
import { createLogger, LOCALHOST } from '@omniscribe/shared';

const logger = createLogger('Socket');

let _socket: Socket | null = null;

/**
 * Initialize the socket singleton with the dynamically assigned backend port.
 * Must be called exactly once before any other socket operation.
 */
export function initializeSocket(port: number): Socket {
  if (_socket) {
    if (import.meta.env.DEV) {
      logger.warn('Socket already initialized, returning existing instance');
      return _socket;
    }
    throw new Error('Socket already initialized');
  }

  const url = `ws://${LOCALHOST}:${port}`;
  logger.info('Initializing socket connection to', url);

  _socket = io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });

  // Connection event handlers
  _socket.on('connect', () => {
    logger.info('Connected to server');
  });

  _socket.on('disconnect', reason => {
    logger.warn('Disconnected:', reason);
  });

  // Reconnect events are emitted on the Manager (socket.io), not the Socket instance
  _socket.io.on('reconnect', attemptNumber => {
    logger.info('Reconnected after', attemptNumber, 'attempts');
  });

  _socket.io.on('reconnect_attempt', attemptNumber => {
    logger.debug('Reconnection attempt', attemptNumber);
  });

  _socket.io.on('reconnect_error', error => {
    logger.error('Reconnection error:', error);
  });

  _socket.io.on('reconnect_failed', () => {
    logger.error('Reconnection failed after all attempts');
  });

  // Expose socket instance on window for E2E testing.
  if (typeof window !== 'undefined') {
    window.__testSocket = _socket;
  }

  return _socket;
}

/**
 * Tear down the existing socket (for HMR / tests).
 */
export function resetSocket(): void {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.io.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
}

/**
 * Get the socket singleton. Throws if not yet initialized.
 */
export function getSocket(): Socket {
  if (!_socket) {
    throw new Error('Socket not initialized — call initializeSocket(port) first');
  }
  return _socket;
}

let isConnecting = false;

interface PendingCaller {
  resolve: () => void;
  reject: (error: Error) => void;
}

let pendingCallers: PendingCaller[] = [];

function resolvePendingCallers(): void {
  const callers = pendingCallers;
  pendingCallers = [];
  for (const caller of callers) {
    caller.resolve();
  }
}

function rejectPendingCallers(error: Error): void {
  const callers = pendingCallers;
  pendingCallers = [];
  for (const caller of callers) {
    caller.reject(error);
  }
}

export function connectSocket(): Promise<void> {
  const socket = getSocket();
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    if (isConnecting) {
      pendingCallers.push({ resolve, reject });
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
  const socket = getSocket();
  if (socket.connected) {
    socket.disconnect();
  }
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
