import { Test, TestingModule } from '@nestjs/testing';
import { GitRepoService } from './git-repo.service';
import { GitBaseService } from './git-base.service';

describe('GitRepoService', () => {
  let service: GitRepoService;
  let gitBase: jest.Mocked<GitBaseService>;

  beforeEach(async () => {
    gitBase = {
      execGit: jest.fn(),
    } as unknown as jest.Mocked<GitBaseService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitRepoService, { provide: GitBaseService, useValue: gitBase }],
    }).compile();

    service = module.get<GitRepoService>(GitRepoService);
  });

  describe('isGitRepository', () => {
    it('should return true when path is a git repository', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '.git\n', stderr: '' });

      const result = await service.isGitRepository('/repo');

      expect(result).toBe(true);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['rev-parse', '--git-dir']);
    });

    it('should return false when path is not a git repository', async () => {
      gitBase.execGit.mockRejectedValue(new Error('not a git repository'));

      const result = await service.isGitRepository('/not-a-repo');

      expect(result).toBe(false);
    });

    it('should return false when execGit throws any error', async () => {
      gitBase.execGit.mockRejectedValue(new Error('ENOENT'));

      const result = await service.isGitRepository('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getRepositoryRoot', () => {
    it('should return the trimmed repository root path', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '/home/user/project\n', stderr: '' });

      const result = await service.getRepositoryRoot('/home/user/project/src');

      expect(result).toBe('/home/user/project');
      expect(gitBase.execGit).toHaveBeenCalledWith('/home/user/project/src', [
        'rev-parse',
        '--show-toplevel',
      ]);
    });

    it('should handle paths with no trailing newline', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '/repo', stderr: '' });

      const result = await service.getRepositoryRoot('/repo');

      expect(result).toBe('/repo');
    });

    it('should propagate errors from execGit', async () => {
      gitBase.execGit.mockRejectedValue(new Error('not a git repo'));

      await expect(service.getRepositoryRoot('/bad')).rejects.toThrow('not a git repo');
    });
  });

  describe('getUserConfig', () => {
    it('should return both name and email when configured', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: 'John Doe\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'john@example.com\n', stderr: '' });

      const result = await service.getUserConfig('/repo');

      expect(result).toEqual({ name: 'John Doe', email: 'john@example.com' });
      expect(gitBase.execGit).toHaveBeenCalledTimes(2);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['config', '--get', 'user.name']);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['config', '--get', 'user.email']);
    });

    it('should return empty config when neither name nor email is configured', async () => {
      gitBase.execGit
        .mockRejectedValueOnce(new Error('key not found'))
        .mockRejectedValueOnce(new Error('key not found'));

      const result = await service.getUserConfig('/repo');

      expect(result).toEqual({});
    });

    it('should return only name when email is not configured', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: 'Jane Doe\n', stderr: '' })
        .mockRejectedValueOnce(new Error('key not found'));

      const result = await service.getUserConfig('/repo');

      expect(result).toEqual({ name: 'Jane Doe' });
    });

    it('should return only email when name is not configured', async () => {
      gitBase.execGit
        .mockRejectedValueOnce(new Error('key not found'))
        .mockResolvedValueOnce({ stdout: 'jane@example.com\n', stderr: '' });

      const result = await service.getUserConfig('/repo');

      expect(result).toEqual({ email: 'jane@example.com' });
    });

    it('should set name to undefined when stdout is empty', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: '\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '\n', stderr: '' });

      const result = await service.getUserConfig('/repo');

      expect(result).toEqual({});
      expect(result.name).toBeUndefined();
      expect(result.email).toBeUndefined();
    });
  });

  describe('setUserConfig', () => {
    it('should set name locally', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.setUserConfig('/repo', 'John Doe');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--local',
        'user.name',
        'John Doe',
      ]);
    });

    it('should set email locally', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.setUserConfig('/repo', undefined, 'john@example.com');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--local',
        'user.email',
        'john@example.com',
      ]);
    });

    it('should set both name and email globally', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.setUserConfig('/repo', 'John Doe', 'john@example.com', true);

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--global',
        'user.name',
        'John Doe',
      ]);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--global',
        'user.email',
        'john@example.com',
      ]);
    });

    it('should unset name when passed empty string', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.setUserConfig('/repo', '');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--local',
        '--unset',
        'user.name',
      ]);
    });

    it('should unset email when passed empty string', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.setUserConfig('/repo', undefined, '');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--local',
        '--unset',
        'user.email',
      ]);
    });

    it('should not call execGit when both name and email are undefined', async () => {
      await service.setUserConfig('/repo');

      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('should use --global scope when global flag is true', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.setUserConfig('/repo', 'Global User', undefined, true);

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'config',
        '--global',
        'user.name',
        'Global User',
      ]);
    });
  });
});
