// ---- Mocks ----

import { createLoggerMock } from '../../../test/mocks/logger.mock';

const mockLogger = createLoggerMock();

const actualShared = jest.requireActual('@omniscribe/shared');
jest.mock('@omniscribe/shared', () => ({
  ...actualShared,
  createLogger: () => mockLogger,
}));

const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

const mockReaddir = jest.fn();
const mockStat = jest.fn();
const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockSpawn = jest.fn(() => ({ unref: jest.fn() }));
const mockExec = jest.fn((_cmd: string, cb: (err: Error | null, result: unknown) => void) =>
  cb(null, { stdout: '', stderr: '' })
);
const mockExecFile = jest.fn(
  (_file: string, _args: string[], cb: (err: Error | null, result: unknown) => void) =>
    cb(null, { stdout: '', stderr: '' })
);
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  exec: (...args: unknown[]) => mockExec(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

const mockCheckCliAvailable = jest.fn();
const actualUtils = jest.requireActual('../utils');
jest.mock('../utils', () => ({
  ...actualUtils,
  checkCliAvailable: (...args: unknown[]) => mockCheckCliAvailable(...args),
}));

const mockGetLogsDir = jest.fn(() => '/mock/logs');
jest.mock('../logger', () => ({
  getLogsDir: () => mockGetLogsDir(),
}));

const mockGetBackendPort = jest.fn(() => 3001);
jest.mock('../backend-port', () => ({
  getBackendPort: () => mockGetBackendPort(),
}));

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
  },
  app: {
    getPath: jest.fn((name: string) => `/mock/${name}`),
    getVersion: jest.fn(() => '1.0.0'),
  },
  shell: {
    openPath: jest.fn(),
  },
  clipboard: {
    writeText: jest.fn(),
  },
}));

// ---- Tests ----

import { ipcMain, app, clipboard } from 'electron';
import { registerAppHandlers, cleanupAppHandlers } from './app';

