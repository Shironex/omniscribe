// ---- Mocks ----

const mockExecFileSync = jest.fn();
const mockUserInfo = jest.fn();

jest.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

jest.mock('os', () => ({
  userInfo: () => mockUserInfo(),
}));

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  }),
}));

// ---- Helpers ----

const DELIMITER = '___OMNISCRIBE_PATH_DELIMITER___';

function makeShellOutput(pathValue: string): string {
  return `${DELIMITER}PATH=${pathValue}${DELIMITER}`;
}

// ---- Tests ----

describe('shell-path', () => {
  let resolveShellPath: typeof import('./shell-path').resolveShellPath;
  const originalPlatform = process.platform;
  const originalPath = process.env.PATH;
  const originalShell = process.env.SHELL;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset PATH and platform before each test
    process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
    process.env.SHELL = '/bin/zsh';
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    // Default: userInfo returns zsh
    mockUserInfo.mockReturnValue({ shell: '/bin/zsh' });

    // Re-import to get fresh references with mocks applied
    jest.resetModules();
    const mod = require('./shell-path');
    resolveShellPath = mod.resolveShellPath;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    process.env.SHELL = originalShell;
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  // ================================================================
  // Platform handling
  // ================================================================
  describe('platform handling', () => {
    it('should be a no-op on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      process.env.PATH = 'C:\\Windows\\system32;C:\\Windows';

      resolveShellPath();

      expect(process.env.PATH).toBe('C:\\Windows\\system32;C:\\Windows');
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('should resolve PATH on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const fullPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
      mockExecFileSync.mockReturnValue(makeShellOutput(fullPath));

      resolveShellPath();

      expect(process.env.PATH).toBe(fullPath);
    });

    it('should resolve PATH on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const fullPath = '/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin';
      mockExecFileSync.mockReturnValue(makeShellOutput(fullPath));

      resolveShellPath();

      expect(process.env.PATH).toBe(fullPath);
    });
  });

  // ================================================================
  // Shell detection
  // ================================================================
  describe('shell detection', () => {
    it('should use shell from os.userInfo()', () => {
      mockUserInfo.mockReturnValue({ shell: '/bin/bash' });
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/local/bin:/usr/bin:/bin'));

      resolveShellPath();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        '/bin/bash',
        expect.arrayContaining(['-ilc']),
        expect.any(Object)
      );
    });

    it('should fall back to SHELL env var if userInfo() fails', () => {
      mockUserInfo.mockImplementation(() => {
        throw new Error('not available');
      });
      process.env.SHELL = '/bin/bash';
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/local/bin:/usr/bin:/bin'));

      resolveShellPath();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        '/bin/bash',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should fall back to /bin/zsh on macOS if no shell is detected', () => {
      mockUserInfo.mockReturnValue({ shell: '' });
      delete process.env.SHELL;
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/local/bin:/usr/bin:/bin'));

      resolveShellPath();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        '/bin/zsh',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should fall back to /bin/sh on Linux if no shell is detected', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockUserInfo.mockReturnValue({ shell: '' });
      delete process.env.SHELL;
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/local/bin:/usr/bin:/bin'));

      resolveShellPath();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        '/bin/sh',
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  // ================================================================
  // Shell arguments
  // ================================================================
  describe('shell arguments', () => {
    it('should use -ilc for bash', () => {
      mockUserInfo.mockReturnValue({ shell: '/bin/bash' });
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/bin:/bin'));

      resolveShellPath();

      const args = mockExecFileSync.mock.calls[0][1] as string[];
      expect(args[0]).toBe('-ilc');
      expect(args.length).toBe(2); // -ilc + command string
    });

    it('should use -ilc for zsh', () => {
      mockUserInfo.mockReturnValue({ shell: '/bin/zsh' });
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/bin:/bin'));

      resolveShellPath();

      const args = mockExecFileSync.mock.calls[0][1] as string[];
      expect(args[0]).toBe('-ilc');
    });

    it('should use separate flags for fish', () => {
      mockUserInfo.mockReturnValue({ shell: '/usr/local/bin/fish' });
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/bin:/bin'));

      resolveShellPath();

      const args = mockExecFileSync.mock.calls[0][1] as string[];
      expect(args[0]).toBe('-l');
      expect(args[1]).toBe('-i');
      expect(args[2]).toBe('-c');
      expect(args.length).toBe(4); // -l, -i, -c, command
    });
  });

  // ================================================================
  // PATH parsing
  // ================================================================
  describe('PATH parsing', () => {
    it('should extract PATH from delimited output', () => {
      const fullPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
      mockExecFileSync.mockReturnValue(makeShellOutput(fullPath));

      resolveShellPath();

      expect(process.env.PATH).toBe(fullPath);
    });

    it('should handle shell profile output before/after delimiters', () => {
      const fullPath = '/opt/homebrew/bin:/usr/bin:/bin';
      const output = `Welcome to zsh!\nSome motd message\n${DELIMITER}PATH=${fullPath}${DELIMITER}\nbye\n`;
      mockExecFileSync.mockReturnValue(output);

      resolveShellPath();

      expect(process.env.PATH).toBe(fullPath);
    });

    it('should strip ANSI escape codes from PATH', () => {
      const fullPath = '/opt/homebrew/bin:/usr/bin:/bin';
      const ansiPath = `\u001B[32m${fullPath}\u001B[0m`;
      mockExecFileSync.mockReturnValue(makeShellOutput(ansiPath));

      resolveShellPath();

      expect(process.env.PATH).toBe(fullPath);
    });

    it('should handle multiple lines between delimiters', () => {
      const fullPath = '/opt/homebrew/bin:/usr/bin:/bin';
      const output = `${DELIMITER}\nHOME=/Users/test\nPATH=${fullPath}\nSHELL=/bin/zsh\n${DELIMITER}`;
      mockExecFileSync.mockReturnValue(output);

      resolveShellPath();

      expect(process.env.PATH).toBe(fullPath);
    });
  });

  // ================================================================
  // Error handling
  // ================================================================
  describe('error handling', () => {
    it('should preserve original PATH on timeout', () => {
      const originalPathValue = '/usr/bin:/bin:/usr/sbin:/sbin';
      process.env.PATH = originalPathValue;

      mockExecFileSync.mockImplementation(() => {
        const error = new Error('ETIMEDOUT');
        throw error;
      });

      resolveShellPath();

      expect(process.env.PATH).toBe(originalPathValue);
    });

    it('should preserve original PATH when shell fails', () => {
      const originalPathValue = '/usr/bin:/bin:/usr/sbin:/sbin';
      process.env.PATH = originalPathValue;

      // All shells fail
      mockExecFileSync.mockImplementation(() => {
        throw new Error('spawn ENOENT');
      });

      resolveShellPath();

      expect(process.env.PATH).toBe(originalPathValue);
    });

    it('should preserve original PATH when output has no delimiters', () => {
      const originalPathValue = '/usr/bin:/bin:/usr/sbin:/sbin';
      process.env.PATH = originalPathValue;

      mockExecFileSync.mockReturnValue('some garbage output');

      resolveShellPath();

      expect(process.env.PATH).toBe(originalPathValue);
    });

    it('should preserve original PATH when output has no PATH= line', () => {
      const originalPathValue = '/usr/bin:/bin:/usr/sbin:/sbin';
      process.env.PATH = originalPathValue;

      mockExecFileSync.mockReturnValue(`${DELIMITER}HOME=/Users/test${DELIMITER}`);

      resolveShellPath();

      expect(process.env.PATH).toBe(originalPathValue);
    });

    it('should reject PATH that does not contain /usr/bin or /bin', () => {
      const originalPathValue = '/usr/bin:/bin:/usr/sbin:/sbin';
      process.env.PATH = originalPathValue;

      // Resolved PATH is suspicious -- missing system dirs
      mockExecFileSync.mockReturnValue(makeShellOutput('/some/weird/path:/another/path'));

      resolveShellPath();

      expect(process.env.PATH).toBe(originalPathValue);
    });
  });

  // ================================================================
  // Fallback shells
  // ================================================================
  describe('fallback shells', () => {
    it('should try fallback shells when default shell fails', () => {
      mockUserInfo.mockReturnValue({ shell: '/bin/zsh' });

      // First call (zsh) fails, second call (bash) succeeds
      mockExecFileSync
        .mockImplementationOnce(() => {
          throw new Error('zsh failed');
        })
        .mockReturnValueOnce(makeShellOutput('/usr/local/bin:/usr/bin:/bin'));

      resolveShellPath();

      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
      // Second call should be bash (fallback, since zsh is the default and skipped)
      expect(mockExecFileSync.mock.calls[1][0]).toBe('/bin/bash');
      expect(process.env.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
    });

    it('should not retry the default shell in fallback list', () => {
      mockUserInfo.mockReturnValue({ shell: '/bin/bash' });

      // All calls fail
      mockExecFileSync.mockImplementation(() => {
        throw new Error('shell failed');
      });

      resolveShellPath();

      // Should try: bash (default), then zsh and sh (fallbacks, excluding bash)
      const shells: string[] = mockExecFileSync.mock.calls.map(
        (call: unknown[]) => call[0] as string
      );
      expect(shells).toContain('/bin/bash');
      expect(shells).toContain('/bin/zsh');
      expect(shells).toContain('/bin/sh');
      // bash should appear only once (not in fallbacks)
      expect(shells.filter(s => s === '/bin/bash')).toHaveLength(1);
    });
  });

  // ================================================================
  // execFileSync options
  // ================================================================
  describe('execFileSync options', () => {
    it('should use correct timeout', () => {
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/bin:/bin'));

      resolveShellPath();

      const options = mockExecFileSync.mock.calls[0][2];
      expect(options.timeout).toBe(10_000);
    });

    it('should use utf-8 encoding', () => {
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/bin:/bin'));

      resolveShellPath();

      const options = mockExecFileSync.mock.calls[0][2];
      expect(options.encoding).toBe('utf-8');
    });

    it('should pipe all stdio', () => {
      mockExecFileSync.mockReturnValue(makeShellOutput('/usr/bin:/bin'));

      resolveShellPath();

      const options = mockExecFileSync.mock.calls[0][2];
      expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    });
  });
});
