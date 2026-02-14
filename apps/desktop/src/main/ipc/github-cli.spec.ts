// ---- Mocks ----

import { createLoggerMock } from '../../../test/mocks/logger.mock';

const mockLogger = createLoggerMock();

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
}));

const mockGetGhCliStatus = jest.fn();

jest.mock('../utils', () => ({
  getGhCliStatus: (...args: unknown[]) => mockGetGhCliStatus(...args),
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
import { registerGithubCliHandlers, cleanupGithubCliHandlers } from './github-cli';

describe('IPC:GithubCli', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    registerGithubCliHandlers();
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerGithubCliHandlers', () => {
    it('should register the github:get-status handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('github:get-status', expect.any(Function));
    });
  });

  // ================================================================
  // github:get-status
  // ================================================================
  describe('github:get-status', () => {
    it('should delegate to getGhCliStatus', async () => {
      const status = { installed: true, authenticated: true };
      mockGetGhCliStatus.mockResolvedValue(status);

      const result = await handlers['github:get-status'](mockEvent);

      expect(result).toEqual(status);
      expect(mockGetGhCliStatus).toHaveBeenCalled();
    });

    it('should propagate errors and log them', async () => {
      const error = new Error('gh not found');
      mockGetGhCliStatus.mockRejectedValue(error);

      await expect(handlers['github:get-status'](mockEvent)).rejects.toThrow('gh not found');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get GitHub CLI status:', error);
    });
  });

  // ================================================================
  // cleanupGithubCliHandlers
  // ================================================================
  describe('cleanupGithubCliHandlers', () => {
    it('should remove the github:get-status handler', () => {
      cleanupGithubCliHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('github:get-status');
    });
  });
});