describe('IPC:App', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    registerAppHandlers();
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerAppHandlers', () => {
    it('should register all IPC handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('app:get-path', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:get-version', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:check-cli', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:is-valid-project', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:open-logs-folder', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:clipboard-write', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:get-backend-port', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:list-log-files', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:read-log-file', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:detect-editors', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('app:open-in-editor', expect.any(Function));
    });
  });

  // ================================================================
  // app:get-path
  // ================================================================
  describe('app:get-path', () => {
    it('should delegate to app.getPath()', () => {
      const result = handlers['app:get-path'](mockEvent, 'userData');
      expect(app.getPath).toHaveBeenCalledWith('userData');
      expect(result).toBe('/mock/userData');
    });
  });

  // ================================================================
  // app:get-version
  // ================================================================
  describe('app:get-version', () => {
    it('should delegate to app.getVersion()', () => {
      const result = handlers['app:get-version'](mockEvent);
      expect(app.getVersion).toHaveBeenCalled();
      expect(result).toBe('1.0.0');
    });
  });

  // ================================================================
  // app:check-cli
  // ================================================================
  describe('app:check-cli', () => {
    it('should check a valid CLI tool', async () => {
      mockCheckCliAvailable.mockResolvedValue(true);
      const result = await handlers['app:check-cli'](mockEvent, 'node');
      expect(mockCheckCliAvailable).toHaveBeenCalledWith('node');
      expect(result).toBe(true);
    });

    it('should throw for unknown CLI tool', async () => {
      await expect(handlers['app:check-cli'](mockEvent, 'unknown-tool')).rejects.toThrow(
        'Unknown CLI tool: unknown-tool'
      );
    });

    it('should throw for empty string CLI tool', async () => {
      await expect(handlers['app:check-cli'](mockEvent, '')).rejects.toThrow('Unknown CLI tool: ');
    });
  });

  // ================================================================
  // app:is-valid-project
  // ================================================================
  describe('app:is-valid-project', () => {
    it('should return invalid for non-existent path', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await handlers['app:is-valid-project'](mockEvent, '/nonexistent');
      expect(result).toEqual({ valid: false, reason: 'Path does not exist' });
    });

    it('should return valid for path with package.json', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/my/project') return true;
        if (p.endsWith('package.json')) return true;
        return false;
      });

      const result = await handlers['app:is-valid-project'](mockEvent, '/my/project');
      expect(result).toEqual({ valid: true });
    });

    it('should return valid for path with .git', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/my/project') return true;
        if (p.endsWith('.git')) return true;
        return false;
      });

      const result = await handlers['app:is-valid-project'](mockEvent, '/my/project');
      expect(result).toEqual({ valid: true });
    });

    it('should return valid for Rust project (Cargo.toml)', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/my/project') return true;
        if (p.endsWith('Cargo.toml')) return true;
        return false;
      });

      const result = await handlers['app:is-valid-project'](mockEvent, '/my/project');
      expect(result).toEqual({ valid: true });
    });

    it('should return invalid for directory without project indicators', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        // Only the root path exists, no project indicators
        return p === '/my/empty-dir';
      });

      const result = await handlers['app:is-valid-project'](mockEvent, '/my/empty-dir');
      expect(result).toEqual({ valid: false, reason: 'No recognized project files found' });
    });
  });

  // ================================================================
  // app:clipboard-write
  // ================================================================
  describe('app:clipboard-write', () => {
    it('should write string to clipboard', () => {
      handlers['app:clipboard-write'](mockEvent, 'hello world');
      expect(clipboard.writeText).toHaveBeenCalledWith('hello world');
    });

    it('should throw for non-string input', () => {
      expect(() => handlers['app:clipboard-write'](mockEvent, 42)).toThrow(
        'clipboard-write expects a string'
      );
    });

    it('should throw for undefined input', () => {
      expect(() => handlers['app:clipboard-write'](mockEvent, undefined)).toThrow(
        'clipboard-write expects a string'
      );
    });
  });

  // ================================================================
  // app:get-backend-port
  // ================================================================
  describe('app:get-backend-port', () => {
    it('should return the backend port', () => {
      const result = handlers['app:get-backend-port'](mockEvent);
      expect(result).toBe(3001);
    });
  });

  // ================================================================
  // app:list-log-files
  // ================================================================
  describe('app:list-log-files', () => {
    it('should return empty array if logs dir does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await handlers['app:list-log-files'](mockEvent);
      expect(result).toEqual([]);
    });

    it('should return sorted log files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([
        'omniscribe-2024-01-15.log',
        'omniscribe-2024-01-16.log',
        'other-file.txt',
      ]);
      mockStat.mockImplementation((p: string) => {
        if (p.includes('01-15')) {
          return Promise.resolve({ isFile: () => true, size: 1000, mtimeMs: 1000 });
        }
        if (p.includes('01-16')) {
          return Promise.resolve({ isFile: () => true, size: 2000, mtimeMs: 2000 });
        }
        return Promise.resolve({ isFile: () => true, size: 500, mtimeMs: 500 });
      });

      const result = (await handlers['app:list-log-files'](mockEvent)) as {
        name: string;
        size: number;
        lastModified: number;
      }[];

      expect(result).toHaveLength(2); // only omniscribe*.log files
      expect(result[0].name).toBe('omniscribe-2024-01-16.log'); // newest first
      expect(result[1].name).toBe('omniscribe-2024-01-15.log');
    });

    it('should skip directories that match the log pattern', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['omniscribe-dir.log']);
      mockStat.mockResolvedValue({ isFile: () => false, size: 0, mtimeMs: 0 });

      const result = await handlers['app:list-log-files'](mockEvent);
      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // app:read-log-file (SECURITY CRITICAL)
  // ================================================================
  describe('app:read-log-file', () => {
    it('should read a valid log file', async () => {
      mockStat.mockResolvedValue({ size: 1024 });
      mockReadFile.mockResolvedValue('log content here');

      const result = await handlers['app:read-log-file'](mockEvent, 'omniscribe-2024-01-15.log');

      expect(result).toBe('log content here');
    });

    it('should reject path traversal with ..', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, '../../etc/passwd')).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should reject forward slashes', async () => {
      await expect(
        handlers['app:read-log-file'](mockEvent, 'omniscribe/../secret.log')
      ).rejects.toThrow('Invalid log file name');
    });

    it('should reject backslashes', async () => {
      await expect(
        handlers['app:read-log-file'](mockEvent, 'omniscribe\\..\\secret.log')
      ).rejects.toThrow('Invalid log file name');
    });

    it('should reject filenames not starting with LOG_FILE_PREFIX', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, 'malicious.log')).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should reject filenames not ending with .log', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, 'omniscribe-2024.txt')).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should reject non-string input', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, 42)).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should reject undefined input', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, undefined)).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should reject null input', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, null)).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should reject filenames with null bytes', async () => {
      await expect(handlers['app:read-log-file'](mockEvent, 'omniscribe\0.log')).rejects.toThrow(
        'Invalid log file name'
      );
    });

    it('should enforce file size limit', async () => {
      mockStat.mockResolvedValue({ size: 20 * 1024 * 1024 }); // 20MB

      await expect(handlers['app:read-log-file'](mockEvent, 'omniscribe-big.log')).rejects.toThrow(
        'Log file exceeds 10MB limit'
      );
    });

    it('should throw "Log file not found" for ENOENT', async () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockStat.mockRejectedValue(enoentError);

      await expect(
        handlers['app:read-log-file'](mockEvent, 'omniscribe-missing.log')
      ).rejects.toThrow('Log file not found');
    });

    it('should rethrow non-ENOENT errors', async () => {
      mockStat.mockRejectedValue(new Error('disk error'));

      await expect(
        handlers['app:read-log-file'](mockEvent, 'omniscribe-error.log')
      ).rejects.toThrow('disk error');
    });
  });

  // ================================================================
  // app:open-in-editor
  // ================================================================
  describe('app:open-in-editor', () => {
    it('should spawn the editor CLI with the folder path', async () => {
      mockExistsSync.mockReturnValue(true);

      await handlers['app:open-in-editor'](mockEvent, 'vscode', '/my/project');

      expect(mockSpawn).toHaveBeenCalledWith('code', ['/my/project'], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      });
    });

    it('should call unref on the spawned process', async () => {
      mockExistsSync.mockReturnValue(true);
      const mockUnref = jest.fn();
      mockSpawn.mockReturnValue({ unref: mockUnref });

      await handlers['app:open-in-editor'](mockEvent, 'cursor', '/my/project');

      expect(mockUnref).toHaveBeenCalled();
    });

    it('should throw for unknown editor ID', async () => {
      await expect(
        handlers['app:open-in-editor'](mockEvent, 'unknown-editor', '/my/project')
      ).rejects.toThrow('Unknown editor: unknown-editor');
    });

    it('should throw for empty folder path', async () => {
      await expect(handlers['app:open-in-editor'](mockEvent, 'vscode', '')).rejects.toThrow(
        'Invalid folder path'
      );
    });

    it('should throw for folder path with null bytes', async () => {
      await expect(
        handlers['app:open-in-editor'](mockEvent, 'vscode', '/my/\0project')
      ).rejects.toThrow('Invalid folder path');
    });

    it('should throw when folder path does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(
        handlers['app:open-in-editor'](mockEvent, 'vscode', '/nonexistent/path')
      ).rejects.toThrow('Folder path does not exist');
    });
  });

  // ================================================================
  // cleanupAppHandlers
  // ================================================================
  describe('cleanupAppHandlers', () => {
    it('should remove all handlers', () => {
      cleanupAppHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:get-path');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:get-version');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:check-cli');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:is-valid-project');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:open-logs-folder');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:clipboard-write');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:get-backend-port');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:list-log-files');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:read-log-file');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:detect-editors');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('app:open-in-editor');
    });
  });
});
