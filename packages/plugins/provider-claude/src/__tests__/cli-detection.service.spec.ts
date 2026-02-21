// ---- Mocks ----

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExecFileAsync = jest.fn();
const mockExecAsync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

// Track which child_process function was promisified via a WeakSet
const execRef = jest.fn();
const execFileRef = jest.fn();

jest.mock('child_process', () => ({
  exec: execRef,
  execFile: execFileRef,
}));

// Mock util.promisify to intercept both exec and execFile async versions
jest.mock('util', () => ({
  promisify: (fn: unknown) => {
    if (fn === execRef) {
      return (...args: unknown[]) => mockExecAsync(...args);
    }
    return (...args: unknown[]) => mockExecFileAsync(...args);
  },
}));

jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/testuser'),
  platform: jest.fn().mockReturnValue('linux'),
}));

jest.mock('@omniscribe/shared', () => {
  const actual = jest.requireActual('@omniscribe/shared');
  return {
    ...actual,
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };
});

// ---- Import after mocks ----

import { ClaudeCliDetectionService } from '../services/cli-detection.service';
import * as os from 'os';

const mockedPlatform = os.platform as jest.MockedFunction<typeof os.platform>;

// ---- Tests ----

describe('ClaudeCliDetectionService', () => {
  let service: ClaudeCliDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClaudeCliDetectionService();
  });

  // ================================================================
  // getClaudeConfigDir
  // ================================================================
  describe('getClaudeConfigDir', () => {
    it('should return ~/.claude path', () => {
      const result = service.getClaudeConfigDir();
      expect(result).toContain('.claude');
      expect(result).toContain('testuser');
    });
  });

  // ================================================================
  // getClaudeCredentialPaths
  // ================================================================
  describe('getClaudeCredentialPaths', () => {
    it('should return paths to both credential files', () => {
      const result = service.getClaudeCredentialPaths();

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('.credentials.json');
      expect(result[1]).toContain('credentials.json');
      expect(result[0]).not.toBe(result[1]);
    });
  });

  // ================================================================
  // getClaudeCliPaths
  // ================================================================
  describe('getClaudeCliPaths', () => {
    it('should return Unix paths on non-Windows platforms', () => {
      mockedPlatform.mockReturnValue('linux' as NodeJS.Platform);

      const result = service.getClaudeCliPaths();

      expect(result.length).toBeGreaterThan(0);
      const pathStr = result.join(' ');
      expect(pathStr).toContain('.local/bin/claude');
      expect(pathStr).toContain('/usr/local/bin/claude');
    });

    it('should return Windows paths on Windows platform', () => {
      mockedPlatform.mockReturnValue('win32' as NodeJS.Platform);
      process.env['APPDATA'] = 'C:/Users/test/AppData/Roaming';
      process.env['LOCALAPPDATA'] = 'C:/Users/test/AppData/Local';

      try {
        const result = service.getClaudeCliPaths();

        expect(result.length).toBeGreaterThan(0);
        const pathStr = result.join(' ');
        expect(pathStr).toContain('claude.exe');
      } finally {
        delete process.env['APPDATA'];
        delete process.env['LOCALAPPDATA'];
        mockedPlatform.mockReturnValue('linux' as NodeJS.Platform);
      }
    });
  });

  // ================================================================
  // findClaudeCli
  // ================================================================
  describe('findClaudeCli', () => {
    it('should return path method when found in PATH', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/local/bin/claude\n' });

      const result = await service.findClaudeCli();

      expect(result).toEqual({ cliPath: '/usr/local/bin/claude', method: 'path' });
    });

    it('should fall back to local paths when not in PATH', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockImplementation((p: string) => {
        return p.includes('.local/bin/claude');
      });

      const result = await service.findClaudeCli();

      expect(result.method).toBe('local');
      expect(result.cliPath).toBeDefined();
    });

    it('should return method none when not found anywhere', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await service.findClaudeCli();

      expect(result).toEqual({ method: 'none' });
      expect(result.cliPath).toBeUndefined();
    });

    it('should prefer PATH over local paths', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/bin/claude\n' });
      mockExistsSync.mockReturnValue(true);

      const result = await service.findClaudeCli();

      expect(result.method).toBe('path');
      expect(result.cliPath).toBe('/usr/bin/claude');
    });
  });

  // ================================================================
  // getClaudeCliVersion
  // ================================================================
  describe('getClaudeCliVersion', () => {
    it('should return trimmed version string on success', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '1.0.27\n' });

      const result = await service.getClaudeCliVersion('/usr/local/bin/claude');

      expect(result).toBe('1.0.27');
      expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/local/bin/claude', ['--version']);
    });

    it('should return undefined on failure', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getClaudeCliVersion('/nonexistent/claude');

      expect(result).toBeUndefined();
    });

    it('should handle version string with extra whitespace', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '  2.0.0 (Claude Code)  \n' });

      const result = await service.getClaudeCliVersion('/usr/local/bin/claude');

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

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated true when oauth_token exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          oauth_token: 'oauth-token-abc',
        })
      );

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated true when top-level accessToken exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          accessToken: 'token-xyz',
        })
      );

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated false when no credentials found', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should return authenticated false when credential files have no valid tokens', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ someOtherKey: 'value' }));

      const result = await service.checkClaudeAuth();

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

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle malformed JSON in credential files gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json{{{');

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle credential file that is not an object', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('"just a string"');

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle credential file that is null', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('null');

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });

    it('should fall back to config file oauthAccount check', async () => {
      // Credential files do not exist, but config file exists with oauthAccount
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

      const result = await service.checkClaudeAuth();

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

      const result = await service.checkClaudeAuth();

      expect(result).toEqual({ authenticated: false });
    });
  });

  // ================================================================
  // detect (plugin-api format)
  // ================================================================
  describe('detect', () => {
    it('should return CliDetectionResult structure', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/local/bin/claude\n' });
      mockExecFileAsync.mockResolvedValue({ stdout: '1.0.27\n' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ claudeAiOauth: { accessToken: 'token' } }));

      const result = await service.detect();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('1.0.27');
      expect(result.path).toBeDefined();
      expect(result.auth).toEqual({ authenticated: true });
    });

    it('should return not-installed when CLI is not found', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await service.detect();

      expect(result.installed).toBe(false);
      expect(result.version).toBeUndefined();
    });
  });

  // ================================================================
  // getFullStatus
  // ================================================================
  describe('getFullStatus', () => {
    it('should assemble full status when CLI is installed and authenticated', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/local/bin/claude\n' });
      mockExecFileAsync.mockResolvedValue({ stdout: '1.0.27\n' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ claudeAiOauth: { accessToken: 'token' } }));

      const result = await service.getFullStatus();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/claude');
      expect(result.version).toBe('1.0.27');
      expect(result.method).toBe('path');
      expect(result.auth).toEqual({ authenticated: true });
      expect(result.platform).toBeDefined();
      expect(result.arch).toBeDefined();
    });

    it('should return not installed status when CLI is not found', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await service.getFullStatus();

      expect(result.installed).toBe(false);
      expect(result.path).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.method).toBeUndefined();
    });

    it('should not fetch version when CLI is not found', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      await service.getFullStatus();

      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should include platform and arch from process', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await service.getFullStatus();

      expect(result.platform).toBe(process.platform);
      expect(result.arch).toBe(process.arch);
    });
  });
});
