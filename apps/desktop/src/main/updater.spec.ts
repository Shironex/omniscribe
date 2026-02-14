// ---- Mocks ----

import { createLoggerMock } from '../../test/mocks/logger.mock';
import { createElectronStoreMock } from '../../test/mocks/electron-store.mock';

const mockLogger = createLoggerMock();

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
  UPDATE_ERROR_RELEASE_PENDING: 'UPDATE_ERROR_RELEASE_PENDING',
  DEFAULT_UPDATE_CHANNEL: 'stable',
}));

jest.mock('electron-store', () => createElectronStoreMock());

const mockAutoUpdater = {
  autoDownload: false as boolean,
  autoInstallOnAppQuit: true as boolean,
  channel: 'latest' as string,
  allowPrerelease: false as boolean,
  allowDowngrade: false as boolean,
  on: jest.fn(),
  checkForUpdates: jest.fn(),
  downloadUpdate: jest.fn(),
  quitAndInstall: jest.fn(),
};

jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

const mockGetVersion = jest.fn(() => '1.0.0');
jest.mock('electron', () => ({
  app: { getVersion: () => mockGetVersion() },
  BrowserWindow: jest.fn(),
}));

const mockSemverLt = jest.fn(() => false);
jest.mock('semver', () => ({
  lt: (...args: unknown[]) => mockSemverLt(...args),
}));

// ---- Helpers ----

function getEventHandler(event: string): (...args: unknown[]) => void {
  const call = mockAutoUpdater.on.mock.calls.find((c: unknown[]) => c[0] === event);
  if (!call) throw new Error(`No handler registered for event: ${event}`);
  return call[1] as (...args: unknown[]) => void;
}

// ---- Tests ----

