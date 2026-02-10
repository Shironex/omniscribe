// ---- Mocks ----

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExecFileAsync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExecFileAsync(...args),
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
jest.mock('./path', () => ({
  joinPaths: (...args: unknown[]) => mockJoinPaths(...args),
  getHomeDir: () => mockGetHomeDir(),
  isWindows: () => mockIsWindows(),
}));

// ---- Tests ----

import {
  getClaudeConfigDir,
  getClaudeCredentialPaths,
  getClaudeCliPaths,
  findClaudeCli,
  getClaudeCliVersion,
  checkClaudeAuth,
  getClaudeCliStatus,
} from './claude-detection';

describe('claude-detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWindows.mockReturnValue(false);
    mockGetHomeDir.mockReturnValue('/home/testuser');
  });

  // ================================================================
  // getClaudeConfigDir
  // ================================================================
  describe('getClaudeConfigDir', () => {
    it('should return ~/.claude path', () => {
      const result = getClaudeConfigDir();

      expect(result).toBe('/home/testuser/.claude');
      expect(mockGetHomeDir).toHaveBeenCalled();
      expect(mockJoinPaths).toHaveBeenCalledWith('/home/testuser', '.claude');
    });
  });

  // ================================================================
  // getClaudeCredentialPaths
  // ================================================================
  describe('getClaudeCredentialPaths', () => {
    it('should return paths to both credential files', () => {
      const result = getClaudeCredentialPaths();

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('.credentials.json');
      expect(result[1]).toContain('credentials.json');
      // First should be the dotfile variant
      expect(result[0]).not.toBe(result[1]);
    });
  });

  // ================================================================
  // getClaudeCliPaths
  // ================================================================
  describe('getClaudeCliPaths', () => {
    it('should return Unix paths on non-Windows platforms', () => {
      mockIsWindows.mockReturnValue(false);

      const result = getClaudeCliPaths();

      expect(result.length).toBeGreaterThan(0);
      // Should include common Unix paths
      const pathStr = result.join(' ');
      expect(pathStr).toContain('.local/bin/claude');
      expect(pathStr).toContain('/usr/local/bin/claude');
    });

    it('should return Windows paths on Windows platform', () => {
      mockIsWindows.mockReturnValue(true);
      process.env['APPDATA'] = 'C:/Users/test/AppData/Roaming';
      process.env['LOCALAPPDATA'] = 'C:/Users/test/AppData/Local';

      const result = getClaudeCliPaths();

      expect(result.length).toBeGreaterThan(0);
      // Should include Windows-specific paths
      const pathStr = result.join(' ');
      expect(pathStr).toContain('claude.exe');

      delete process.env['APPDATA'];
      delete process.env['LOCALAPPDATA'];
    });

    it('should use default AppData paths when env vars not set on Windows', () => {
      mockIsWindows.mockReturnValue(true);
      delete process.env['APPDATA'];
      delete process.env['LOCALAPPDATA'];

      const result = getClaudeCliPaths();

      expect(result.length).toBeGreaterThan(0);
      // Should still generate paths using home dir fallback
      const pathStr = result.join(' ');
      expect(pathStr).toContain('AppData');
    });
  });

  // ================================================================
  // findClaudeCli
  // ================================================================
  describe('findClaudeCli', () => {
    it('should return path method when found in PATH', async () => {
      mockFindCliInPath.mockResolvedValue('/usr/local/bin/claude');

      const result = await findClaudeCli();

      expect(result).toEqual({ cliPath: '/usr/local/bin/claude', method: 'path' });
      expect(mockFindCliInPath).toHaveBeenCalledWith('claude');
    });

    it('should fall back to local paths when not in PATH', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue('/home/testuser/.local/bin/claude');

      const result = await findClaudeCli();

      expect(result).toEqual({
        cliPath: '/home/testuser/.local/bin/claude',
        method: 'local',
      });
    });

    it('should return method none when not found anywhere', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);

      const result = await findClaudeCli();

      expect(result).toEqual({ method: 'none' });
      expect(result.cliPath).toBeUndefined();
    });

    it('should prefer PATH over local paths', async () => {
      mockFindCliInPath.mockResolvedValue('/usr/bin/claude');
      mockFindCliInLocalPaths.mockReturnValue('/home/testuser/.local/bin/claude');

      const result = await findClaudeCli();

      expect(result.method).toBe('path');
      expect(result.cliPath).toBe('/usr/bin/claude');
      // Should not even check local paths
      expect(mockFindCliInLocalPaths).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // getClaudeCliVersion
  // ================================================================
  describe('getClaudeCliVersion', () => {
    it('should return trimmed version string on success', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '1.0.27\n' });

      const result = await getClaudeCliVersion('/usr/local/bin/claude');

      expect(result).toBe('1.0.27');
      expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/local/bin/claude', ['--version']);
    });

    it('should return undefined on failure', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('ENOENT'));

      const result = await getClaudeCliVersion('/nonexistent/claude');

      expect(result).toBeUndefined();
    });

    it('should handle version string with extra whitespace', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '  2.0.0 (Claude Code)  \n' });

      const result = await getClaudeCliVersion('/usr/local/bin/claude');

      expect(result).toBe('2.0.0 (Claude Code)');
    });
  });

  // ================================================================
  // checkClaudeAuth
  // ================================================================
  describe('checkClaudeAuth', () => {
    it('should return authenticated true when claudeAiOauth accessToken exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          claudeAiOauth: { accessToken: 'sk-test-token-123' },
        })
      );

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated true when oauth_token exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          oauth_token: 'oauth-token-abc',
        })
      );

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated true when top-level accessToken exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          accessToken: 'token-xyz',
        })
      );

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated false when no credentials found', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should return authenticated false when credential files have no valid tokens', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ someOtherKey: 'value' }));

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should return authenticated false when token is empty string', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          claudeAiOauth: { accessToken: '' },
          oauth_token: '',
          accessToken: '',
        })
      );

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle malformed JSON in credential files gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json{{{');

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle credential file that is not an object', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('"just a string"');

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle credential file that is null', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('null');

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should fall back to config file oauthAccount check', async () => {
      // No credential files exist
      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('.claude.json') && !p.includes('credentials')) {
          return true;
        }
        return false;
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          oauthAccount: { accountUuid: 'uuid-123-abc' },
        })
      );

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return false when config oauthAccount has empty accountUuid', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('.claude.json') && !p.includes('credentials')) {
          return true;
        }
        return false;
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          oauthAccount: { accountUuid: '' },
        })
      );

      const result = await checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });
  });

  // ================================================================
  // getClaudeCliStatus
  // ================================================================
  describe('getClaudeCliStatus', () => {
    it('should assemble full status when CLI is installed and authenticated', async () => {
      mockFindCliInPath.mockResolvedValue('/usr/local/bin/claude');
      mockExecFileAsync.mockResolvedValue({ stdout: '1.0.27\n' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ claudeAiOauth: { accessToken: 'token' } }));

      const result = await getClaudeCliStatus();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/claude');
      expect(result.version).toBe('1.0.27');
      expect(result.method).toBe('path');
      expect(result.auth).toEqual({ authenticated: true });
      expect(result.platform).toBeDefined();
      expect(result.arch).toBeDefined();
    });

    it('should return not installed status when CLI is not found', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);
      mockExistsSync.mockReturnValue(false);

      const result = await getClaudeCliStatus();

      expect(result.installed).toBe(false);
      expect(result.path).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.method).toBeUndefined();
    });

    it('should not fetch version when CLI is not found', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);
      mockExistsSync.mockReturnValue(false);

      await getClaudeCliStatus();

      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should set method to undefined when detection method is none', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);
      mockExistsSync.mockReturnValue(false);

      const result = await getClaudeCliStatus();

      expect(result.method).toBeUndefined();
    });

    it('should include platform and arch from process', async () => {
      mockFindCliInPath.mockResolvedValue(undefined);
      mockFindCliInLocalPaths.mockReturnValue(undefined);
      mockExistsSync.mockReturnValue(false);

      const result = await getClaudeCliStatus();

      expect(result.platform).toBe(process.platform);
      expect(result.arch).toBe(process.arch);
    });
  });
});
