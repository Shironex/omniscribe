import { Test, TestingModule } from '@nestjs/testing';
import { CliCommandService, CliSessionContext } from './cli-command.service';

// Mock os module - platform() and homedir() are native bindings and can't be spied on
const mockPlatform = jest.fn().mockReturnValue('linux');
const mockHomedir = jest.fn().mockReturnValue('/home/testuser');

jest.mock('os', () => ({
  platform: (...args: unknown[]) => mockPlatform(...args),
  homedir: (...args: unknown[]) => mockHomedir(...args),
}));

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

// Import after mocks are set up
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const mockedExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

describe('CliCommandService', () => {
  let service: CliCommandService;

  // Store original env values for restoration
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CliCommandService],
    }).compile();

    service = module.get<CliCommandService>(CliCommandService);

    // Reset to defaults
    mockPlatform.mockReturnValue('linux');
    mockHomedir.mockReturnValue('/home/testuser');
    mockedExecFileSync.mockReset();
    mockedExistsSync.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================
  // getAiModeName
  // =========================================================

  describe('getAiModeName', () => {
    it('should return "Claude" for claude mode', () => {
      expect(service.getAiModeName('claude')).toBe('Claude');
    });

    it('should return "Plain Terminal" for plain mode', () => {
      expect(service.getAiModeName('plain')).toBe('Plain Terminal');
    });

    it('should return "Unknown" for an unrecognized mode', () => {
      expect(service.getAiModeName('nonexistent' as any)).toBe('Unknown');
    });
  });

  // =========================================================
  // getCliConfig - plain mode
  // =========================================================

  describe('getCliConfig (plain mode)', () => {
    it('should return shell command on linux', () => {
      mockPlatform.mockReturnValue('linux');
      process.env.SHELL = '/bin/zsh';

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('/bin/zsh');
      expect(config.args).toEqual(['-l']);
    });

    it('should return shell command on macOS', () => {
      mockPlatform.mockReturnValue('darwin');
      process.env.SHELL = '/bin/bash';

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('/bin/bash');
      expect(config.args).toEqual(['-l']);
    });

    it('should fall back to /bin/bash when SHELL is not set on unix', () => {
      mockPlatform.mockReturnValue('linux');
      delete process.env.SHELL;

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('/bin/bash');
      expect(config.args).toEqual(['-l']);
    });

    it('should return cmd.exe on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe';

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('C:\\Windows\\System32\\cmd.exe');
      expect(config.args).toEqual([]);
    });

    it('should fall back to cmd.exe when COMSPEC is not set on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      delete process.env.COMSPEC;

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('cmd.exe');
      expect(config.args).toEqual([]);
    });
  });

  // =========================================================
  // getCliConfig - claude mode
  // =========================================================

  describe('getCliConfig (claude mode)', () => {
    beforeEach(() => {
      // Default: claude found in PATH
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should return claude command found in PATH', () => {
      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('/usr/local/bin/claude');
    });

    it('should include --model flag when session has model', () => {
      const session: CliSessionContext = { model: 'opus' };

      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--model');
      expect(config.args).toContain('opus');
      const modelIdx = config.args.indexOf('--model');
      expect(config.args[modelIdx + 1]).toBe('opus');
    });

    it('should include --system-prompt flag when session has systemPrompt', () => {
      const session: CliSessionContext = { systemPrompt: 'Be concise.' };

      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--system-prompt');
      expect(config.args).toContain('Be concise.');
      const promptIdx = config.args.indexOf('--system-prompt');
      expect(config.args[promptIdx + 1]).toBe('Be concise.');
    });

    it('should include both model and system prompt when both provided', () => {
      const session: CliSessionContext = {
        model: 'sonnet',
        systemPrompt: 'You are a helpful assistant.',
      };

      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--model');
      expect(config.args).toContain('sonnet');
      expect(config.args).toContain('--system-prompt');
      expect(config.args).toContain('You are a helpful assistant.');
    });

    it('should always append --append-system-prompt with omniscribe instructions', () => {
      const config = service.getCliConfig('claude', {});

      expect(config.args).toContain('--append-system-prompt');
      const appendIdx = config.args.indexOf('--append-system-prompt');
      const omniscribePrompt = config.args[appendIdx + 1];
      expect(omniscribePrompt).toContain('Omniscribe Integration');
      expect(omniscribePrompt).toContain('mcp__omniscribe__omniscribe_status');
    });

    it('should not include --model flag when session has no model', () => {
      const config = service.getCliConfig('claude', {});

      expect(config.args).not.toContain('--model');
    });

    it('should not include --system-prompt flag when session has no systemPrompt', () => {
      const config = service.getCliConfig('claude', {});

      expect(config.args).not.toContain('--system-prompt');
    });
  });

  // =========================================================
  // CLI path resolution
  // =========================================================

  describe('CLI path resolution', () => {
    it('should use path from PATH when found via which/where', () => {
      mockPlatform.mockReturnValue('linux');
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('/usr/local/bin/claude');
      expect(mockedExecFileSync).toHaveBeenCalledWith('which', ['claude'], expect.any(Object));
    });

    it('should use "where" on Windows to find in PATH', () => {
      mockPlatform.mockReturnValue('win32');
      mockedExecFileSync.mockReturnValue('C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd\n');

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['claude'], expect.any(Object));
    });

    it('should pick the first line when where returns multiple results', () => {
      mockPlatform.mockReturnValue('win32');
      mockedExecFileSync.mockReturnValue('C:\\path1\\claude.cmd\r\nC:\\path2\\claude.cmd\r\n');

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('C:\\path1\\claude.cmd');
    });

    it('should try .cmd and .exe extensions on Windows when bare command not found', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');

      // First call (where claude) fails, second call (where claude.cmd) succeeds
      mockedExecFileSync
        .mockImplementationOnce(() => {
          throw new Error('not found');
        })
        .mockReturnValueOnce('C:\\npm\\claude.cmd\n');

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('C:\\npm\\claude.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['claude.cmd'], expect.any(Object));
    });

    it('should try .exe extension on Windows when bare and .cmd both fail', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');

      // bare fails, .cmd fails, .exe succeeds
      mockedExecFileSync
        .mockImplementationOnce(() => {
          throw new Error('not found');
        })
        .mockImplementationOnce(() => {
          throw new Error('not found');
        })
        .mockReturnValueOnce('C:\\bin\\claude.exe\n');

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('C:\\bin\\claude.exe');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['claude.exe'], expect.any(Object));
    });

    it('should fall back to known paths when PATH lookup fails on linux', () => {
      mockPlatform.mockReturnValue('linux');
      mockHomedir.mockReturnValue('/home/testuser');

      // PATH lookup fails
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      // The second known path exists
      mockedExistsSync.mockImplementation((p: fs.PathLike) => {
        return p === '/usr/bin/claude';
      });

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('/usr/bin/claude');
    });

    it('should fall back to known paths when PATH lookup fails on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');
      const appData = 'C:\\Users\\test\\AppData\\Roaming';
      process.env.APPDATA = appData;

      // All PATH lookups fail
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      // A known Windows path exists — use path.join so the expected value
      // matches regardless of which OS runs the test (CI uses Linux)
      const expectedPath = path.join(appData, 'npm', 'claude.cmd');
      mockedExistsSync.mockImplementation((p: fs.PathLike) => {
        return p === expectedPath;
      });

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe(expectedPath);
    });

    it('should fall back to bare "claude" command when nothing found', () => {
      mockPlatform.mockReturnValue('linux');

      // PATH lookup fails
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      // No known paths exist
      mockedExistsSync.mockReturnValue(false);

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('claude');
    });

    it('should fall back to bare command on Windows when nothing found', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');

      // All PATH lookups fail
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      // No known paths exist
      mockedExistsSync.mockReturnValue(false);

      const config = service.getCliConfig('claude', {});

      expect(config.command).toBe('claude');
    });

    it('should handle existsSync throwing an error gracefully', () => {
      mockPlatform.mockReturnValue('linux');

      // PATH lookup fails
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      // existsSync throws on all paths
      mockedExistsSync.mockImplementation(() => {
        throw new Error('permission denied');
      });

      const config = service.getCliConfig('claude', {});

      // Should still fall back to bare command without throwing
      expect(config.command).toBe('claude');
    });

    it('should handle execFileSync returning empty string', () => {
      mockPlatform.mockReturnValue('linux');

      // which returns empty string
      mockedExecFileSync.mockReturnValue('   \n');
      mockedExistsSync.mockReturnValue(false);

      const config = service.getCliConfig('claude', {});

      // Empty trimmed result should fall through to known paths / fallback
      // The first line after split is empty, so findInPath returns null
      expect(config.command).toBe('claude');
    });
  });

  // =========================================================
  // Resume, fork, and continue flags
  // =========================================================

  describe('getCliConfig resume/fork/continue flags', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should include --resume flag when resumeSessionId is set', () => {
      const session: CliSessionContext = { resumeSessionId: 'abc-123' };
      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--resume');
      expect(config.args).toContain('abc-123');
      const resumeIdx = config.args.indexOf('--resume');
      expect(config.args[resumeIdx + 1]).toBe('abc-123');
    });

    it('should include --resume and --fork-session flags when forkSessionId is set', () => {
      const session: CliSessionContext = { forkSessionId: 'fork-456' };
      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--resume');
      expect(config.args).toContain('fork-456');
      expect(config.args).toContain('--fork-session');
      const resumeIdx = config.args.indexOf('--resume');
      expect(config.args[resumeIdx + 1]).toBe('fork-456');
    });

    it('should include --continue flag when continueLastSession is set', () => {
      const session: CliSessionContext = { continueLastSession: true };
      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--continue');
      // --resume and --fork-session should NOT be present
      expect(config.args).not.toContain('--resume');
      expect(config.args).not.toContain('--fork-session');
    });

    it('should skip system prompt when resuming', () => {
      const session: CliSessionContext = {
        resumeSessionId: 'abc-123',
        systemPrompt: 'Be concise.',
      };
      const config = service.getCliConfig('claude', session);

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should skip system prompt when forking', () => {
      const session: CliSessionContext = {
        forkSessionId: 'fork-456',
        systemPrompt: 'Be concise.',
      };
      const config = service.getCliConfig('claude', session);

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should skip system prompt when continuing', () => {
      const session: CliSessionContext = {
        continueLastSession: true,
        systemPrompt: 'Be concise.',
      };
      const config = service.getCliConfig('claude', session);

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should prioritize --continue over --resume (mutually exclusive)', () => {
      const session: CliSessionContext = {
        continueLastSession: true,
        resumeSessionId: 'abc-123',
      };
      const config = service.getCliConfig('claude', session);

      expect(config.args).toContain('--continue');
      expect(config.args).not.toContain('--resume');
    });

    it('should include --dangerously-skip-permissions before other flags', () => {
      const session: CliSessionContext = {
        skipPermissions: true,
        forkSessionId: 'fork-456',
      };
      const config = service.getCliConfig('claude', session);

      const skipIdx = config.args.indexOf('--dangerously-skip-permissions');
      const resumeIdx = config.args.indexOf('--resume');
      expect(skipIdx).toBeLessThan(resumeIdx);
    });
  });

  // =========================================================
  // Default case in getCliConfig
  // =========================================================

  describe('getCliConfig default case', () => {
    it('should treat unknown aiMode as plain terminal', () => {
      mockPlatform.mockReturnValue('linux');
      process.env.SHELL = '/bin/bash';

      const config = service.getCliConfig('unknown-mode' as any, {});

      expect(config.command).toBe('/bin/bash');
      expect(config.args).toEqual(['-l']);
    });
  });
});
