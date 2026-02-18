// ---- Mocks ----

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

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Import after mocks are set up
import { CodexCliCommandService } from '../services/cli-command.service';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { LaunchContext } from '@omniscribe/plugin-api';

const mockedExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

describe('CodexCliCommandService', () => {
  let service: CodexCliCommandService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new CodexCliCommandService();
    mockPlatform.mockReturnValue('linux');
    mockHomedir.mockReturnValue('/home/testuser');
    mockedExecFileSync.mockReset();
    mockedExistsSync.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================
  // buildLaunch
  // =========================================================
  describe('buildLaunch', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/codex\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should return codex command found in PATH', () => {
      const config = service.buildLaunch({});

      expect(config.command).toBe('/usr/local/bin/codex');
    });

    it('should include --model flag when context has model', () => {
      const context: LaunchContext = { model: 'o3' };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--model');
      expect(config.args).toContain('o3');
      const modelIdx = config.args.indexOf('--model');
      expect(config.args[modelIdx + 1]).toBe('o3');
    });

    it('should include --dangerously-bypass-approvals-and-sandbox when skipPermissions is true', () => {
      const context: LaunchContext = { skipPermissions: true };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    });

    it('should not include permission bypass by default', () => {
      const config = service.buildLaunch({});

      expect(config.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    });

    it('should not include --model flag when context has no model', () => {
      const config = service.buildLaunch({});

      expect(config.args).not.toContain('--model');
    });

    it('should NOT include --system-prompt (Codex uses AGENTS.md)', () => {
      const context: LaunchContext = { systemPrompt: 'Be concise.' };
      const config = service.buildLaunch(context);

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should set cwd from context workingDirectory', () => {
      const context: LaunchContext = { workingDirectory: '/project/dir' };
      const config = service.buildLaunch(context);

      expect(config.cwd).toBe('/project/dir');
    });

    it('should include both skipPermissions and model when both provided', () => {
      const context: LaunchContext = { skipPermissions: true, model: 'o3-mini' };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(config.args).toContain('--model');
      expect(config.args).toContain('o3-mini');
    });
  });

  // =========================================================
  // buildResume
  // =========================================================
  describe('buildResume', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/codex\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should use "resume" subcommand with session ID', () => {
      const config = service.buildResume('abc-123', {});

      expect(config.args[0]).toBe('resume');
      expect(config.args[1]).toBe('abc-123');
    });

    it('should include --model flag when model is specified', () => {
      const config = service.buildResume('abc-123', { model: 'o3' });

      expect(config.args).toContain('--model');
      expect(config.args).toContain('o3');
    });

    it('should NOT include permission bypass flags on resume', () => {
      const config = service.buildResume('abc-123', { skipPermissions: true });

      // Codex resume does not support skip permissions
      expect(config.args[0]).toBe('resume');
    });
  });

  // =========================================================
  // buildFork
  // =========================================================
  describe('buildFork', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/codex\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should use "fork" subcommand with session ID', () => {
      const config = service.buildFork('fork-456', {});

      expect(config.args[0]).toBe('fork');
      expect(config.args[1]).toBe('fork-456');
    });

    it('should include --model flag when model is specified', () => {
      const config = service.buildFork('fork-456', { model: 'o3-mini' });

      expect(config.args).toContain('--model');
      expect(config.args).toContain('o3-mini');
    });

    it('should NOT include --resume or --fork-session flags (Codex uses subcommands)', () => {
      const config = service.buildFork('fork-456', {});

      expect(config.args).not.toContain('--resume');
      expect(config.args).not.toContain('--fork-session');
    });
  });

  // =========================================================
  // buildContinue
  // =========================================================
  describe('buildContinue', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/codex\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should use "resume --last" pattern', () => {
      const config = service.buildContinue({});

      expect(config.args).toContain('resume');
      expect(config.args).toContain('--last');
    });

    it('should include --model flag when model is specified', () => {
      const config = service.buildContinue({ model: 'o3' });

      expect(config.args).toContain('--model');
      expect(config.args).toContain('o3');
    });

    it('should NOT include --continue flag (Codex uses resume --last)', () => {
      const config = service.buildContinue({});

      expect(config.args).not.toContain('--continue');
    });
  });

  // =========================================================
  // CLI path resolution
  // =========================================================
  describe('CLI path resolution', () => {
    it('should use path from PATH when found via which', () => {
      mockPlatform.mockReturnValue('linux');
      mockedExecFileSync.mockReturnValue('/usr/local/bin/codex\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('/usr/local/bin/codex');
      expect(mockedExecFileSync).toHaveBeenCalledWith('which', ['codex'], expect.any(Object));
    });

    it('should use "where" on Windows to find in PATH', () => {
      mockPlatform.mockReturnValue('win32');
      mockedExecFileSync.mockReturnValue('C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['codex'], expect.any(Object));
    });

    it('should pick the first line when where returns multiple results', () => {
      mockPlatform.mockReturnValue('win32');
      mockedExecFileSync.mockReturnValue('C:\\path1\\codex.cmd\r\nC:\\path2\\codex.cmd\r\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('C:\\path1\\codex.cmd');
    });

    it('should try .cmd and .exe extensions on Windows when bare command not found', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');

      mockedExecFileSync
        .mockImplementationOnce(() => {
          throw new Error('not found');
        })
        .mockReturnValueOnce('C:\\npm\\codex.cmd\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('C:\\npm\\codex.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['codex.cmd'], expect.any(Object));
    });

    it('should fall back to known paths when PATH lookup fails on linux', () => {
      mockPlatform.mockReturnValue('linux');
      mockHomedir.mockReturnValue('/home/testuser');

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      mockedExistsSync.mockImplementation((p: unknown) => {
        return p === '/usr/local/bin/codex';
      });

      const config = service.buildLaunch({});

      expect(config.command).toBe('/usr/local/bin/codex');
    });

    it('should fall back to known paths when PATH lookup fails on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');
      const appData = 'C:\\Users\\test\\AppData\\Roaming';
      process.env.APPDATA = appData;

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const expectedPath = path.join(appData, 'npm', 'codex.cmd');
      mockedExistsSync.mockImplementation((p: unknown) => {
        return p === expectedPath;
      });

      const config = service.buildLaunch({});

      expect(config.command).toBe(expectedPath);
    });

    it('should fall back to bare "codex" command when nothing found', () => {
      mockPlatform.mockReturnValue('linux');

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      mockedExistsSync.mockReturnValue(false);

      const config = service.buildLaunch({});

      expect(config.command).toBe('codex');
    });

    it('should handle existsSync throwing an error gracefully', () => {
      mockPlatform.mockReturnValue('linux');

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      mockedExistsSync.mockImplementation(() => {
        throw new Error('permission denied');
      });

      const config = service.buildLaunch({});

      expect(config.command).toBe('codex');
    });

    it('should handle execFileSync returning empty string', () => {
      mockPlatform.mockReturnValue('linux');

      mockedExecFileSync.mockReturnValue('   \n');
      mockedExistsSync.mockReturnValue(false);

      const config = service.buildLaunch({});

      expect(config.command).toBe('codex');
    });
  });
});
