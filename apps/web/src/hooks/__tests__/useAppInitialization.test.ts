import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks (must be declared before any imports that use them) ----

const mockInitSession = vi.fn();
const mockCleanupSession = vi.fn();
const mockInitWorkspace = vi.fn();
const mockCleanupWorkspace = vi.fn();
const mockInitGit = vi.fn();
const mockCleanupGit = vi.fn();
const mockInitMcp = vi.fn();
const mockCleanupMcp = vi.fn();
const mockFetchInternalMcpStatus = vi.fn();
const mockInitTask = vi.fn();
const mockCleanupTask = vi.fn();
const mockInitSessionHistory = vi.fn();
const mockCleanupSessionHistory = vi.fn();
const mockInitConnection = vi.fn();
const mockCleanupConnection = vi.fn();
const mockInitTerminal = vi.fn();
const mockCleanupTerminal = vi.fn();
const mockInitPlugin = vi.fn();
const mockCleanupPlugin = vi.fn();
const mockInitCustomCommand = vi.fn();
const mockCleanupCustomCommand = vi.fn();
const mockCleanupUpdate = vi.fn();
const mockInitUpdate = vi.fn().mockReturnValue(mockCleanupUpdate);
const mockConnectSocket = vi.fn().mockResolvedValue(undefined);
const mockInitializeSocket = vi.fn();
const mockGetSocket = vi.fn().mockReturnValue({ emit: vi.fn() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Selector = (state: any) => any;

// Helper to create a mock store that supports both selector calls and getState().
// Uses a lazy state getter so that mock function references are resolved at call
// time rather than at vi.mock hoist time (when they are not yet initialized).
function createMockStore(getState: () => Record<string, unknown>) {
  const store = (sel: Selector) => sel(getState());
  store.getState = getState;
  return store;
}

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: createMockStore(() => ({
    initListeners: mockInitSession,
    cleanupListeners: mockCleanupSession,
  })),
}));

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: createMockStore(() => ({
    initListeners: mockInitWorkspace,
    cleanupListeners: mockCleanupWorkspace,
  })),
}));

vi.mock('@/stores/useGitStore', () => ({
  useGitStore: createMockStore(() => ({
    initListeners: mockInitGit,
    cleanupListeners: mockCleanupGit,
  })),
}));

vi.mock('@/stores/useMcpStore', () => ({
  useMcpStore: createMockStore(() => ({
    initListeners: mockInitMcp,
    cleanupListeners: mockCleanupMcp,
    fetchInternalMcpStatus: mockFetchInternalMcpStatus,
  })),
}));

vi.mock('@/stores/useTaskStore', () => ({
  useTaskStore: createMockStore(() => ({
    initListeners: mockInitTask,
    cleanupListeners: mockCleanupTask,
  })),
}));

vi.mock('@/stores/useSessionHistoryStore', () => ({
  useSessionHistoryStore: createMockStore(() => ({
    initListeners: mockInitSessionHistory,
    cleanupListeners: mockCleanupSessionHistory,
  })),
}));

vi.mock('@/stores/useUpdateStore', () => ({
  useUpdateStore: createMockStore(() => ({ initListeners: mockInitUpdate })),
}));

vi.mock('@/stores/useConnectionStore', () => ({
  useConnectionStore: createMockStore(() => ({
    initListeners: mockInitConnection,
    cleanupListeners: mockCleanupConnection,
  })),
}));

vi.mock('@/stores/useTerminalStore', () => ({
  useTerminalStore: createMockStore(() => ({
    initListeners: mockInitTerminal,
    cleanupListeners: mockCleanupTerminal,
  })),
}));

vi.mock('@/stores/usePluginStore', () => ({
  usePluginStore: createMockStore(() => ({
    initListeners: mockInitPlugin,
    cleanupListeners: mockCleanupPlugin,
  })),
}));

vi.mock('@/stores/useCustomCommandStore', () => ({
  useCustomCommandStore: createMockStore(() => ({
    initListeners: mockInitCustomCommand,
    cleanupListeners: mockCleanupCustomCommand,
  })),
}));

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ setClaudeCliStatus: vi.fn() }) },
}));

vi.mock('@/lib/socket', () => ({
  connectSocket: (...args: unknown[]) => mockConnectSocket(...args),
  initializeSocket: (...args: unknown[]) => mockInitializeSocket(...args),
  getSocket: (...args: unknown[]) => mockGetSocket(...args),
}));

vi.mock('@/lib/session', () => ({
  resumeSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../usePluginInitialization', () => ({
  usePluginInitialization: vi.fn(),
}));

// ---- Import under test (after mocks) ----

import { useAppInitialization } from '../useAppInitialization';

// ---- Helpers ----

const flushPromises = () => new Promise(r => setTimeout(r, 0));

// ---- Tests ----

