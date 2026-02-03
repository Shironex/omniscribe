import type { StoreApi } from 'zustand';
import { socket } from '../../lib/socket';

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

  const initListeners = () => {
    const state = get();

    // Prevent duplicate listener registration
    if (state.listenersInitialized) {
      return;
    }

    // Get setError from the store (cast needed since we know it exists)
    const { setError } = get() as unknown as SocketStoreActions;

    // Register custom listeners
    for (const config of listeners) {
      socket.on(config.event, (data: unknown) => {
        config.handler(data, get);
      });
    }

    // Handle connection error
    if (includeConnectionErrorHandler) {
      socket.on('connect_error', (err: Error) => {
        setError(`Connection error: ${err.message}`);
      });
    }

    // Handle reconnection
    socket.on('connect', () => {
      setError(null);
      onConnect?.(get);
    });

    set({ listenersInitialized: true } as Partial<T>);
  };

  const cleanupListeners = () => {
    // Remove custom listeners
    for (const config of listeners) {
      socket.off(config.event);
    }

    // Note: We don't remove connect/connect_error listeners here
    // as they may be shared across stores. Each store manages its own
    // custom listeners but connection listeners are typically global.

    set({ listenersInitialized: false } as Partial<T>);
  };

  return { initListeners, cleanupListeners };
}

/**
 * Helper type for stores that extend SocketStoreSlice
 */
export type WithSocketStore<T> = T & SocketStoreSlice;
