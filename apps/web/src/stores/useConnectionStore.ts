import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger, type ConnectionStatus } from '@omniscribe/shared';
import { socket } from '@/lib/socket';

const logger = createLogger('ConnectionStore');

/** Duration after which a disconnection is considered a failure */
const FAILURE_TIMEOUT_MS = 30_000;

interface ConnectionState {
  /** Current connection status */
  status: ConnectionStatus;
  /** Timestamp when the last disconnect occurred */
  disconnectedAt: number | null;
}

interface ConnectionActions {
  /** Mark the connection as connected */
  setConnected: () => void;
  /** Mark the connection as reconnecting and start failure timer */
  setReconnecting: () => void;
  /** Mark the connection as failed */
  setFailed: () => void;
  /** Retry the connection manually */
  retryConnection: () => void;
  /** Register socket event listeners */
  initListeners: () => void;
  /** Remove socket event listeners */
  cleanupListeners: () => void;
}

type ConnectionStore = ConnectionState & ConnectionActions;

// Store references to listeners for cleanup
let connectHandler: (() => void) | null = null;
let disconnectHandler: ((reason: string) => void) | null = null;
let reconnectFailedHandler: (() => void) | null = null;
let listenersInitialized = false;

// Module-level timer handle (non-serializable, should not be in Zustand state)
let failureTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

export const useConnectionStore = create<ConnectionStore>()(
  devtools(
    (set, get) => ({
      // Initial state: reconnecting because socket starts disconnected
      status: 'reconnecting',
      disconnectedAt: null,

      setConnected: () => {
        if (failureTimeoutHandle !== null) {
          clearTimeout(failureTimeoutHandle);
          failureTimeoutHandle = null;
        }
        logger.info('Connection established');
        set({ status: 'connected', disconnectedAt: null }, undefined, 'connection/setConnected');
      },

      setReconnecting: () => {
        if (failureTimeoutHandle !== null) {
          clearTimeout(failureTimeoutHandle);
          failureTimeoutHandle = null;
        }
        logger.info('Connection lost, attempting to reconnect...');
        failureTimeoutHandle = setTimeout(() => {
          logger.warn('Reconnection timed out after 30s');
          get().setFailed();
        }, FAILURE_TIMEOUT_MS);
        set(
          { status: 'reconnecting', disconnectedAt: Date.now() },
          undefined,
          'connection/setReconnecting'
        );
      },

      setFailed: () => {
        if (failureTimeoutHandle !== null) {
          clearTimeout(failureTimeoutHandle);
          failureTimeoutHandle = null;
        }
        logger.error('Connection failed');
        set({ status: 'failed' }, undefined, 'connection/setFailed');
      },

      retryConnection: () => {
        logger.info('Manual retry requested');
        get().setReconnecting();
        socket.connect();
      },

      initListeners: () => {
        if (listenersInitialized) {
          return;
        }

        connectHandler = () => {
          get().setConnected();
        };

        disconnectHandler = (reason: string) => {
          // 'io client disconnect' means the client intentionally disconnected
          // (e.g., app shutdown) -- don't show reconnecting overlay for that
          if (reason !== 'io client disconnect') {
            get().setReconnecting();
          }
        };

        reconnectFailedHandler = () => {
          get().setFailed();
        };

        socket.on('connect', connectHandler);
        socket.on('disconnect', disconnectHandler);
        socket.on('reconnect_failed', reconnectFailedHandler);

        listenersInitialized = true;
        logger.debug('Connection listeners registered');
      },

      cleanupListeners: () => {
        if (failureTimeoutHandle !== null) {
          clearTimeout(failureTimeoutHandle);
          failureTimeoutHandle = null;
        }

        if (connectHandler) {
          socket.off('connect', connectHandler);
          connectHandler = null;
        }
        if (disconnectHandler) {
          socket.off('disconnect', disconnectHandler);
          disconnectHandler = null;
        }
        if (reconnectFailedHandler) {
          socket.off('reconnect_failed', reconnectFailedHandler);
          reconnectFailedHandler = null;
        }

        listenersInitialized = false;
        logger.debug('Connection listeners cleaned up');
      },
    }),
    { name: 'connection' }
  )
);
