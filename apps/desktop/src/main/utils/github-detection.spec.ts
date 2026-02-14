// ---- Mocks ----

import { createLoggerMock } from '../../../test/mocks/logger.mock';

const mockLogger = createLoggerMock();
const mockExecFileAsync = jest.fn();

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExecFileAsync(...args),
}));

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
  extractErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const mockFindCliInPath = jest.fn();
const mockFindCliInLocalPaths = jest.fn();
jest.mock('./cli-detection', () => ({
  findCliInPath: (...args: unknown[]) => mockFindCliInPath(...args),
  findCliInLocalPaths: (...args: unknown[]) => mockFindCliInLocalPaths(...args),
}));

const mockJoinPaths = jest.fn((...parts: string[]) => parts.join('/'));
const mockGetHomeDir = jest.fn(() => '/home/testuser');
const mockIsWindows = jest.fn(() => false);
const mockIsMac = jest.fn(() => false);
const mockIsLinux = jest.fn(() => false);
jest.mock('./path', () => ({
  joinPaths: (...args: unknown[]) => mockJoinPaths(...args),
  getHomeDir: () => mockGetHomeDir(),
  isWindows: () => mockIsWindows(),
  isMac: () => mockIsMac(),
  isLinux: () => mockIsLinux(),
}));

// ---- Tests ----

import {
  getGhCliPaths,
  findGhCli,
  getGhCliVersion,
  checkGhAuth,
  getGhCliStatus,
} from './github-detection';

