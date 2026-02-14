// ---- Mocks ----

import { createLoggerMock } from '../../../test/mocks/logger.mock';

const mockLogger = createLoggerMock();

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
}));

const mockGetClaudeCliStatus = jest.fn();
const mockCheckClaudeVersion = jest.fn();
const mockFetchAvailableVersions = jest.fn();
const mockGetInstallCommand = jest.fn();
const mockOpenTerminalWithCommand = jest.fn();

jest.mock('../utils', () => ({
  getClaudeCliStatus: (...args: unknown[]) => mockGetClaudeCliStatus(...args),
  checkClaudeVersion: (...args: unknown[]) => mockCheckClaudeVersion(...args),
  fetchAvailableVersions: (...args: unknown[]) => mockFetchAvailableVersions(...args),
  getInstallCommand: (...args: unknown[]) => mockGetInstallCommand(...args),
  openTerminalWithCommand: (...args: unknown[]) => mockOpenTerminalWithCommand(...args),
}));

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
  },
}));

// ---- Tests ----

import { ipcMain } from 'electron';
import { registerClaudeCliHandlers, cleanupClaudeCliHandlers } from './claude-cli';

describe('IPC:ClaudeCli', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    registerClaudeCliHandlers();
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerClaudeCliHandlers', () => {
    it('should register all 5 handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('claude:get-status', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('claude:check-version', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('claude:get-versions', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'claude:get-install-command',
        expect.any(Function)
      );
      expect(ipcMain.handle).toHaveBeenCalledWith('claude:run-install', expect.any(Function));
    });
  });

  // ================================================================
  // claude:get-status
  // ================================================================
  describe('claude:get-status', () => {
    it('should delegate to getClaudeCliStatus', async () => {
      const status = { installed: true, version: '1.0.0' };
      mockGetClaudeCliStatus.mockResolvedValue(status);

      const result = await handlers['claude:get-status'](mockEvent);

      expect(result).toEqual(status);
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('CLI not found');
      mockGetClaudeCliStatus.mockRejectedValue(error);

      await expect(handlers['claude:get-status'](mockEvent)).rejects.toThrow('CLI not found');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get Claude CLI status:', error);
    });
  });

  // ================================================================
  // claude:check-version
  // ================================================================
  describe('claude:check-version', () => {
    it('should get status then check version', async () => {
      mockGetClaudeCliStatus.mockResolvedValue({ version: '1.0.0' });
      mockCheckClaudeVersion.mockReturnValue({ compatible: true });

      const result = await handlers['claude:check-version'](mockEvent);

      expect(mockGetClaudeCliStatus).toHaveBeenCalled();
      expect(mockCheckClaudeVersion).toHaveBeenCalledWith('1.0.0');
      expect(result).toEqual({ compatible: true });
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Version check failed');
      mockGetClaudeCliStatus.mockRejectedValue(error);

      await expect(handlers['claude:check-version'](mockEvent)).rejects.toThrow(
        'Version check failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to check Claude version:', error);
    });
  });

  // ================================================================
  // claude:get-versions
  // ================================================================
  describe('claude:get-versions', () => {
    it('should return versions list', async () => {
      const versions = ['1.0.0', '1.1.0', '2.0.0'];
      mockFetchAvailableVersions.mockResolvedValue(versions);

      const result = await handlers['claude:get-versions'](mockEvent);

      expect(result).toEqual({ versions });
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Fetch failed');
      mockFetchAvailableVersions.mockRejectedValue(error);

      await expect(handlers['claude:get-versions'](mockEvent)).rejects.toThrow('Fetch failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch available versions:', error);
    });
  });

  // ================================================================
  // claude:get-install-command
  // ================================================================
  describe('claude:get-install-command', () => {
    it('should delegate to getInstallCommand', async () => {
      const options = { version: '1.0.0', platform: 'win32' };
      mockGetInstallCommand.mockReturnValue('npm install -g @anthropic-ai/claude-code@1.0.0');

      const result = await handlers['claude:get-install-command'](mockEvent, options);

      expect(mockGetInstallCommand).toHaveBeenCalledWith(options);
      expect(result).toBe('npm install -g @anthropic-ai/claude-code@1.0.0');
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Invalid options');
      mockGetInstallCommand.mockImplementation(() => {
        throw error;
      });

      await expect(handlers['claude:get-install-command'](mockEvent, {})).rejects.toThrow(
        'Invalid options'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get install command:', error);
    });
  });

  // ================================================================
  // claude:run-install
  // ================================================================
  describe('claude:run-install', () => {
    it('should delegate to openTerminalWithCommand', async () => {
      mockOpenTerminalWithCommand.mockResolvedValue(undefined);

      await handlers['claude:run-install'](mockEvent, 'npm install -g claude');

      expect(mockOpenTerminalWithCommand).toHaveBeenCalledWith('npm install -g claude');
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('Terminal open failed');
      mockOpenTerminalWithCommand.mockRejectedValue(error);

      await expect(handlers['claude:run-install'](mockEvent, 'bad command')).rejects.toThrow(
        'Terminal open failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to run install command:', error);
    });
  });

  // ================================================================
  // cleanupClaudeCliHandlers
  // ================================================================
  describe('cleanupClaudeCliHandlers', () => {
    it('should remove all 5 handlers', () => {
      cleanupClaudeCliHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('claude:get-status');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('claude:check-version');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('claude:get-versions');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('claude:get-install-command');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('claude:run-install');
    });
  });
});
