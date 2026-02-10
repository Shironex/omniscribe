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
const mockCleanupUpdate = vi.fn();
const mockInitUpdate = vi.fn().mockReturnValue(mockCleanupUpdate);
const mockConnectSocket = vi.fn().mockResolvedValue(undefined);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Selector = (state: any) => any;

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: (sel: Selector) =>
    sel({ initListeners: mockInitSession, cleanupListeners: mockCleanupSession }),
}));

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: (sel: Selector) =>
    sel({ initListeners: mockInitWorkspace, cleanupListeners: mockCleanupWorkspace }),
}));

vi.mock('@/stores/useGitStore', () => ({
  useGitStore: (sel: Selector) =>
    sel({ initListeners: mockInitGit, cleanupListeners: mockCleanupGit }),
}));

vi.mock('@/stores/useMcpStore', () => ({
  useMcpStore: (sel: Selector) =>
    sel({
      initListeners: mockInitMcp,
      cleanupListeners: mockCleanupMcp,
      fetchInternalMcpStatus: mockFetchInternalMcpStatus,
    }),
}));

vi.mock('@/stores/useTaskStore', () => ({
  useTaskStore: (sel: Selector) =>
    sel({ initListeners: mockInitTask, cleanupListeners: mockCleanupTask }),
}));

vi.mock('@/stores/useSessionHistoryStore', () => ({
  useSessionHistoryStore: (sel: Selector) =>
    sel({ initListeners: mockInitSessionHistory, cleanupListeners: mockCleanupSessionHistory }),
}));

vi.mock('@/stores/useUpdateStore', () => ({
  useUpdateStore: (sel: Selector) => sel({ initListeners: mockInitUpdate }),
}));

vi.mock('@/stores/useConnectionStore', () => ({
  useConnectionStore: (sel: Selector) =>
    sel({ initListeners: mockInitConnection, cleanupListeners: mockCleanupConnection }),
}));

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ setClaudeCliStatus: vi.fn() }) },
}));

vi.mock('@/lib/socket', () => ({
  connectSocket: (...args: unknown[]) => mockConnectSocket(...args),
  socket: { emit: vi.fn() },
}));

vi.mock('@/lib/session', () => ({
  resumeSession: vi.fn().mockResolvedValue(undefined),
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

      // All 7 store inits must appear before connectSocket
      const storeInits = [
        'initConnection',
        'initSession',
        'initGit',
        'initWorkspace',
        'initMcp',
        'initTask',
        'initSessionHistory',
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
});
