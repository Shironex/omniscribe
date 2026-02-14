// ---- Mocks ----

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
}));

const mockCheckForUpdates = jest.fn();
const mockDownloadUpdate = jest.fn();
const mockQuitAndInstall = jest.fn();
const mockGetUpdateChannel = jest.fn();
const mockSetUpdateChannel = jest.fn();

jest.mock('../updater', () => ({
  checkForUpdates: (...args: unknown[]) => mockCheckForUpdates(...args),
  downloadUpdate: (...args: unknown[]) => mockDownloadUpdate(...args),
  quitAndInstall: (...args: unknown[]) => mockQuitAndInstall(...args),
  getUpdateChannel: (...args: unknown[]) => mockGetUpdateChannel(...args),
  setUpdateChannel: (...args: unknown[]) => mockSetUpdateChannel(...args),
}));

const mockGetAllWindows = jest.fn();

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mockGetAllWindows(),
  },
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
  },
}));

// ---- Tests ----

import { ipcMain } from 'electron';
import { registerUpdaterHandlers, cleanupUpdaterHandlers } from './updater';

describe('IPC:Updater', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    mockGetAllWindows.mockReturnValue([]);
    registerUpdaterHandlers();
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerUpdaterHandlers', () => {
    it('should register all 5 updater handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'updater:check-for-updates',
        expect.any(Function)
      );
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:start-download', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:install-now', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:get-channel', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:set-channel', expect.any(Function));
    });
  });

  // ================================================================
  // updater:check-for-updates
  // ================================================================
  describe('updater:check-for-updates', () => {
    it('should delegate to checkForUpdates', async () => {
      const updateInfo = { version: '2.0.0', releaseDate: '2024-01-01' };
      mockCheckForUpdates.mockResolvedValue(updateInfo);

      const result = await handlers['updater:check-for-updates'](mockEvent);

      expect(result).toEqual(updateInfo);
      expect(mockCheckForUpdates).toHaveBeenCalled();
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Network error');
      mockCheckForUpdates.mockRejectedValue(error);

      await expect(handlers['updater:check-for-updates'](mockEvent)).rejects.toThrow(
        'Network error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to check for updates:', error);
    });
  });

  // ================================================================
  // updater:start-download
  // ================================================================
  describe('updater:start-download', () => {
    it('should delegate to downloadUpdate', async () => {
      mockDownloadUpdate.mockResolvedValue(undefined);

      await handlers['updater:start-download'](mockEvent);

      expect(mockDownloadUpdate).toHaveBeenCalled();
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Download failed');
      mockDownloadUpdate.mockRejectedValue(error);

      await expect(handlers['updater:start-download'](mockEvent)).rejects.toThrow(
        'Download failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start download:', error);
    });
  });

  // ================================================================
  // updater:install-now
  // ================================================================
  describe('updater:install-now', () => {
    it('should delegate to quitAndInstall', async () => {
      await handlers['updater:install-now'](mockEvent);

      expect(mockQuitAndInstall).toHaveBeenCalled();
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Install failed');
      mockQuitAndInstall.mockImplementation(() => {
        throw error;
      });

      await expect(handlers['updater:install-now'](mockEvent)).rejects.toThrow('Install failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to quit and install:', error);
    });
  });

  // ================================================================
  // updater:get-channel
  // ================================================================
  describe('updater:get-channel', () => {
    it('should delegate to getUpdateChannel', () => {
      mockGetUpdateChannel.mockReturnValue('stable');

      const result = handlers['updater:get-channel'](mockEvent);

      expect(result).toBe('stable');
      expect(mockGetUpdateChannel).toHaveBeenCalled();
    });
  });

  // ================================================================
  // updater:set-channel (SECURITY)
  // ================================================================
  describe('updater:set-channel', () => {
    it('should accept "stable" channel', async () => {
      mockSetUpdateChannel.mockResolvedValue('stable');

      const result = await handlers['updater:set-channel'](mockEvent, 'stable');

      expect(result).toBe('stable');
      expect(mockSetUpdateChannel).toHaveBeenCalledWith('stable');
    });

    it('should accept "beta" channel', async () => {
      mockSetUpdateChannel.mockResolvedValue('beta');

      const result = await handlers['updater:set-channel'](mockEvent, 'beta');

      expect(result).toBe('beta');
      expect(mockSetUpdateChannel).toHaveBeenCalledWith('beta');
    });

    it('should reject invalid channel values', async () => {
      await expect(handlers['updater:set-channel'](mockEvent, 'nightly')).rejects.toThrow(
        'Invalid update channel: nightly'
      );
    });

    it('should reject empty string channel', async () => {
      await expect(handlers['updater:set-channel'](mockEvent, '')).rejects.toThrow(
        'Invalid update channel: '
      );
    });

    it('should broadcast channel change to all windows', async () => {
      const mockWin1 = { webContents: { send: jest.fn() } };
      const mockWin2 = { webContents: { send: jest.fn() } };
      mockGetAllWindows.mockReturnValue([mockWin1, mockWin2]);
      mockSetUpdateChannel.mockResolvedValue('beta');

      await handlers['updater:set-channel'](mockEvent, 'beta');

      expect(mockWin1.webContents.send).toHaveBeenCalledWith('updater:channel-changed', 'beta');
      expect(mockWin2.webContents.send).toHaveBeenCalledWith('updater:channel-changed', 'beta');
    });

    it('should log error on failure', async () => {
      const error = new Error('Failed');
      mockSetUpdateChannel.mockRejectedValue(error);

      await expect(handlers['updater:set-channel'](mockEvent, 'stable')).rejects.toThrow('Failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to set update channel:', error);
    });
  });

  // ================================================================
  // cleanupUpdaterHandlers
  // ================================================================
  describe('cleanupUpdaterHandlers', () => {
    it('should remove all 5 handlers', () => {
      cleanupUpdaterHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('updater:check-for-updates');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('updater:start-download');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('updater:install-now');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('updater:get-channel');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('updater:set-channel');
    });
  });
});