describe('github-detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWindows.mockReturnValue(false);
    mockIsMac.mockReturnValue(false);
    mockIsLinux.mockReturnValue(false);
    mockGetHomeDir.mockReturnValue('/home/testuser');
  });

  // ================================================================
  // getGhCliPaths
  // ================================================================
  describe('getGhCliPaths', () => {
    const savedProgramFiles = process.env['ProgramFiles'];
    const savedLocalAppData = process.env['LOCALAPPDATA'];

    afterEach(() => {
      // Restore env vars to avoid leaks between tests
      if (savedProgramFiles !== undefined) {
        process.env['ProgramFiles'] = savedProgramFiles;
      } else {
        delete process.env['ProgramFiles'];
      }
      if (savedLocalAppData !== undefined) {
        process.env['LOCALAPPDATA'] = savedLocalAppData;
      } else {
        delete process.env['LOCALAPPDATA'];
      }
    });

    it('should return Windows paths with .exe on Windows', () => {
      mockIsWindows.mockReturnValue(true);
      process.env['ProgramFiles'] = 'C:\\Program Files';
      process.env['LOCALAPPDATA'] = 'C:\\Users\\test\\AppData\\Local';

      const result = getGhCliPaths();

      expect(result.length).toBe(4);
      const pathStr = result.join(' ');
      expect(pathStr).toContain('gh.exe');
      expect(pathStr).toContain('GitHub CLI');
    });

    it('should use default paths when env vars not set on Windows', () => {
      mockIsWindows.mockReturnValue(true);
      delete process.env['ProgramFiles'];
      delete process.env['LOCALAPPDATA'];

      const result = getGhCliPaths();

      expect(result.length).toBe(4);
      const pathStr = result.join(' ');
      expect(pathStr).toContain('gh.exe');
      expect(pathStr).toContain('AppData');
    });

    it('should return macOS paths on macOS', () => {
      mockIsMac.mockReturnValue(true);

      const result = getGhCliPaths();

      const pathStr = result.join(' ');
      expect(pathStr).toContain('/usr/local/bin/gh');
      expect(pathStr).toContain('/usr/bin/gh');
      expect(pathStr).toContain('/opt/homebrew/bin/gh');
      expect(pathStr).toContain('.local/bin/gh');
      // Should NOT include snap path
      expect(pathStr).not.toContain('/snap/bin/gh');
    });

    it('should return Linux paths on Linux', () => {
      mockIsLinux.mockReturnValue(true);

      const result = getGhCliPaths();

      const pathStr = result.join(' ');
      expect(pathStr).toContain('/usr/local/bin/gh');
      expect(pathStr).toContain('/usr/bin/gh');
      expect(pathStr).toContain('/snap/bin/gh');
      expect(pathStr).toContain('.local/bin/gh');
      // Should NOT include homebrew path
      expect(pathStr).not.toContain('/opt/homebrew/bin/gh');
    });

    it('should return base Unix paths when neither macOS nor Linux', () => {
      // All platform flags false (default)
      const result = getGhCliPaths();

      expect(result.length).toBe(3);
      const pathStr = result.join(' ');
      expect(pathStr).toContain('/usr/local/bin/gh');
      expect(pathStr).toContain('/usr/bin/gh');
      expect(pathStr).toContain('.local/bin/gh');
    });
  });

  // ================================================================
  // findGhCli
  // ================================================================
  describe('findGhCli', () => {
    it('should return path method when found in PATH', async () => {
      mockFindCliInPath.mockResolvedValue('/usr/local/bin/gh');

      const result = await findGhCli();

      expect(result).toEqual({ cliPath: '/usr/local/bin/gh', method: 'path' });
      expect(mockFindCliInPath).toHaveBeenCalledWith('gh');
    });

    it('should fall back to local paths when not in PATH', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue('/home/testuser/.local/bin/gh');

      const result = await findGhCli();

      expect(result).toEqual({
        cliPath: '/home/testuser/.local/bin/gh',
        method: 'local',
      });
    });

    it('should return method none when not found anywhere', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);

      const result = await findGhCli();

      expect(result).toEqual({ method: 'none' });
      expect(result.cliPath).toBeUndefined();
    });

    it('should prefer PATH over local paths', async () => {
      mockFindCliInPath.mockResolvedValue('/usr/bin/gh');
      mockFindCliInLocalPaths.mockReturnValue('/home/testuser/.local/bin/gh');

      const result = await findGhCli();

      expect(result.method).toBe('path');
      expect(result.cliPath).toBe('/usr/bin/gh');
      expect(mockFindCliInLocalPaths).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // getGhCliVersion
  // ================================================================
  describe('getGhCliVersion', () => {
    it('should parse version from standard output', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'gh version 2.40.1 (2024-01-15)\nhttps://github.com/cli/cli/releases/tag/v2.40.1\n',
      });

      const result = await getGhCliVersion('/usr/local/bin/gh');

      expect(result).toBe('2.40.1');
      expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/local/bin/gh', ['--version']);
    });

    it('should fall back to first line when regex does not match', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'some unusual version string\n' });

      const result = await getGhCliVersion('/usr/local/bin/gh');

      expect(result).toBe('some unusual version string');
    });

    it('should return undefined on error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('ENOENT'));

      const result = await getGhCliVersion('/nonexistent/gh');

      expect(result).toBeUndefined();
    });
  });

  // ================================================================
  // checkGhAuth
  // ================================================================
  describe('checkGhAuth', () => {
    it('should return authenticated with username and scopes', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout:
          'Logged in to github.com account testuser (keyring)\nToken scopes: repo, read:org, workflow\n',
        stderr: '',
      });

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({
        authenticated: true,
        username: 'testuser',
        scopes: ['repo', 'read:org', 'workflow'],
      });
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        '/usr/local/bin/gh',
        ['auth', 'status'],
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('should return authenticated without scopes when scopes line is missing', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Logged in to github.com account testuser (keyring)\n',
        stderr: '',
      });

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({
        authenticated: true,
        username: 'testuser',
        scopes: undefined,
      });
    });

    it('should return authenticated from stderr output', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: '',
        stderr: 'Logged in to github.com account myuser (keyring)\nToken scopes: repo\n',
      });

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({
        authenticated: true,
        username: 'myuser',
        scopes: ['repo'],
      });
    });

    it('should return not authenticated when output lacks login indicator', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: 'some other output',
        stderr: '',
      });

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({ authenticated: false });
    });

    it('should return not authenticated when error message says not logged in', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('not logged in to any github hosts'));

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({ authenticated: false });
    });

    it('should return not authenticated when error says no authentication', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('no authentication token'));

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({ authenticated: false });
    });

    it('should return not authenticated for "You are not logged" error', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('You are not logged into any GitHub hosts'));

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({ authenticated: false });
    });

    it('should return not authenticated on unexpected errors', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('Connection refused'));

      const result = await checkGhAuth('/usr/local/bin/gh');

      expect(result).toEqual({ authenticated: false });
    });
  });

  // ================================================================
  // getGhCliStatus
  // ================================================================
  describe('getGhCliStatus', () => {
    it('should return full status when CLI is installed and authenticated', async () => {
      mockFindCliInPath.mockResolvedValue('/usr/local/bin/gh');
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'gh version 2.40.1 (2024-01-15)\n' })
        .mockResolvedValueOnce({
          stdout: 'Logged in to github.com account testuser (keyring)\nToken scopes: repo\n',
          stderr: '',
        });

      const result = await getGhCliStatus();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/gh');
      expect(result.version).toBe('2.40.1');
      expect(result.method).toBe('path');
      expect(result.auth).toEqual({
        authenticated: true,
        username: 'testuser',
        scopes: ['repo'],
      });
      expect(result.platform).toBeDefined();
      expect(result.arch).toBeDefined();
    });

    it('should return not installed when CLI is not found', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);

      const result = await getGhCliStatus();

      expect(result.installed).toBe(false);
      expect(result.path).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.auth).toEqual({ authenticated: false });
    });

    it('should not fetch version or auth when CLI is not found', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);

      await getGhCliStatus();

      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should include platform and arch from process', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);

      const result = await getGhCliStatus();

      expect(result.platform).toBe(process.platform);
      expect(result.arch).toBe(process.arch);
    });
  });
});
