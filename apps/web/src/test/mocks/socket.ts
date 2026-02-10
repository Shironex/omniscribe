import { vi } from 'vitest';

/**
 * Mock socket factory for testing.
 *
 * Stores registered listeners in a Map and provides helpers
 * to simulate server events and inspect emitted calls.
 */

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Set<Listener>>();

export const mockSocket = {
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
export const mockSocketModule = {
  socket: mockSocket,
  connectSocket: vi.fn().mockResolvedValue(undefined),
  disconnectSocket: vi.fn(),
  default: mockSocket,
  // Re-export socket helpers stubs (these are re-exported from socket.ts)
  emitAsync: vi.fn(),
  emitWithErrorHandling: vi.fn(),
  emitWithSuccessHandling: vi.fn(),
};
