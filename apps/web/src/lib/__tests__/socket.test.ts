import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock socket.io-client before importing the module under test
const mockManager = {
  on: vi.fn().mockReturnThis(),
  removeAllListeners: vi.fn(),
};

const mockSocketInstance = {
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  io: mockManager,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocketInstance),
}));

describe('socket module', () => {
  beforeEach(async () => {
    // Reset mock state
    mockSocketInstance.on.mockClear().mockReturnThis();
    mockSocketInstance.off.mockClear().mockReturnThis();
    mockSocketInstance.connect.mockClear();
    mockSocketInstance.disconnect.mockClear();
    mockSocketInstance.removeAllListeners.mockClear();
    mockSocketInstance.connected = false;
    mockManager.on.mockClear().mockReturnThis();
    mockManager.removeAllListeners.mockClear();

    // Fresh module for every test to reset the singleton
    vi.resetModules();

    // Re-mock socket.io-client after resetModules
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => mockSocketInstance),
    }));
  });

  async function importSocket() {
    return (await import('../socket')) as typeof import('../socket');
  }

  describe('initializeSocket', () => {
    it('creates socket with correct URL and options', async () => {
      const mod = await importSocket();
      const { io: ioFn } = await import('socket.io-client');

      mod.initializeSocket(3000, 'test-token');

      expect(ioFn).toHaveBeenCalledWith('ws://127.0.0.1:3000', {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        query: { auth: 'test-token' },
      });
    });

    it('throws when called without an auth token', async () => {
      const mod = await importSocket();
      expect(() => (mod.initializeSocket as unknown as (p: number) => unknown)(3000)).toThrow();
    });

    it('returns the socket instance', async () => {
      const mod = await importSocket();
      const result = mod.initializeSocket(3000, 'test-token');
      expect(result).toBe(mockSocketInstance);
    });

    it('registers socket event handlers', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      expect(mockSocketInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocketInstance.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('registers manager reconnect event handlers', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      expect(mockManager.on).toHaveBeenCalledWith('reconnect', expect.any(Function));
      expect(mockManager.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockManager.on).toHaveBeenCalledWith('reconnect_error', expect.any(Function));
      expect(mockManager.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });

    it('sets window.__testSocket', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      expect((window as unknown as Record<string, unknown>).__testSocket).toBe(mockSocketInstance);
    });
  });

  describe('resetSocket', () => {
    it('removes all listeners, disconnects, and nulls the socket', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      mod.resetSocket();

      expect(mockSocketInstance.removeAllListeners).toHaveBeenCalled();
      expect(mockManager.removeAllListeners).toHaveBeenCalled();
      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
      expect(() => mod.getSocket()).toThrow();
    });

    it('does nothing if no socket initialized', async () => {
      const mod = await importSocket();
      // Should not throw
      mod.resetSocket();
    });
  });

  describe('getSocket', () => {
    it('throws when not initialized', async () => {
      const mod = await importSocket();
      expect(() => mod.getSocket()).toThrow('Socket not initialized');
    });

    it('returns socket after initialization', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');
      expect(mod.getSocket()).toBe(mockSocketInstance);
    });
  });

  describe('connectSocket', () => {
    it('resolves immediately if already connected', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');
      mockSocketInstance.connected = true;

      await mod.connectSocket();
      expect(mockSocketInstance.connect).not.toHaveBeenCalled();
    });

    it('calls socket.connect() and resolves on connect event', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      // Simulate connect event when connect() is called
      mockSocketInstance.connect.mockImplementation(() => {
        const lastConnectCall = mockSocketInstance.on.mock.calls
          .filter(call => call[0] === 'connect')
          .pop();
        if (lastConnectCall) lastConnectCall[1]();
      });

      await mod.connectSocket();
      expect(mockSocketInstance.connect).toHaveBeenCalled();
    });

    it('rejects on connect_error event', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      const testError = new Error('Connection refused');
      mockSocketInstance.connect.mockImplementation(() => {
        const lastErrorCall = mockSocketInstance.on.mock.calls
          .filter(call => call[0] === 'connect_error')
          .pop();
        if (lastErrorCall) lastErrorCall[1](testError);
      });

      await expect(mod.connectSocket()).rejects.toThrow('Connection refused');
    });

    it('queues concurrent callers and resolves all on connect', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      // Don't resolve connect immediately — let multiple callers queue up
      mockSocketInstance.connect.mockImplementation(() => {});

      const promise1 = mod.connectSocket();
      const promise2 = mod.connectSocket();

      // Now simulate the connect event
      // The 'connect' listener is registered by the first connectSocket call
      const connectHandler = mockSocketInstance.on.mock.calls
        .filter(call => call[0] === 'connect')
        .pop();
      expect(connectHandler).toBeDefined();
      connectHandler![1]();

      await Promise.all([promise1, promise2]);
    });

    it('cleans up event listeners after connect', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');

      mockSocketInstance.connect.mockImplementation(() => {
        const lastConnectCall = mockSocketInstance.on.mock.calls
          .filter(call => call[0] === 'connect')
          .pop();
        if (lastConnectCall) lastConnectCall[1]();
      });

      await mod.connectSocket();

      expect(mockSocketInstance.off).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocketInstance.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
    });
  });

  describe('disconnectSocket', () => {
    it('calls socket.disconnect() when connected', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');
      mockSocketInstance.connected = true;

      mod.disconnectSocket();
      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
    });

    it('does not call disconnect when not connected', async () => {
      const mod = await importSocket();
      mod.initializeSocket(3000, 'test-token');
      mockSocketInstance.connected = false;

      mod.disconnectSocket();
      expect(mockSocketInstance.disconnect).not.toHaveBeenCalled();
    });
  });
});
