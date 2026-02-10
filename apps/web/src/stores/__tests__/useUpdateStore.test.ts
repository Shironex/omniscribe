import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UpdateInfo, UpdateDownloadProgress } from '@omniscribe/shared';

const mockUpdater = {
  checkForUpdates: vi.fn().mockResolvedValue({ enabled: true }),
  startDownload: vi.fn().mockResolvedValue(undefined),
  installNow: vi.fn().mockResolvedValue(undefined),
  setChannel: vi.fn().mockResolvedValue('stable'),
  getChannel: vi.fn().mockResolvedValue('stable'),
  onCheckingForUpdate: vi.fn().mockReturnValue(vi.fn()),
  onUpdateAvailable: vi.fn().mockReturnValue(vi.fn()),
  onUpdateNotAvailable: vi.fn().mockReturnValue(vi.fn()),
  onDownloadProgress: vi.fn().mockReturnValue(vi.fn()),
  onUpdateDownloaded: vi.fn().mockReturnValue(vi.fn()),
  onUpdateError: vi.fn().mockReturnValue(vi.fn()),
  onChannelChanged: vi.fn().mockReturnValue(vi.fn()),
};

// Set up the window.electronAPI mock before importing the store
Object.defineProperty(window, 'electronAPI', {
  value: { updater: mockUpdater },
  writable: true,
  configurable: true,
});

import { useUpdateStore } from '../useUpdateStore';

const initialState = {
  status: 'idle' as const,
  updateInfo: null,
  progress: null,
  error: null,
  channel: 'stable' as const,
  isChannelSwitching: false,
};

const mockUpdateInfo: UpdateInfo = {
  version: '1.2.0',
  releaseNotes: 'Bug fixes and improvements',
  releaseDate: '2026-02-10',
};

const mockProgress: UpdateDownloadProgress = {
  bytesPerSecond: 1024000,
  percent: 45.5,
  transferred: 5000000,
  total: 11000000,
};

