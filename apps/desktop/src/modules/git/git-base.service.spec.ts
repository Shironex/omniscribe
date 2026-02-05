import { Test, TestingModule } from '@nestjs/testing';
import { GitBaseService } from './git-base.service';

// The promisified exec mock function.
// We create this inside the util mock factory (which gets hoisted),
// then expose it via the module's __mockExec for test access.
let mockExec: jest.Mock;

// Mock util.promisify to return a jest.fn() we control.
// This must be done because GitBaseService calls `const execAsync = promisify(exec)`
// at module scope — we intercept promisify to return our mock.
jest.mock('util', () => {
  const fn = jest.fn();
  // Store reference so tests can access it
  (global as Record<string, unknown>).__mockExec = fn;
  return {
    promisify: () => fn,
  };
});

// Also mock child_process so the import doesn't fail
jest.mock('child_process', () => ({
  exec: jest.fn(),
  ExecException: Error,
}));

describe('GitBaseService', () => {
  let service: GitBaseService;

  beforeEach(async () => {
    mockExec = (global as Record<string, unknown>).__mockExec as jest.Mock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitBaseService],
    }).compile();

    service = module.get<GitBaseService>(GitBaseService);
    mockExec.mockReset();
  });

  describe('execGit', () => {
    it('should execute a git command and return stdout/stderr', async () => {
      mockExec.mockResolvedValue({
        stdout: 'abc123\n',
        stderr: '',
      });

      const result = await service.execGit('/repo', ['rev-parse', 'HEAD']);

      expect(result).toEqual({ stdout: 'abc123\n', stderr: '' });
      expect(mockExec).toHaveBeenCalledWith(
        'git rev-parse HEAD',
        expect.objectContaining({
          cwd: '/repo',
        })
      );
    });

    it('should pass GIT_ENV variables to prevent interactive prompts', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['status']);

      const callOpts = mockExec.mock.calls[0][1];
      expect(callOpts.env).toEqual(
        expect.objectContaining({
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
        })
      );
    });

    it('should use the specified timeout', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['status'], 5000);

      const callOpts = mockExec.mock.calls[0][1];
      expect(callOpts.timeout).toBe(5000);
    });

    it('should set maxBuffer to 10MB', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['log']);

      const callOpts = mockExec.mock.calls[0][1];
      expect(callOpts.maxBuffer).toBe(10 * 1024 * 1024);
    });

    it('should throw a timeout error when the process is killed', async () => {
      const error = new Error('killed') as Error & {
        killed: boolean;
        stdout?: string;
        stderr?: string;
      };
      error.killed = true;
      mockExec.mockRejectedValue(error);

      await expect(service.execGit('/repo', ['fetch'], 1000)).rejects.toThrow(
        'Git command timed out after 1000ms'
      );
    });

    it('should return stdout/stderr on non-zero exit codes', async () => {
      const error = new Error('exit code 1') as Error & {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
      };
      error.stdout = 'partial output';
      error.stderr = 'error message';
      error.killed = false;
      mockExec.mockRejectedValue(error);

      const result = await service.execGit('/repo', ['diff']);

      expect(result).toEqual({
        stdout: 'partial output',
        stderr: 'error message',
      });
    });

    it('should throw when exec fails without stdout/stderr', async () => {
      const error = new Error('ENOENT: command not found');
      mockExec.mockRejectedValue(error);

      await expect(service.execGit('/repo', ['status'])).rejects.toThrow(
        'Git command failed: ENOENT: command not found'
      );
    });

    it('should join args into a single git command string', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await service.execGit('/repo', ['branch', '-a', '--list', 'feature/*']);

      expect(mockExec).toHaveBeenCalledWith('git branch -a --list feature/*', expect.anything());
    });
  });
});
