import { vi, type Mock } from 'vitest';

/**
 * Mock socket factory for testing.
 *
 * Stores registered listeners in a Map and provides helpers
 * to simulate server events and inspect emitted calls.
 */

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Set<Listener>>();

interface MockSocket {
  connected: boolean;
  recovered: boolean;
  on: Mock;
  off: Mock;
  emit: Mock;
  connect: Mock;
  disconnect: Mock;
  __simulateEvent(event: string, ...data: unknown[]): void;
  __reset(): void;
  __listenerCount(event: string): number;
}

export const mockSocket: MockSocket = {
  connected: false,
  recovered: false,

  on: vi.fn((event: string, handler: Listener) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(handler);
    return mockSocket;
  }),

  off: vi.fn((event: string, handler: Listener) => {
    listeners.get(event)?.delete(handler);
    return mockSocket;
  }),

  emit: vi.fn(),

  connect: vi.fn(() => {
    mockSocket.connected = true;
    return mockSocket;
  }),

  disconnect: vi.fn(() => {
    mockSocket.connected = false;
    return mockSocket;
  }),

  // Test helpers

  /** Trigger all registered listeners for a given event */
  __simulateEvent(event: string, ...data: unknown[]) {
    const handlers = listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...data);
      }
    }
  },

  /** Reset all state (call in beforeEach) */
  __reset() {
    listeners.clear();
    mockSocket.connected = false;
    mockSocket.recovered = false;
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.connect.mockClear();
    mockSocket.disconnect.mockClear();
  },

  /** Get current listener count for an event */
  __listenerCount(event: string): number {
    return listeners.get(event)?.size ?? 0;
  },
};

/**
 * vi.mock factory for '@/lib/socket'.
 * Use: vi.mock('@/lib/socket', () => mockSocketModule)
 */
interface MockSocketModule {
  socket: MockSocket;
  getSocket: Mock;
  initializeSocket: Mock;
  resetSocket: Mock;
  connectSocket: Mock;
  disconnectSocket: Mock;
  default: MockSocket;
  emitAsync: Mock;
  emitWithErrorHandling: Mock;
  emitWithSuccessHandling: Mock;
}

export const mockSocketModule: MockSocketModule = {
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  resetSocket: vi.fn(),
  connectSocket: vi.fn().mockResolvedValue(undefined),
  disconnectSocket: vi.fn(),
  default: mockSocket,
  // Re-export socket helpers stubs (these are re-exported from socket.ts)
  emitAsync: vi.fn(),
  emitWithErrorHandling: vi.fn(),
  emitWithSuccessHandling: vi.fn(),
};
