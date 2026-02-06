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
  /** Timer handle for the failure timeout */
  failureTimeout: ReturnType<typeof setTimeout> | null;
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

export const useConnectionStore = create<ConnectionStore>()(
  devtools(
    (set, get) => ({
      // Initial state: reconnecting because socket starts disconnected
      status: 'reconnecting',
      disconnectedAt: null,
      failureTimeout: null,

      setConnected: () => {
        const { failureTimeout } = get();
        if (failureTimeout !== null) {
          clearTimeout(failureTimeout);
        }
        logger.info('Connection established');
        set(
          { status: 'connected', disconnectedAt: null, failureTimeout: null },
          undefined,
          'connection/setConnected'
        );
      },

      setReconnecting: () => {
        const { failureTimeout } = get();
        if (failureTimeout !== null) {
          clearTimeout(failureTimeout);
        }
        logger.info('Connection lost, attempting to reconnect...');
        const timer = setTimeout(() => {
          logger.warn('Reconnection timed out after 30s');
          get().setFailed();
        }, FAILURE_TIMEOUT_MS);
        set(
          { status: 'reconnecting', disconnectedAt: Date.now(), failureTimeout: timer },
          undefined,
          'connection/setReconnecting'
        );
      },

      setFailed: () => {
        const { failureTimeout } = get();
        if (failureTimeout !== null) {
          clearTimeout(failureTimeout);
        }
        logger.error('Connection failed');
        set({ status: 'failed', failureTimeout: null }, undefined, 'connection/setFailed');
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
        const { failureTimeout } = get();
        if (failureTimeout !== null) {
          clearTimeout(failureTimeout);
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