describe('updater', () => {
  let getUpdateChannel: typeof import('./updater').getUpdateChannel;
  let setUpdateChannel: typeof import('./updater').setUpdateChannel;
  let initializeAutoUpdater: typeof import('./updater').initializeAutoUpdater;
  let checkForUpdates: typeof import('./updater').checkForUpdates;
  let downloadUpdate: typeof import('./updater').downloadUpdate;
  let quitAndInstall: typeof import('./updater').quitAndInstall;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset autoUpdater mock state
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = true;
    mockAutoUpdater.channel = 'latest';
    mockAutoUpdater.allowPrerelease = false;
    mockAutoUpdater.allowDowngrade = false;

    mockSemverLt.mockReturnValue(false);
    mockGetVersion.mockReturnValue('1.0.0');

    jest.resetModules();

    // Re-apply mocks after resetModules (jest.mock calls are hoisted, but we
    // need to re-require to get a fresh module with reset state)
    const mod = require('./updater');
    getUpdateChannel = mod.getUpdateChannel;
    setUpdateChannel = mod.setUpdateChannel;
    initializeAutoUpdater = mod.initializeAutoUpdater;
    checkForUpdates = mod.checkForUpdates;
    downloadUpdate = mod.downloadUpdate;
    quitAndInstall = mod.quitAndInstall;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ================================================================
  // Module-level side effects
  // ================================================================
  describe('module initialization', () => {
    it('should set autoDownload to false', () => {
      expect(mockAutoUpdater.autoDownload).toBe(false);
    });

    it('should set autoInstallOnAppQuit to true', () => {
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
    });
  });

  // ================================================================
  // getUpdateChannel / setUpdateChannel
  // ================================================================
  describe('getUpdateChannel', () => {
    it('should return the default channel initially', () => {
      expect(getUpdateChannel()).toBe('stable');
    });
  });

  describe('setUpdateChannel', () => {
    it('should switch to beta channel', async () => {
      const result = await setUpdateChannel('beta');

      expect(result).toBe('beta');
      expect(getUpdateChannel()).toBe('beta');
      expect(mockAutoUpdater.channel).toBe('beta');
      expect(mockAutoUpdater.allowPrerelease).toBe(true);
      expect(mockAutoUpdater.allowDowngrade).toBe(true);
    });

    it('should switch to stable channel', async () => {
      await setUpdateChannel('beta');
      const result = await setUpdateChannel('stable');

      expect(result).toBe('stable');
      expect(getUpdateChannel()).toBe('stable');
      expect(mockAutoUpdater.channel).toBe('latest');
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
    });
  });

  // ================================================================
  // initializeAutoUpdater
  // ================================================================
  describe('initializeAutoUpdater', () => {
    const mockMainWindow = {
      webContents: { send: jest.fn() },
    } as unknown as Electron.BrowserWindow;

    it('should skip setup in development mode', () => {
      initializeAutoUpdater(mockMainWindow, true);

      expect(mockAutoUpdater.on).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
    });

    it('should register 6 event handlers in production mode', () => {
      initializeAutoUpdater(mockMainWindow, false);

      const registeredEvents = mockAutoUpdater.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(registeredEvents).toContain('checking-for-update');
      expect(registeredEvents).toContain('update-available');
      expect(registeredEvents).toContain('update-not-available');
      expect(registeredEvents).toContain('download-progress');
      expect(registeredEvents).toContain('update-downloaded');
      expect(registeredEvents).toContain('error');
    });

    it('should set up initial check timer (5 seconds)', () => {
      initializeAutoUpdater(mockMainWindow, false);

      mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);

      jest.advanceTimersByTime(5000);

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it('should set up periodic check interval (1 hour)', () => {
      initializeAutoUpdater(mockMainWindow, false);

      mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);

      // Advance past initial 5s delay
      jest.advanceTimersByTime(5000);
      mockAutoUpdater.checkForUpdates.mockClear();

      // Advance 1 hour
      jest.advanceTimersByTime(60 * 60 * 1000);

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    // ---- Event handlers ----

    describe('checking-for-update handler', () => {
      it('should forward event to renderer', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('checking-for-update');
        handler();

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('updater:checking-for-update');
      });
    });

    describe('update-available handler', () => {
      it('should forward update info with release notes to renderer', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-available');
        handler({
          version: '2.0.0',
          releaseNotes: 'New features',
          releaseDate: '2024-01-01',
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-available',
          expect.objectContaining({
            version: '2.0.0',
            releaseNotes: 'New features',
            releaseDate: '2024-01-01',
            isDowngrade: false,
          })
        );
      });

      it('should parse array release notes', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-available');
        handler({
          version: '2.0.0',
          releaseNotes: [
            { version: '2.0.0', note: 'Feature A' },
            { version: '1.9.0', note: 'Feature B' },
          ],
          releaseDate: '2024-01-01',
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-available',
          expect.objectContaining({
            releaseNotes: 'Feature A\n\nFeature B',
          })
        );
      });

      it('should handle null release notes', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-available');
        handler({
          version: '2.0.0',
          releaseNotes: null,
          releaseDate: '2024-01-01',
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-available',
          expect.objectContaining({
            releaseNotes: null,
          })
        );
      });

      it('should detect downgrade via semver', () => {
        mockSemverLt.mockReturnValue(true);
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-available');
        handler({
          version: '0.5.0',
          releaseNotes: null,
          releaseDate: '2024-01-01',
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-available',
          expect.objectContaining({ isDowngrade: true })
        );
      });

      it('should handle semver comparison error gracefully', () => {
        mockSemverLt.mockImplementation(() => {
          throw new Error('Invalid version');
        });
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-available');
        handler({
          version: 'invalid',
          releaseNotes: null,
          releaseDate: '2024-01-01',
        });

        // Should default to isDowngrade = false on semver error
        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-available',
          expect.objectContaining({ isDowngrade: false })
        );
      });
    });

    describe('update-not-available handler', () => {
      it('should forward info to renderer', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-not-available');
        handler({
          version: '1.0.0',
          releaseNotes: 'Current notes',
          releaseDate: '2024-01-01',
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-not-available',
          expect.objectContaining({
            version: '1.0.0',
            releaseNotes: 'Current notes',
            releaseDate: '2024-01-01',
          })
        );
      });
    });

    describe('download-progress handler', () => {
      it('should forward progress to renderer', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('download-progress');
        handler({
          bytesPerSecond: 1024000,
          percent: 50.5,
          transferred: 5000000,
          total: 10000000,
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('updater:download-progress', {
          bytesPerSecond: 1024000,
          percent: 50.5,
          transferred: 5000000,
          total: 10000000,
        });
      });
    });

    describe('update-downloaded handler', () => {
      it('should forward info to renderer', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('update-downloaded');
        handler({
          version: '2.0.0',
          releaseNotes: 'Ready to install',
          releaseDate: '2024-01-01',
        });

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:update-downloaded',
          expect.objectContaining({
            version: '2.0.0',
            releaseNotes: 'Ready to install',
          })
        );
      });
    });

    describe('error handler', () => {
      it('should detect release pending error for latest.yml 404', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('error');
        handler(new Error('Cannot find latest.yml in the latest release artifacts'));

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:error',
          'UPDATE_ERROR_RELEASE_PENDING'
        );
      });

      it('should detect release pending error for beta.yml 404', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('error');
        handler(new Error('Cannot find beta.yml in the latest release artifacts'));

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:error',
          'UPDATE_ERROR_RELEASE_PENDING'
        );
      });

      it('should detect release pending for generic .yml 404', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('error');
        handler(new Error('Error: latest.yml: 404 Not Found'));

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:error',
          'UPDATE_ERROR_RELEASE_PENDING'
        );
      });

      it('should forward generic errors as error message', () => {
        initializeAutoUpdater(mockMainWindow, false);

        const handler = getEventHandler('error');
        handler(new Error('Network timeout'));

        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
          'updater:error',
          'Network timeout'
        );
      });
    });
  });

  // ================================================================
  // checkForUpdates
  // ================================================================
  describe('checkForUpdates', () => {
    const mockMainWindow = {
      webContents: { send: jest.fn() },
    } as unknown as Electron.BrowserWindow;

    it('should skip when updater is not enabled', async () => {
      const result = await checkForUpdates();

      expect(result.enabled).toBe(false);
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should check for updates when enabled', async () => {
      mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);
      initializeAutoUpdater(mockMainWindow, false);

      const result = await checkForUpdates();

      expect(result.enabled).toBe(true);
      expect(result.channel).toBe('stable');
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it('should handle check errors gracefully', async () => {
      initializeAutoUpdater(mockMainWindow, false);
      mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error('Network error'));

      const result = await checkForUpdates();

      expect(result.enabled).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check'),
        expect.any(Error)
      );
    });
  });

  // ================================================================
  // downloadUpdate
  // ================================================================
  describe('downloadUpdate', () => {
    it('should delegate to autoUpdater.downloadUpdate', async () => {
      mockAutoUpdater.downloadUpdate.mockResolvedValue(undefined);

      await downloadUpdate();

      expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled();
    });
  });

  // ================================================================
  // quitAndInstall
  // ================================================================
  describe('quitAndInstall', () => {
    it('should delegate to autoUpdater.quitAndInstall', () => {
      quitAndInstall();

      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
    });
  });
});
