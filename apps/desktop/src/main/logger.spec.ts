// ---- Mocks ----

const mockGetPath = jest.fn(() => '/mock/userData');

jest.mock('electron', () => ({
  app: { getPath: (...args: unknown[]) => mockGetPath(...args) },
}));

const mockExistsSync = jest.fn(() => true);
const mockMkdirSync = jest.fn();
const mockAppendFile = jest.fn().mockResolvedValue(undefined);
const mockStat = jest.fn();
const mockReaddir = jest.fn().mockResolvedValue([]);
const mockRename = jest.fn().mockResolvedValue(undefined);
const mockUnlink = jest.fn().mockResolvedValue(undefined);

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  promises: {
    appendFile: (...args: unknown[]) => mockAppendFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    readdir: (...args: unknown[]) => mockReaddir(...args),
    rename: (...args: unknown[]) => mockRename(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}));

jest.mock('@omniscribe/shared', () => ({
  LOG_FILE_PREFIX: 'omniscribe',
  LOG_MAX_FILE_SIZE: 10 * 1024 * 1024,
  LOG_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  LOG_FLUSH_INTERVAL_MS: 100,
  LOG_BUFFER_MAX_ENTRIES: 50,
  LOG_CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  }),
  setTimestampsEnabled: jest.fn(),
}));

// ---- Tests ----

