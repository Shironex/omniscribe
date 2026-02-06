import type { StoreApi } from 'zustand';
import { socket } from '@/lib/socket';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('SocketStore');

/**
 * Common state for socket-connected stores
 */
export interface SocketStoreState {
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether listeners are initialized */
  listenersInitialized: boolean;
}

/**
 * Common actions for socket-connected stores
 */
export interface SocketStoreActions {
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
}

/**
 * Combined common state and actions
 */
export type SocketStoreSlice = SocketStoreState & SocketStoreActions;

/**
 * Initial state for socket stores
 */
export const initialSocketState: SocketStoreState = {
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

/**
 * Create common socket store actions
 */
export function createSocketActions<T extends SocketStoreState>(
  set: StoreApi<T>['setState']
): SocketStoreActions {
  return {
    setLoading: (isLoading: boolean) => {
      set({ isLoading } as Partial<T>);
    },
    setError: (error: string | null) => {
      set({ error } as Partial<T>);
    },
  };
}

/**
 * Socket listener configuration
 */
export interface SocketListenerConfig<T> {
  /** Event name to listen for */
  event: string;
  /** Handler function */
  handler: (data: unknown, get: () => T) => void;
}

/**
 * Options for creating socket listeners
 */
export interface CreateListenersOptions<T extends SocketStoreState> {
  /** Socket event listeners specific to this store */
  listeners: SocketListenerConfig<T>[];
  /** Callback on connect (after error is cleared) */
  onConnect?: (get: () => T) => void;
  /** Whether to include default connect_error handler (default: true) */
  includeConnectionErrorHandler?: boolean;
}

/**
 * Create initListeners and cleanupListeners functions for a socket store
 *
 * @param get - Zustand get function
 * @param set - Zustand set function
 * @param options - Listener configuration options
 * @returns Object with initListeners and cleanupListeners functions
 */
export function createSocketListeners<T extends SocketStoreState>(
  get: () => T,
  set: StoreApi<T>['setState'],
  options: CreateListenersOptions<T>
): { initListeners: () => void; cleanupListeners: () => void } {
  const { listeners, onConnect, includeConnectionErrorHandler = true } = options;

  // Store references to handler functions so they can be removed on cleanup
  // This prevents the memory leak where listeners accumulate on re-mount
  let connectHandler: (() => void) | null = null;
  let connectErrorHandler: ((err: Error) => void) | null = null;
  const customHandlers: Map<string, (data: unknown) => void> = new Map();

  const initListeners = () => {
    const state = get();

    // Prevent duplicate listener registration
    if (state.listenersInitialized) {
      return;
    }

    // Get setError from the store (cast needed since we know it exists)
    const { setError } = get() as unknown as SocketStoreActions;

    // Register custom listeners (store refs for cleanup)
    for (const config of listeners) {
      logger.debug('Registering listener:', config.event);
      const handler = (data: unknown) => {
        config.handler(data, get);
      };
      customHandlers.set(config.event, handler);
      socket.on(config.event, handler);
    }

    // Handle connection error (store ref for cleanup)
    if (includeConnectionErrorHandler) {
      connectErrorHandler = (err: Error) => {
        logger.error('Connection error:', err.message);
        setError(`Connection error: ${err.message}`);
      };
      socket.on('connect_error', connectErrorHandler);
    }

    // Handle reconnection (store ref for cleanup)
    connectHandler = () => {
      logger.info('Reconnected, clearing error');
      setError(null);
      // Connection State Recovery: if the server successfully restored
      // rooms and replayed buffered events, skip the manual re-fetch
      if (socket.recovered) {
        logger.info('Connection recovered via CSR -- skipping manual re-fetch');
      } else {
        onConnect?.(get);
      }
    };
    socket.on('connect', connectHandler);

    set({ listenersInitialized: true } as Partial<T>);
  };

  const cleanupListeners = () => {
    logger.debug('Cleaning up listeners');
    // Remove custom listeners using stored references
    for (const [event, handler] of customHandlers) {
      socket.off(event, handler);
    }
    customHandlers.clear();

    // Remove connection listeners using stored references
    if (connectHandler) {
      socket.off('connect', connectHandler);
      connectHandler = null;
    }
    if (connectErrorHandler) {
      socket.off('connect_error', connectErrorHandler);
      connectErrorHandler = null;
    }

    set({ listenersInitialized: false } as Partial<T>);
  };

  return { initListeners, cleanupListeners };
}

/**
 * Helper type for stores that extend SocketStoreSlice
 */
export type WithSocketStore<T> = T & SocketStoreSlice;