describe('useUpdateStore', () => {
  beforeEach(() => {
    useUpdateStore.setState(initialState);
    vi.clearAllMocks();
    // Re-set default mock implementations after clearAllMocks
    mockUpdater.checkForUpdates.mockResolvedValue({ enabled: true });
    mockUpdater.startDownload.mockResolvedValue(undefined);
    mockUpdater.installNow.mockResolvedValue(undefined);
    mockUpdater.setChannel.mockResolvedValue('stable');
    mockUpdater.getChannel.mockResolvedValue('stable');
    mockUpdater.onCheckingForUpdate.mockReturnValue(vi.fn());
    mockUpdater.onUpdateAvailable.mockReturnValue(vi.fn());
    mockUpdater.onUpdateNotAvailable.mockReturnValue(vi.fn());
    mockUpdater.onDownloadProgress.mockReturnValue(vi.fn());
    mockUpdater.onUpdateDownloaded.mockReturnValue(vi.fn());
    mockUpdater.onUpdateError.mockReturnValue(vi.fn());
    mockUpdater.onChannelChanged.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    // Restore electronAPI in case a test removed it
    Object.defineProperty(window, 'electronAPI', {
      value: { updater: mockUpdater },
      writable: true,
      configurable: true,
    });
  });

  // ============================================
  // Initial State
  // ============================================

  describe('initial state', () => {
    it('has idle status', () => {
      expect(useUpdateStore.getState().status).toBe('idle');
    });

    it('has null updateInfo', () => {
      expect(useUpdateStore.getState().updateInfo).toBeNull();
    });

    it('has null progress', () => {
      expect(useUpdateStore.getState().progress).toBeNull();
    });

    it('has null error', () => {
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('has stable as the default channel', () => {
      expect(useUpdateStore.getState().channel).toBe('stable');
    });

    it('has isChannelSwitching set to false', () => {
      expect(useUpdateStore.getState().isChannelSwitching).toBe(false);
    });
  });

  // ============================================
  // checkForUpdates
  // ============================================

  describe('checkForUpdates', () => {
    it('sets status to checking immediately', () => {
      useUpdateStore.getState().checkForUpdates();
      expect(useUpdateStore.getState().status).toBe('checking');
    });

    it('clears any previous error', () => {
      useUpdateStore.setState({ error: 'previous error', status: 'error' });
      useUpdateStore.getState().checkForUpdates();
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('calls updater.checkForUpdates', () => {
      useUpdateStore.getState().checkForUpdates();
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it('resets status to idle when updater is not enabled', async () => {
      mockUpdater.checkForUpdates.mockResolvedValue({ enabled: false });
      useUpdateStore.getState().checkForUpdates();
      await Promise.resolve();
      expect(useUpdateStore.getState().status).toBe('idle');
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('does not change status when updater is enabled (listeners handle transitions)', async () => {
      mockUpdater.checkForUpdates.mockResolvedValue({ enabled: true });
      useUpdateStore.getState().checkForUpdates();
      await Promise.resolve();
      // Status remains 'checking' because listeners (onUpdateAvailable, etc.) drive transitions
      expect(useUpdateStore.getState().status).toBe('checking');
    });

    it('sets error status on failure', async () => {
      mockUpdater.checkForUpdates.mockRejectedValue(new Error('Network error'));
      useUpdateStore.getState().checkForUpdates();
      // Need multiple microtask ticks for the rejection to propagate through .catch()
      await vi.waitFor(() => {
        expect(useUpdateStore.getState().status).toBe('error');
      });
      expect(useUpdateStore.getState().error).toBe('Network error');
    });
  });

  // ============================================
  // startDownload
  // ============================================

  describe('startDownload', () => {
    it('sets status to downloading immediately', () => {
      useUpdateStore.getState().startDownload();
      expect(useUpdateStore.getState().status).toBe('downloading');
    });

    it('clears progress and error', () => {
      useUpdateStore.setState({ progress: mockProgress, error: 'some error' });
      useUpdateStore.getState().startDownload();
      expect(useUpdateStore.getState().progress).toBeNull();
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('calls updater.startDownload', () => {
      useUpdateStore.getState().startDownload();
      expect(mockUpdater.startDownload).toHaveBeenCalledOnce();
    });

    it('sets error status on failure', async () => {
      mockUpdater.startDownload.mockRejectedValue(new Error('Download failed'));
      useUpdateStore.getState().startDownload();
      await Promise.resolve();
      expect(useUpdateStore.getState().status).toBe('error');
      expect(useUpdateStore.getState().error).toBe('Download failed');
    });
  });

  // ============================================
  // installNow
  // ============================================

  describe('installNow', () => {
    it('calls updater.installNow', () => {
      useUpdateStore.getState().installNow();
      expect(mockUpdater.installNow).toHaveBeenCalledOnce();
    });

    it('does not change status on success (app restarts)', async () => {
      useUpdateStore.setState({ status: 'ready' });
      useUpdateStore.getState().installNow();
      await Promise.resolve();
      expect(useUpdateStore.getState().status).toBe('ready');
    });

    it('sets error status on failure', async () => {
      mockUpdater.installNow.mockRejectedValue(new Error('Install failed'));
      useUpdateStore.getState().installNow();
      await Promise.resolve();
      expect(useUpdateStore.getState().status).toBe('error');
      expect(useUpdateStore.getState().error).toBe('Install failed');
    });
  });

  // ============================================
  // setChannel
  // ============================================

  describe('setChannel', () => {
    it('sets isChannelSwitching to true immediately', () => {
      useUpdateStore.getState().setChannel('beta');
      expect(useUpdateStore.getState().isChannelSwitching).toBe(true);
    });

    it('sets the channel optimistically', () => {
      useUpdateStore.getState().setChannel('beta');
      expect(useUpdateStore.getState().channel).toBe('beta');
    });

    it('calls updater.setChannel with the requested channel', () => {
      useUpdateStore.getState().setChannel('beta');
      expect(mockUpdater.setChannel).toHaveBeenCalledWith('beta');
    });

    it('resets state and sets validated channel on success', async () => {
      mockUpdater.setChannel.mockResolvedValue('beta');
      useUpdateStore.setState({
        status: 'available',
        updateInfo: mockUpdateInfo,
        progress: mockProgress,
        error: 'old error',
      });

      useUpdateStore.getState().setChannel('beta');
      await Promise.resolve();

      const state = useUpdateStore.getState();
      expect(state.channel).toBe('beta');
      expect(state.isChannelSwitching).toBe(false);
      expect(state.status).toBe('idle');
      expect(state.updateInfo).toBeNull();
      expect(state.progress).toBeNull();
      expect(state.error).toBeNull();
    });

    it('falls back to stable when result is not a valid channel', async () => {
      mockUpdater.setChannel.mockResolvedValue('invalid-channel');
      useUpdateStore.getState().setChannel('beta');
      await Promise.resolve();

      expect(useUpdateStore.getState().channel).toBe('stable');
      expect(useUpdateStore.getState().isChannelSwitching).toBe(false);
    });

    it('triggers a re-check for updates after successful channel switch', async () => {
      mockUpdater.setChannel.mockResolvedValue('beta');
      useUpdateStore.getState().setChannel('beta');
      await Promise.resolve();

      // checkForUpdates is called once by setChannel after the setChannel promise resolves
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it('sets error status on failure', async () => {
      mockUpdater.setChannel.mockRejectedValue(new Error('Channel switch failed'));
      useUpdateStore.getState().setChannel('beta');

      await vi.waitFor(() => {
        expect(useUpdateStore.getState().isChannelSwitching).toBe(false);
      });
      expect(useUpdateStore.getState().status).toBe('error');
      expect(useUpdateStore.getState().error).toBe('Channel switch failed');
    });

    it('does not trigger re-check on failure', async () => {
      mockUpdater.setChannel.mockRejectedValue(new Error('fail'));
      useUpdateStore.getState().setChannel('beta');

      await vi.waitFor(() => {
        expect(useUpdateStore.getState().isChannelSwitching).toBe(false);
      });
      expect(mockUpdater.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // initListeners
  // ============================================

  describe('initListeners', () => {
    it('calls getChannel to fetch initial channel', () => {
      useUpdateStore.getState().initListeners();
      expect(mockUpdater.getChannel).toHaveBeenCalledOnce();
    });

    it('sets channel from getChannel result', async () => {
      mockUpdater.getChannel.mockResolvedValue('beta');
      useUpdateStore.getState().initListeners();
      await Promise.resolve();
      expect(useUpdateStore.getState().channel).toBe('beta');
    });

    it('falls back to stable for invalid getChannel result', async () => {
      mockUpdater.getChannel.mockResolvedValue('nightly');
      useUpdateStore.getState().initListeners();
      await Promise.resolve();
      expect(useUpdateStore.getState().channel).toBe('stable');
    });

    it('handles getChannel failure gracefully', async () => {
      mockUpdater.getChannel.mockRejectedValue(new Error('IPC error'));
      useUpdateStore.getState().initListeners();
      await Promise.resolve();
      // Channel remains at default
      expect(useUpdateStore.getState().channel).toBe('stable');
    });

    it('registers all event listeners', () => {
      useUpdateStore.getState().initListeners();

      expect(mockUpdater.onCheckingForUpdate).toHaveBeenCalledOnce();
      expect(mockUpdater.onUpdateAvailable).toHaveBeenCalledOnce();
      expect(mockUpdater.onUpdateNotAvailable).toHaveBeenCalledOnce();
      expect(mockUpdater.onDownloadProgress).toHaveBeenCalledOnce();
      expect(mockUpdater.onUpdateDownloaded).toHaveBeenCalledOnce();
      expect(mockUpdater.onUpdateError).toHaveBeenCalledOnce();
      expect(mockUpdater.onChannelChanged).toHaveBeenCalledOnce();
    });

    it('onCheckingForUpdate listener sets status to checking', () => {
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onCheckingForUpdate.mock.calls[0][0];

      callback();

      expect(useUpdateStore.getState().status).toBe('checking');
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('onUpdateAvailable listener sets status and updateInfo', () => {
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onUpdateAvailable.mock.calls[0][0];

      callback(mockUpdateInfo);

      const state = useUpdateStore.getState();
      expect(state.status).toBe('available');
      expect(state.updateInfo).toEqual(mockUpdateInfo);
      expect(state.error).toBeNull();
    });

    it('onUpdateNotAvailable listener sets status to idle', () => {
      useUpdateStore.setState({ status: 'checking' });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onUpdateNotAvailable.mock.calls[0][0];

      callback();

      expect(useUpdateStore.getState().status).toBe('idle');
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('onDownloadProgress listener updates status and progress', () => {
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onDownloadProgress.mock.calls[0][0];

      callback(mockProgress);

      const state = useUpdateStore.getState();
      expect(state.status).toBe('downloading');
      expect(state.progress).toEqual(mockProgress);
    });

    it('onUpdateDownloaded listener sets status to ready and clears progress', () => {
      useUpdateStore.setState({ progress: mockProgress });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onUpdateDownloaded.mock.calls[0][0];

      callback(mockUpdateInfo);

      const state = useUpdateStore.getState();
      expect(state.status).toBe('ready');
      expect(state.updateInfo).toEqual(mockUpdateInfo);
      expect(state.progress).toBeNull();
    });

    it('onUpdateError listener sets error status and message', () => {
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onUpdateError.mock.calls[0][0];

      callback('Something went wrong');

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('Something went wrong');
    });

    it('onChannelChanged listener updates channel and resets state', () => {
      useUpdateStore.setState({
        channel: 'stable',
        status: 'available',
        updateInfo: mockUpdateInfo,
        progress: mockProgress,
        error: 'old error',
      });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onChannelChanged.mock.calls[0][0];

      callback('beta');

      const state = useUpdateStore.getState();
      expect(state.channel).toBe('beta');
      expect(state.status).toBe('idle');
      expect(state.updateInfo).toBeNull();
      expect(state.progress).toBeNull();
      expect(state.error).toBeNull();
    });

    it('onChannelChanged listener triggers re-check for updates', () => {
      useUpdateStore.setState({ channel: 'stable' });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onChannelChanged.mock.calls[0][0];

      callback('beta');

      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it('onChannelChanged listener skips update when channel already matches and no error', () => {
      useUpdateStore.setState({ channel: 'stable', error: null });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onChannelChanged.mock.calls[0][0];

      callback('stable');

      // Should not change state or re-check
      expect(useUpdateStore.getState().status).toBe('idle');
      expect(mockUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('onChannelChanged listener does NOT skip when channel matches but there is an error', () => {
      useUpdateStore.setState({ channel: 'stable', error: 'some error', status: 'error' });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onChannelChanged.mock.calls[0][0];

      callback('stable');

      // Should update state because error was present
      expect(useUpdateStore.getState().status).toBe('idle');
      expect(useUpdateStore.getState().error).toBeNull();
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it('onChannelChanged listener falls back to stable for invalid channel', () => {
      useUpdateStore.setState({ channel: 'beta' });
      useUpdateStore.getState().initListeners();
      const callback = mockUpdater.onChannelChanged.mock.calls[0][0];

      callback('invalid');

      expect(useUpdateStore.getState().channel).toBe('stable');
    });

    it('returns a cleanup function', () => {
      const cleanup = useUpdateStore.getState().initListeners();
      expect(typeof cleanup).toBe('function');
    });

    it('cleanup function calls all unsubscribe functions', () => {
      const unsubChecking = vi.fn();
      const unsubAvailable = vi.fn();
      const unsubNotAvailable = vi.fn();
      const unsubProgress = vi.fn();
      const unsubDownloaded = vi.fn();
      const unsubError = vi.fn();
      const unsubChannelChanged = vi.fn();

      mockUpdater.onCheckingForUpdate.mockReturnValue(unsubChecking);
      mockUpdater.onUpdateAvailable.mockReturnValue(unsubAvailable);
      mockUpdater.onUpdateNotAvailable.mockReturnValue(unsubNotAvailable);
      mockUpdater.onDownloadProgress.mockReturnValue(unsubProgress);
      mockUpdater.onUpdateDownloaded.mockReturnValue(unsubDownloaded);
      mockUpdater.onUpdateError.mockReturnValue(unsubError);
      mockUpdater.onChannelChanged.mockReturnValue(unsubChannelChanged);

      const cleanup = useUpdateStore.getState().initListeners();
      cleanup();

      expect(unsubChecking).toHaveBeenCalledOnce();
      expect(unsubAvailable).toHaveBeenCalledOnce();
      expect(unsubNotAvailable).toHaveBeenCalledOnce();
      expect(unsubProgress).toHaveBeenCalledOnce();
      expect(unsubDownloaded).toHaveBeenCalledOnce();
      expect(unsubError).toHaveBeenCalledOnce();
      expect(unsubChannelChanged).toHaveBeenCalledOnce();
    });
  });

  // ============================================
  // No updater available
  // ============================================

  describe('no updater available', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'electronAPI', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('checkForUpdates is a no-op', () => {
      useUpdateStore.getState().checkForUpdates();
      // Status should remain idle since updater is not available
      expect(useUpdateStore.getState().status).toBe('idle');
    });

    it('startDownload is a no-op', () => {
      useUpdateStore.getState().startDownload();
      expect(useUpdateStore.getState().status).toBe('idle');
    });

    it('installNow is a no-op', () => {
      useUpdateStore.setState({ status: 'ready' });
      useUpdateStore.getState().installNow();
      // No error should be set
      expect(useUpdateStore.getState().error).toBeNull();
    });

    it('setChannel is a no-op', () => {
      useUpdateStore.getState().setChannel('beta');
      // isChannelSwitching should remain false
      expect(useUpdateStore.getState().isChannelSwitching).toBe(false);
      expect(useUpdateStore.getState().channel).toBe('stable');
    });

    it('initListeners returns a no-op cleanup function', () => {
      const cleanup = useUpdateStore.getState().initListeners();
      expect(typeof cleanup).toBe('function');
      // Should not throw
      expect(() => cleanup()).not.toThrow();
    });

    it('initListeners does not call getChannel', () => {
      useUpdateStore.getState().initListeners();
      expect(mockUpdater.getChannel).not.toHaveBeenCalled();
    });

    it('initListeners does not register any listeners', () => {
      useUpdateStore.getState().initListeners();
      expect(mockUpdater.onCheckingForUpdate).not.toHaveBeenCalled();
      expect(mockUpdater.onUpdateAvailable).not.toHaveBeenCalled();
      expect(mockUpdater.onUpdateNotAvailable).not.toHaveBeenCalled();
      expect(mockUpdater.onDownloadProgress).not.toHaveBeenCalled();
      expect(mockUpdater.onUpdateDownloaded).not.toHaveBeenCalled();
      expect(mockUpdater.onUpdateError).not.toHaveBeenCalled();
      expect(mockUpdater.onChannelChanged).not.toHaveBeenCalled();
    });
  });
});