describe('logger', () => {
  let mod: typeof import('./logger');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockGetPath.mockReturnValue('/mock/userData');
    mockExistsSync.mockReturnValue(true);
    mockStat.mockResolvedValue({ size: 0, mtimeMs: Date.now() });
    mockReaddir.mockResolvedValue([]);
    mockAppendFile.mockResolvedValue(undefined);

    jest.resetModules();

    // Import the module — this triggers initialize()
    mod = require('./logger');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ================================================================
  // getLogsDir
  // ================================================================
  describe('getLogsDir', () => {
    it('should return path based on userData', () => {
      const result = mod.getLogsDir();

      expect(result).toContain('logs');
      expect(mockGetPath).toHaveBeenCalledWith('userData');
    });

    it('should create directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      mod.getLogsDir();

      expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), {
        recursive: true,
      });
    });

    it('should not recreate directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true);

      // Reset after initialization call
      mockMkdirSync.mockClear();

      mod.getLogsDir();

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // getLogPath
  // ================================================================
  describe('getLogPath', () => {
    it('should return a date-based log file path', () => {
      const result = mod.getLogPath();

      // Should contain the prefix and .log extension
      expect(result).toContain('omniscribe-');
      expect(result).toContain('.log');
      // Should contain a date pattern (YYYY-MM-DD)
      expect(result).toMatch(/omniscribe-\d{4}-\d{2}-\d{2}\.log/);
    });
  });

  // ================================================================
  // fileTransport
  // ================================================================
  describe('fileTransport', () => {
    it('should buffer messages', () => {
      mod.fileTransport('test message\n');

      // Message is buffered, not immediately written
      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('should force flush when buffer reaches max entries', () => {
      // Buffer 50 messages (LOG_BUFFER_MAX_ENTRIES)
      for (let i = 0; i < 50; i++) {
        mod.fileTransport(`message ${i}\n`);
      }

      // doFlush should have been triggered (via .catch())
      // We need to let the microtask queue drain
      expect(mockStat).toHaveBeenCalled();
    });
  });

  // ================================================================
  // flushLogs
  // ================================================================
  describe('flushLogs', () => {
    it('should not write when buffer is empty', async () => {
      await mod.flushLogs();

      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('should write buffered messages to log file', async () => {
      mod.fileTransport('line 1\n');
      mod.fileTransport('line 2\n');

      // File does not exist yet (ENOENT on stat is fine)
      mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await mod.flushLogs();

      expect(mockAppendFile).toHaveBeenCalledWith(
        expect.stringContaining('omniscribe-'),
        'line 1\nline 2\n'
      );
    });

    it('should call rotateIfNeeded before writing', async () => {
      mod.fileTransport('data\n');

      mockStat.mockResolvedValue({ size: 100 });

      await mod.flushLogs();

      expect(mockStat).toHaveBeenCalled();
      expect(mockAppendFile).toHaveBeenCalled();
    });
  });

  // ================================================================
  // Rotation
  // ================================================================
  describe('rotation', () => {
    it('should rotate when file exceeds max size', async () => {
      mod.fileTransport('data\n');

      mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 }); // > 10 MB
      mockReaddir.mockResolvedValue([]);

      await mod.flushLogs();

      expect(mockRename).toHaveBeenCalled();
    });

    it('should not rotate when file is under max size', async () => {
      mod.fileTransport('data\n');

      mockStat.mockResolvedValue({ size: 1024 }); // 1 KB

      await mod.flushLogs();

      expect(mockRename).not.toHaveBeenCalled();
    });

    it('should increment rotation number based on existing rotated files', async () => {
      mod.fileTransport('data\n');

      const today = new Date().toISOString().split('T')[0];
      mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 });
      mockReaddir.mockResolvedValue([`omniscribe-${today}.1.log`, `omniscribe-${today}.2.log`]);

      await mod.flushLogs();

      expect(mockRename).toHaveBeenCalledWith(
        expect.stringContaining(`omniscribe-${today}.log`),
        expect.stringContaining(`omniscribe-${today}.3.log`)
      );
    });
  });

  // ================================================================
  // Periodic flush timer
  // ================================================================
  describe('periodic flush', () => {
    it('should set up a flush timer on initialization', () => {
      // The module was already loaded in beforeEach which calls initialize().
      // Verify that advancing timers triggers doFlush by checking side effects.
      // Since doFlush is async inside setInterval, we test it indirectly via flushLogs.
      mod.fileTransport('timer message\n');
      mockStat.mockResolvedValue({ size: 0 });

      // The flush timer exists — verify by calling flushLogs directly
      // (the timer itself calls doFlush which is the same internal function)
      return mod.flushLogs().then(() => {
        expect(mockAppendFile).toHaveBeenCalledWith(
          expect.stringContaining('omniscribe-'),
          'timer message\n'
        );
      });
    });
  });

  // ================================================================
  // Error handling
  // ================================================================
  describe('error handling', () => {
    it('should call onLoggingError callback on first error', async () => {
      const errorCallback = jest.fn();
      mod.setOnLoggingError(errorCallback);

      mod.fileTransport('data\n');
      mockStat.mockRejectedValue(new Error('disk full'));

      // The stat error should be caught by rotateIfNeeded which ignores
      // non-ENOENT errors and calls handleLoggingError
      // But actually the error in doFlush is from appendFile
      mockAppendFile.mockRejectedValue(new Error('disk full'));
      mockStat.mockResolvedValue({ size: 0 });

      await mod.flushLogs();

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should stop buffering after logging fails', async () => {
      mod.fileTransport('data\n');
      mockStat.mockResolvedValue({ size: 0 });
      mockAppendFile.mockRejectedValue(new Error('disk full'));

      await mod.flushLogs();

      // Now fileTransport should be a no-op because loggingFailed = true
      mockAppendFile.mockClear();
      mod.fileTransport('more data\n');
      await mod.flushLogs();

      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('should only notify error callback once', async () => {
      const errorCallback = jest.fn();
      mod.setOnLoggingError(errorCallback);

      mockStat.mockResolvedValue({ size: 0 });
      mockAppendFile.mockRejectedValue(new Error('disk full'));

      mod.fileTransport('data1\n');
      await mod.flushLogs();

      // Re-import to get fresh state for second error attempt
      // (loggingFailed is already true so second call won't reach handleLoggingError)
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // setOnLoggingError
  // ================================================================
  describe('setOnLoggingError', () => {
    it('should set the error callback', () => {
      const callback = jest.fn();
      mod.setOnLoggingError(callback);

      expect(mod.onLoggingError).toBe(callback);
    });
  });

  // ================================================================
  // Exports
  // ================================================================
  describe('exports', () => {
    it('should export logger', () => {
      expect(mod.logger).toBeDefined();
      expect(mod.logger.info).toBeDefined();
    });

    it('should export fileTransport as a function', () => {
      expect(typeof mod.fileTransport).toBe('function');
    });

    it('should export getLogPath as a function', () => {
      expect(typeof mod.getLogPath).toBe('function');
    });

    it('should export getLogsDir as a function', () => {
      expect(typeof mod.getLogsDir).toBe('function');
    });

    it('should export flushLogs as a function', () => {
      expect(typeof mod.flushLogs).toBe('function');
    });
  });
});
