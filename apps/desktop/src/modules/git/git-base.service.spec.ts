import { Test, TestingModule } from '@nestjs/testing';
import { GitBaseService } from './git-base.service';

// The promisified execFile mock function.
// We create this inside the util mock factory (which gets hoisted),
// then expose it via the module's __mockExecFile for test access.
let mockExecFile: jest.Mock;

// Mock util.promisify to return a jest.fn() we control.
// This must be done because GitBaseService calls `const execFileAsync = promisify(execFile)`
// at module scope — we intercept promisify to return our mock.
jest.mock('util', () => {
  const fn = jest.fn();
  // Store reference so tests can access it
  (global as Record<string, unknown>).__mockExecFile = fn;
  return {
    promisify: () => fn,
  };
});

// Also mock child_process so the import doesn't fail
jest.mock('child_process', () => ({
  execFile: jest.fn(),
  ExecException: Error,
}));

describe('GitBaseService', () => {
  let service: GitBaseService;

  beforeEach(async () => {
    mockExecFile = (global as Record<string, unknown>).__mockExecFile as jest.Mock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitBaseService],
    }).compile();

    service = module.get<GitBaseService>(GitBaseService);
    mockExecFile.mockReset();
  });

  describe('execGit', () => {
    it('should execute a git command and return stdout/stderr', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'abc123\n',
        stderr: '',
      });

      const result = await service.execGit('/repo', ['rev-parse', 'HEAD']);

      expect(result).toEqual({ stdout: 'abc123\n', stderr: '' });
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['rev-parse', 'HEAD'],
        expect.objectContaining({
          cwd: '/repo',
        })
      );
    });

    it('should pass GIT_ENV variables to prevent interactive prompts', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['status']);

      const callOpts = mockExecFile.mock.calls[0][2];
      expect(callOpts.env).toEqual(
        expect.objectContaining({
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
        })
      );
    });

    it('should use the specified timeout', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['status'], 5000);

      const callOpts = mockExecFile.mock.calls[0][2];
      expect(callOpts.timeout).toBe(5000);
    });

    it('should set maxBuffer to 10MB', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['log']);

      const callOpts = mockExecFile.mock.calls[0][2];
      expect(callOpts.maxBuffer).toBe(10 * 1024 * 1024);
    });

    it('should throw a timeout error when the process is killed', async () => {
      const error = new Error('killed') as Error & {
        killed: boolean;
        stdout?: string;
        stderr?: string;
      };
      error.killed = true;
      mockExecFile.mockRejectedValue(error);

      await expect(service.execGit('/repo', ['fetch'], 1000)).rejects.toThrow(
        'Git command timed out after 1000ms'
      );
    });

    it('should return stdout/stderr on non-fatal exit codes (1-127)', async () => {
      const error = new Error('exit code 1') as Error & {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: number;
      };
      error.stdout = 'partial output';
      error.stderr = 'error message';
      error.killed = false;
      error.code = 1;
      mockExecFile.mockRejectedValue(error);

      const result = await service.execGit('/repo', ['diff']);

      expect(result).toEqual({
        stdout: 'partial output',
        stderr: 'error message',
      });
    });

    it('should throw on fatal exit codes (>= 128)', async () => {
      const error = new Error('fatal: invalid reference') as Error & {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: number;
      };
      error.stdout = '';
      error.stderr = 'fatal: invalid reference: nonexistent-branch';
      error.killed = false;
      error.code = 128;
      mockExecFile.mockRejectedValue(error);

      await expect(
        service.execGit('/repo', ['worktree', 'add', '/path', 'nonexistent'])
      ).rejects.toThrow('Git command failed: fatal: invalid reference');
    });

    it('should throw when exec fails without stdout/stderr', async () => {
      const error = new Error('ENOENT: command not found');
      mockExecFile.mockRejectedValue(error);

      await expect(service.execGit('/repo', ['status'])).rejects.toThrow(
        'Git command failed: ENOENT: command not found'
      );
    });

    it('should throw when exit code is a signal string (not a number)', async () => {
      const error = new Error('process terminated') as Error & {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: string | number;
      };
      error.stdout = '';
      error.stderr = '';
      error.killed = false;
      error.code = 'SIGTERM' as unknown as number;
      mockExecFile.mockRejectedValue(error);

      await expect(service.execGit('/repo', ['fetch'])).rejects.toThrow(
        'Git command failed: process terminated'
      );
    });

    it('should pass args as an array to execFile', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['branch', '-a', '--list', 'feature/*']);

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['branch', '-a', '--list', 'feature/*'],
        expect.anything()
      );
    });
  });
});
