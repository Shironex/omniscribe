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

// Import after mocks are set up
import { ClaudeCliCommandService } from '../services/cli-command.service';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { LaunchContext } from '@omniscribe/plugin-api';

const mockedExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

describe('ClaudeCliCommandService', () => {
  let service: ClaudeCliCommandService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new ClaudeCliCommandService();
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
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should return claude command found in PATH', () => {
      const config = service.buildLaunch({});

      expect(config.command).toBe('/usr/local/bin/claude');
    });

    it('should include --model flag when context has model', () => {
      const context: LaunchContext = { model: 'opus' };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--model');
      expect(config.args).toContain('opus');
      const modelIdx = config.args.indexOf('--model');
      expect(config.args[modelIdx + 1]).toBe('opus');
    });

    it('should include --system-prompt flag when context has systemPrompt', () => {
      const context: LaunchContext = { systemPrompt: 'Be concise.' };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--system-prompt');
      expect(config.args).toContain('Be concise.');
      const promptIdx = config.args.indexOf('--system-prompt');
      expect(config.args[promptIdx + 1]).toBe('Be concise.');
    });

    it('should include both model and system prompt when both provided', () => {
      const context: LaunchContext = {
        model: 'sonnet',
        systemPrompt: 'You are a helpful assistant.',
      };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--model');
      expect(config.args).toContain('sonnet');
      expect(config.args).toContain('--system-prompt');
      expect(config.args).toContain('You are a helpful assistant.');
    });

    it('should always append --append-system-prompt with omniscribe instructions', () => {
      const config = service.buildLaunch({});

      expect(config.args).toContain('--append-system-prompt');
      const appendIdx = config.args.indexOf('--append-system-prompt');
      const omniscribePrompt = config.args[appendIdx + 1];
      expect(omniscribePrompt).toContain('Omniscribe Integration');
      expect(omniscribePrompt).toContain('mcp__omniscribe__omniscribe_status');
    });

    it('should not include --model flag when context has no model', () => {
      const config = service.buildLaunch({});

      expect(config.args).not.toContain('--model');
    });

    it('should not include --system-prompt flag when context has no systemPrompt', () => {
      const config = service.buildLaunch({});

      expect(config.args).not.toContain('--system-prompt');
    });

    it('should include --dangerously-skip-permissions when skipPermissions is true', () => {
      const context: LaunchContext = { skipPermissions: true };
      const config = service.buildLaunch(context);

      expect(config.args).toContain('--dangerously-skip-permissions');
    });

    it('should not include --dangerously-skip-permissions by default', () => {
      const config = service.buildLaunch({});

      expect(config.args).not.toContain('--dangerously-skip-permissions');
    });
  });

  // =========================================================
  // buildResume
  // =========================================================
  describe('buildResume', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should include --resume flag with session ID', () => {
      const config = service.buildResume('abc-123', {});

      expect(config.args).toContain('--resume');
      expect(config.args).toContain('abc-123');
      const resumeIdx = config.args.indexOf('--resume');
      expect(config.args[resumeIdx + 1]).toBe('abc-123');
    });

    it('should include --model flag when model is specified', () => {
      const config = service.buildResume('abc-123', { model: 'opus' });

      expect(config.args).toContain('--model');
      expect(config.args).toContain('opus');
    });

    it('should NOT include --system-prompt flags on resume', () => {
      const config = service.buildResume('abc-123', { systemPrompt: 'Be concise.' });

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should include --dangerously-skip-permissions before resume flags', () => {
      const config = service.buildResume('abc-123', { skipPermissions: true });

      const skipIdx = config.args.indexOf('--dangerously-skip-permissions');
      const resumeIdx = config.args.indexOf('--resume');
      expect(skipIdx).toBeLessThan(resumeIdx);
    });
  });

  // =========================================================
  // buildFork
  // =========================================================
  describe('buildFork', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should include --resume and --fork-session flags', () => {
      const config = service.buildFork('fork-456', {});

      expect(config.args).toContain('--resume');
      expect(config.args).toContain('fork-456');
      expect(config.args).toContain('--fork-session');
      const resumeIdx = config.args.indexOf('--resume');
      expect(config.args[resumeIdx + 1]).toBe('fork-456');
    });

    it('should include --model flag when model is specified', () => {
      const config = service.buildFork('fork-456', { model: 'sonnet' });

      expect(config.args).toContain('--model');
      expect(config.args).toContain('sonnet');
    });

    it('should NOT include --system-prompt flags on fork', () => {
      const config = service.buildFork('fork-456', { systemPrompt: 'Be concise.' });

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should include --dangerously-skip-permissions when skipPermissions is true', () => {
      const config = service.buildFork('fork-456', { skipPermissions: true });

      expect(config.args).toContain('--dangerously-skip-permissions');
      const skipIdx = config.args.indexOf('--dangerously-skip-permissions');
      const resumeIdx = config.args.indexOf('--resume');
      expect(skipIdx).toBeLessThan(resumeIdx);
    });
  });

  // =========================================================
  // buildContinue
  // =========================================================
  describe('buildContinue', () => {
    beforeEach(() => {
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');
      mockedExistsSync.mockReturnValue(false);
    });

    it('should include --continue flag', () => {
      const config = service.buildContinue({});

      expect(config.args).toContain('--continue');
      expect(config.args).not.toContain('--resume');
      expect(config.args).not.toContain('--fork-session');
    });

    it('should include --model flag when model is specified', () => {
      const config = service.buildContinue({ model: 'opus' });

      expect(config.args).toContain('--model');
      expect(config.args).toContain('opus');
    });

    it('should NOT include --system-prompt flags on continue', () => {
      const config = service.buildContinue({ systemPrompt: 'Be concise.' });

      expect(config.args).not.toContain('--system-prompt');
      expect(config.args).not.toContain('--append-system-prompt');
    });

    it('should include --dangerously-skip-permissions when skipPermissions is true', () => {
      const config = service.buildContinue({ skipPermissions: true });

      expect(config.args).toContain('--dangerously-skip-permissions');
    });
  });

  // =========================================================
  // CLI path resolution
  // =========================================================
  describe('CLI path resolution', () => {
    it('should use path from PATH when found via which/where', () => {
      mockPlatform.mockReturnValue('linux');
      mockedExecFileSync.mockReturnValue('/usr/local/bin/claude\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('/usr/local/bin/claude');
      expect(mockedExecFileSync).toHaveBeenCalledWith('which', ['claude'], expect.any(Object));
    });

    it('should use "where" on Windows to find in PATH', () => {
      mockPlatform.mockReturnValue('win32');
      mockedExecFileSync.mockReturnValue('C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['claude'], expect.any(Object));
    });

    it('should pick the first line when where returns multiple results', () => {
      mockPlatform.mockReturnValue('win32');
      mockedExecFileSync.mockReturnValue('C:\\path1\\claude.cmd\r\nC:\\path2\\claude.cmd\r\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('C:\\path1\\claude.cmd');
    });

    it('should try .cmd and .exe extensions on Windows when bare command not found', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');

      mockedExecFileSync
        .mockImplementationOnce(() => {
          throw new Error('not found');
        })
        .mockReturnValueOnce('C:\\npm\\claude.cmd\n');

      const config = service.buildLaunch({});

      expect(config.command).toBe('C:\\npm\\claude.cmd');
      expect(mockedExecFileSync).toHaveBeenCalledWith('where', ['claude.cmd'], expect.any(Object));
    });

    it('should fall back to known paths when PATH lookup fails on linux', () => {
      mockPlatform.mockReturnValue('linux');
      mockHomedir.mockReturnValue('/home/testuser');

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      mockedExistsSync.mockImplementation((p: unknown) => {
        return p === '/usr/local/bin/claude';
      });

      const config = service.buildLaunch({});

      expect(config.command).toBe('/usr/local/bin/claude');
    });

    it('should fall back to known paths when PATH lookup fails on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      mockHomedir.mockReturnValue('C:\\Users\\test');
      const appData = 'C:\\Users\\test\\AppData\\Roaming';
      process.env.APPDATA = appData;

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const expectedPath = path.join(appData, 'npm', 'claude.cmd');
      mockedExistsSync.mockImplementation((p: unknown) => {
        return p === expectedPath;
      });

      const config = service.buildLaunch({});

      expect(config.command).toBe(expectedPath);
    });

    it('should fall back to bare "claude" command when nothing found', () => {
      mockPlatform.mockReturnValue('linux');

      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      mockedExistsSync.mockReturnValue(false);

      const config = service.buildLaunch({});

      expect(config.command).toBe('claude');
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

      expect(config.command).toBe('claude');
    });

    it('should handle execFileSync returning empty string', () => {
      mockPlatform.mockReturnValue('linux');

      mockedExecFileSync.mockReturnValue('   \n');
      mockedExistsSync.mockReturnValue(false);

      const config = service.buildLaunch({});

      expect(config.command).toBe('claude');
    });
  });
});
