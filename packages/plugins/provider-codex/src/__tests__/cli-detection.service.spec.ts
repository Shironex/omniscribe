// ---- Mocks ----

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockExecFileAsync = jest.fn();
const mockExecAsync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
}));

// Track which child_process function was promisified via references
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

import { CodexCliDetectionService } from '../services/cli-detection.service';

// ---- Tests ----

describe('CodexCliDetectionService', () => {
  let service: CodexCliDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CodexCliDetectionService();
    // Default: readdirSync returns empty (no NVM/fnm versions)
    mockReaddirSync.mockReturnValue([]);
  });

  // ================================================================
  // getCodexCliPaths
  // ================================================================
  describe('getCodexCliPaths', () => {
    it('should return Unix paths on non-Windows platforms', () => {
      const result = service.getCodexCliPaths();

      expect(result.length).toBeGreaterThan(0);
      const pathStr = result.join(' ');
      expect(pathStr).toContain('.local/bin/codex');
      expect(pathStr).toContain('/usr/local/bin/codex');
    });
  });

  // ================================================================
  // findCodexCli
  // ================================================================
  describe('findCodexCli', () => {
    it('should return path when found in PATH', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/local/bin/codex\n' });

      const result = await service.findCodexCli();

      expect(result).toBe('/usr/local/bin/codex');
    });

    it('should fall back to local paths when not in PATH', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockImplementation((p: string) => {
        return p.includes('.local/bin/codex');
      });

      const result = await service.findCodexCli();

      expect(result).toBeDefined();
      expect(result).toContain('codex');
    });

    it('should return undefined when not found anywhere', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await service.findCodexCli();

      expect(result).toBeUndefined();
    });

    it('should prefer PATH over local paths', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/bin/codex\n' });
      mockExistsSync.mockReturnValue(true);

      const result = await service.findCodexCli();

      expect(result).toBe('/usr/bin/codex');
    });
  });

  // ================================================================
  // getVersion
  // ================================================================
  describe('getVersion', () => {
    it('should return trimmed version string on success', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '0.1.0\n' });

      const result = await service.getVersion('/usr/local/bin/codex');

      expect(result).toBe('0.1.0');
      expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/local/bin/codex', ['--version']);
    });

    it('should return undefined on failure', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getVersion('/nonexistent/codex');

      expect(result).toBeUndefined();
    });

    it('should handle version string with extra whitespace', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '  0.2.0-beta  \n' });

      const result = await service.getVersion('/usr/local/bin/codex');

      expect(result).toBe('0.2.0-beta');
    });
  });

  // ================================================================
  // checkAuth
  // ================================================================
  describe('checkAuth', () => {
    it('should return authenticated true when auth file has access_token', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          access_token: 'sk-test-token-123',
        })
      );

      // checkAuth is async but first two checks are sync
      return expect(service.checkAuth()).resolves.toEqual({ authenticated: true });
    });

    it('should return authenticated true when auth file has oauth_token', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          oauth_token: 'oauth-token-abc',
        })
      );

      return expect(service.checkAuth()).resolves.toEqual({ authenticated: true });
    });

    it('should return authenticated true when auth file has api_key', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          api_key: 'key-xyz',
        })
      );

      return expect(service.checkAuth()).resolves.toEqual({ authenticated: true });
    });

    it('should return authenticated true when auth file has OPENAI_API_KEY', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          OPENAI_API_KEY: 'sk-openai-key',
        })
      );

      return expect(service.checkAuth()).resolves.toEqual({ authenticated: true });
    });

    it('should return authenticated true when nested tokens have access_token', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          tokens: { access_token: 'nested-token' },
        })
      );

      return expect(service.checkAuth()).resolves.toEqual({ authenticated: true });
    });

    it('should return authenticated true when OPENAI_API_KEY env var is set', async () => {
      mockExistsSync.mockReturnValue(false);
      const original = process.env['OPENAI_API_KEY'];

      try {
        process.env['OPENAI_API_KEY'] = 'env-api-key';
        const result = await service.checkAuth();
        expect(result).toEqual({ authenticated: true });
      } finally {
        if (original !== undefined) {
          process.env['OPENAI_API_KEY'] = original;
        } else {
          delete process.env['OPENAI_API_KEY'];
        }
      }
    });

    it('should fall back to CLI login status when fast checks fail', async () => {
      mockExistsSync.mockReturnValue(false);
      const original = process.env['OPENAI_API_KEY'];

      try {
        delete process.env['OPENAI_API_KEY'];
        mockExecAsync.mockResolvedValue({ stdout: 'logged in as user@test.com', stderr: '' });

        const result = await service.checkAuth('/usr/local/bin/codex');

        expect(result).toEqual({ authenticated: true });
      } finally {
        if (original !== undefined) {
          process.env['OPENAI_API_KEY'] = original;
        } else {
          delete process.env['OPENAI_API_KEY'];
        }
      }
    });

    it('should return authenticated false when no credentials found', async () => {
      // Reset all mock implementations to prevent leakage from prior tests
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      mockExecAsync.mockRejectedValue(new Error('not found'));

      const original = process.env['OPENAI_API_KEY'];

      try {
        delete process.env['OPENAI_API_KEY'];
        const result = await service.checkAuth();
        expect(result).toEqual({ authenticated: false });
      } finally {
        if (original !== undefined) {
          process.env['OPENAI_API_KEY'] = original;
        } else {
          delete process.env['OPENAI_API_KEY'];
        }
      }
    });

    it('should return authenticated false when auth file has empty tokens', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          access_token: '',
          oauth_token: '',
          api_key: '',
          OPENAI_API_KEY: '',
        })
      );

      const original = process.env['OPENAI_API_KEY'];

      try {
        delete process.env['OPENAI_API_KEY'];
        const result = await service.checkAuth();
        expect(result).toEqual({ authenticated: false });
      } finally {
        if (original !== undefined) {
          process.env['OPENAI_API_KEY'] = original;
        } else {
          delete process.env['OPENAI_API_KEY'];
        }
      }
    });

    it('should handle malformed JSON in auth file gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json{{{');

      const original = process.env['OPENAI_API_KEY'];

      try {
        delete process.env['OPENAI_API_KEY'];
        const result = await service.checkAuth();
        expect(result).toEqual({ authenticated: false });
      } finally {
        if (original !== undefined) {
          process.env['OPENAI_API_KEY'] = original;
        } else {
          delete process.env['OPENAI_API_KEY'];
        }
      }
    });
  });

  // ================================================================
  // detect (plugin-api format)
  // ================================================================
  describe('detect', () => {
    it('should return CliDetectionResult structure when installed', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '/usr/local/bin/codex\n' });
      mockExecFileAsync.mockResolvedValue({ stdout: '0.1.0\n' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ access_token: 'token' }));

      const result = await service.detect();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('0.1.0');
      expect(result.path).toBeDefined();
      expect(result.auth).toEqual({ authenticated: true });
    });

    it('should return not-installed when CLI is not found', async () => {
      mockExecAsync.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await service.detect();

      expect(result.installed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
