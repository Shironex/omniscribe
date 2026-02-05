import { Test, TestingModule } from '@nestjs/testing';
import { GitRemoteService } from './git-remote.service';
import { GitBaseService } from './git-base.service';

describe('GitRemoteService', () => {
  let service: GitRemoteService;
  let gitBase: jest.Mocked<GitBaseService>;

  beforeEach(async () => {
    gitBase = {
      execGit: jest.fn(),
    } as unknown as jest.Mocked<GitBaseService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitRemoteService, { provide: GitBaseService, useValue: gitBase }],
    }).compile();

    service = module.get<GitRemoteService>(GitRemoteService);
  });

  describe('getRemotes', () => {
    it('should parse fetch and push URLs for a single remote', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout: [
            'origin\thttps://github.com/user/repo.git (fetch)',
            'origin\thttps://github.com/user/repo.git (push)',
          ].join('\n'),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: ['abc123\trefs/heads/main', 'def456\trefs/heads/develop'].join('\n'),
          stderr: '',
        });

      const result = await service.getRemotes('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('origin');
      expect(result[0].fetchUrl).toBe('https://github.com/user/repo.git');
      expect(result[0].pushUrl).toBe('https://github.com/user/repo.git');
      expect(result[0].branches).toEqual(['main', 'develop']);
    });

    it('should handle multiple remotes', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout: [
            'origin\thttps://github.com/user/repo.git (fetch)',
            'origin\thttps://github.com/user/repo.git (push)',
            'upstream\thttps://github.com/org/repo.git (fetch)',
            'upstream\thttps://github.com/org/repo.git (push)',
          ].join('\n'),
          stderr: '',
        })
        // ls-remote for origin
        .mockResolvedValueOnce({
          stdout: 'abc123\trefs/heads/main\n',
          stderr: '',
        })
        // ls-remote for upstream
        .mockResolvedValueOnce({
          stdout: 'def456\trefs/heads/main\nghi789\trefs/heads/release\n',
          stderr: '',
        });

      const result = await service.getRemotes('/repo');

      expect(result).toHaveLength(2);

      const origin = result.find(r => r.name === 'origin');
      expect(origin).toBeDefined();
      expect(origin!.branches).toEqual(['main']);

      const upstream = result.find(r => r.name === 'upstream');
      expect(upstream).toBeDefined();
      expect(upstream!.branches).toEqual(['main', 'release']);
    });

    it('should handle remotes with different fetch and push URLs', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout: [
            'origin\thttps://github.com/user/repo.git (fetch)',
            'origin\tgit@github.com:user/repo.git (push)',
          ].join('\n'),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getRemotes('/repo');

      expect(result[0].fetchUrl).toBe('https://github.com/user/repo.git');
      expect(result[0].pushUrl).toBe('git@github.com:user/repo.git');
    });

    it('should return empty array when no remotes are configured', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getRemotes('/repo');

      expect(result).toEqual([]);
    });

    it('should handle remotes with no remote branches', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout:
            'origin\thttps://github.com/user/repo.git (fetch)\norigin\thttps://github.com/user/repo.git (push)\n',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '\n', stderr: '' });

      const result = await service.getRemotes('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].branches).toEqual([]);
    });

    it('should skip lines that do not match the expected format', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout: [
            'origin\thttps://github.com/user/repo.git (fetch)',
            'some random garbage',
            'origin\thttps://github.com/user/repo.git (push)',
          ].join('\n'),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getRemotes('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('origin');
    });
  });

  describe('push', () => {
    it('should push to the default remote (origin) without branch', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.push('/repo');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['push', 'origin']);
    });

    it('should push to a specific remote', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.push('/repo', 'upstream');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['push', 'upstream']);
    });

    it('should push a specific branch to a remote', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.push('/repo', 'origin', 'feature-branch');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['push', 'origin', 'feature-branch']);
    });

    it('should propagate errors from execGit', async () => {
      gitBase.execGit.mockRejectedValue(new Error('push rejected'));

      await expect(service.push('/repo')).rejects.toThrow('push rejected');
    });
  });

  describe('pull', () => {
    it('should pull from the default remote (origin) without branch', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.pull('/repo');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['pull', 'origin']);
    });

    it('should pull from a specific remote', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.pull('/repo', 'upstream');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['pull', 'upstream']);
    });

    it('should pull a specific branch from a remote', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.pull('/repo', 'origin', 'main');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['pull', 'origin', 'main']);
    });

    it('should propagate errors from execGit', async () => {
      gitBase.execGit.mockRejectedValue(new Error('merge conflict'));

      await expect(service.pull('/repo')).rejects.toThrow('merge conflict');
    });
  });

  describe('fetch', () => {
    it('should fetch all when no remote is specified', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.fetch('/repo');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['fetch', '--all']);
    });

    it('should fetch a specific remote', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.fetch('/repo', 'origin');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['fetch', 'origin']);
    });

    it('should propagate errors from execGit', async () => {
      gitBase.execGit.mockRejectedValue(new Error('network error'));

      await expect(service.fetch('/repo')).rejects.toThrow('network error');
    });
  });
});