describe('useAppInitialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectSocket.mockResolvedValue(undefined);
    mockInitUpdate.mockReturnValue(mockCleanupUpdate);
    // Mock window.electronAPI for getBackendPort, getWsAuthToken, getStatus
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = {
      app: {
        getBackendPort: vi.fn().mockResolvedValue(12345),
        getWsAuthToken: vi.fn().mockResolvedValue('test-token'),
      },
      claude: { getStatus: vi.fn().mockResolvedValue({ installed: false }) },
    };
  });

  describe('initialization order', () => {
    it('calls all store initListeners before connectSocket', async () => {
      const callOrder: string[] = [];
      mockInitConnection.mockImplementation(() => callOrder.push('initConnection'));
      mockInitSession.mockImplementation(() => callOrder.push('initSession'));
      mockInitGit.mockImplementation(() => callOrder.push('initGit'));
      mockInitWorkspace.mockImplementation(() => callOrder.push('initWorkspace'));
      mockInitMcp.mockImplementation(() => callOrder.push('initMcp'));
      mockInitTask.mockImplementation(() => callOrder.push('initTask'));
      mockInitSessionHistory.mockImplementation(() => callOrder.push('initSessionHistory'));
      mockInitTerminal.mockImplementation(() => callOrder.push('initTerminal'));
      mockInitPlugin.mockImplementation(() => callOrder.push('initPlugin'));
      mockConnectSocket.mockImplementation(() => {
        callOrder.push('connectSocket');
        return Promise.resolve();
      });

      renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      const connectIndex = callOrder.indexOf('connectSocket');
      expect(connectIndex).toBeGreaterThan(-1);

      // All 9 store inits must appear before connectSocket
      const storeInits = [
        'initConnection',
        'initSession',
        'initGit',
        'initWorkspace',
        'initMcp',
        'initTask',
        'initSessionHistory',
        'initTerminal',
        'initPlugin',
      ];
      for (const init of storeInits) {
        const idx = callOrder.indexOf(init);
        expect(idx).toBeGreaterThan(-1);
        expect(idx).toBeLessThan(connectIndex);
      }
    });
  });

  describe('post-connect actions', () => {
    it('calls fetchInternalMcpStatus and initUpdateListeners after connectSocket resolves', async () => {
      renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      expect(mockConnectSocket).toHaveBeenCalledTimes(1);
      expect(mockFetchInternalMcpStatus).toHaveBeenCalledTimes(1);
      expect(mockInitUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup on unmount', () => {
    it('calls all cleanupListeners and cleanupUpdateListeners when unmounted', async () => {
      const { unmount } = renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      unmount();

      expect(mockCleanupConnection).toHaveBeenCalledTimes(1);
      expect(mockCleanupSession).toHaveBeenCalledTimes(1);
      expect(mockCleanupGit).toHaveBeenCalledTimes(1);
      expect(mockCleanupWorkspace).toHaveBeenCalledTimes(1);
      expect(mockCleanupMcp).toHaveBeenCalledTimes(1);
      expect(mockCleanupTask).toHaveBeenCalledTimes(1);
      expect(mockCleanupSessionHistory).toHaveBeenCalledTimes(1);
      expect(mockCleanupTerminal).toHaveBeenCalledTimes(1);
      expect(mockCleanupPlugin).toHaveBeenCalledTimes(1);
      expect(mockCleanupUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('mounted guard', () => {
    it('skips post-connect actions when unmounted before connectSocket resolves', async () => {
      let resolveConnect!: () => void;
      mockConnectSocket.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveConnect = resolve;
          })
      );

      const { unmount } = renderHook(() => useAppInitialization());

      // Let the async init progress past getBackendPort/initializeSocket
      // until it reaches connectSocket (which is deferred)
      await act(async () => {
        await flushPromises();
      });

      // Unmount while connectSocket is still pending
      unmount();

      // Now resolve the deferred connectSocket
      await act(async () => {
        resolveConnect();
        await flushPromises();
      });

      // Post-connect actions should NOT have been called
      expect(mockFetchInternalMcpStatus).not.toHaveBeenCalled();
      expect(mockInitUpdate).not.toHaveBeenCalled();
    });
  });

  describe('connectSocket error handling', () => {
    it('does not throw when connectSocket rejects', async () => {
      mockConnectSocket.mockRejectedValue(new Error('connection failed'));

      // Should not throw
      renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      // Post-connect actions should not be called since connectSocket failed
      expect(mockFetchInternalMcpStatus).not.toHaveBeenCalled();
      expect(mockInitUpdate).not.toHaveBeenCalled();
    });
  });

  describe('socket initialization', () => {
    it('forwards backend port and ws auth token to initializeSocket', async () => {
      renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      expect(mockInitializeSocket).toHaveBeenCalledWith(12345, 'test-token');
    });
  });

  describe('auth token validation', () => {
    it('does not connect when getWsAuthToken returns an empty string', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).electronAPI.app.getWsAuthToken = vi.fn().mockResolvedValue('');

      renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      expect(mockInitializeSocket).not.toHaveBeenCalled();
      expect(mockConnectSocket).not.toHaveBeenCalled();
      expect(mockFetchInternalMcpStatus).not.toHaveBeenCalled();
    });

    it('does not connect when getWsAuthToken rejects', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).electronAPI.app.getWsAuthToken = vi
        .fn()
        .mockRejectedValue(new Error('IPC failure'));

      renderHook(() => useAppInitialization());
      await act(async () => {
        await flushPromises();
      });

      expect(mockInitializeSocket).not.toHaveBeenCalled();
      expect(mockConnectSocket).not.toHaveBeenCalled();
    });
  });
});
