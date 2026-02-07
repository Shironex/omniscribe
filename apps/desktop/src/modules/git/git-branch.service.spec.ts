import { Test, TestingModule } from '@nestjs/testing';
import { GitBranchService } from './git-branch.service';
import { GitBaseService } from './git-base.service';
import type { BranchInfo } from '@omniscribe/shared';

describe('GitBranchService', () => {
  let service: GitBranchService;
  let gitBase: jest.Mocked<GitBaseService>;

  beforeEach(async () => {
    gitBase = {
      execGit: jest.fn(),
    } as unknown as jest.Mocked<GitBaseService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitBranchService, { provide: GitBaseService, useValue: gitBase }],
    }).compile();

    service = module.get<GitBranchService>(GitBranchService);
  });

  describe('getCurrentBranch', () => {
    it('should return the current branch name trimmed', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'main\n', stderr: '' });

      const result = await service.getCurrentBranch('/repo');

      expect(result).toBe('main');
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['rev-parse', '--abbrev-ref', 'HEAD']);
    });

    it('should return HEAD when in detached state', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'HEAD\n', stderr: '' });

      const result = await service.getCurrentBranch('/repo');

      expect(result).toBe('HEAD');
    });

    it('should propagate errors', async () => {
      gitBase.execGit.mockRejectedValue(new Error('not a git repo'));

      await expect(service.getCurrentBranch('/bad')).rejects.toThrow('not a git repo');
    });
  });

  describe('checkout', () => {
    it('should checkout a valid branch', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.checkout('/repo', 'feature/my-branch');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['checkout', 'feature/my-branch']);
    });

    it('should reject invalid branch names with special characters', async () => {
      await expect(service.checkout('/repo', 'branch with spaces')).rejects.toThrow(
        'Invalid branch name'
      );
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('should reject branch names starting with a dot', async () => {
      await expect(service.checkout('/repo', '.hidden')).rejects.toThrow('Invalid branch name');
    });

    it('should reject branch names ending with .lock', async () => {
      await expect(service.checkout('/repo', 'my-branch.lock')).rejects.toThrow(
        'Invalid branch name'
      );
    });

    it('should reject branch names with consecutive dots', async () => {
      await expect(service.checkout('/repo', 'branch..name')).rejects.toThrow(
        'Invalid branch name'
      );
    });

    it('should reject branch names with backslash', async () => {
      await expect(service.checkout('/repo', 'branch\\name')).rejects.toThrow(
        'Invalid branch name'
      );
    });

    it('should reject empty branch names', async () => {
      await expect(service.checkout('/repo', '')).rejects.toThrow('Invalid branch name');
    });

    it('should reject branch names starting with slash', async () => {
      await expect(service.checkout('/repo', '/branch')).rejects.toThrow('Invalid branch name');
    });

    it('should reject branch names ending with slash', async () => {
      await expect(service.checkout('/repo', 'branch/')).rejects.toThrow('Invalid branch name');
    });

    it('should reject branch names with @{ sequence', async () => {
      await expect(service.checkout('/repo', 'branch@{0}')).rejects.toThrow('Invalid branch name');
    });

    it('should allow valid branch names with dots and slashes', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.checkout('/repo', 'feature/v1.2.3');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['checkout', 'feature/v1.2.3']);
    });

    it('should allow branch names with dashes and underscores', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.checkout('/repo', 'feature_my-branch');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['checkout', 'feature_my-branch']);
    });
  });

  describe('createBranch', () => {
    it('should create a branch without a start point', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.createBranch('/repo', 'new-feature');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['checkout', '-b', 'new-feature']);
    });

    it('should create a branch from a start point', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.createBranch('/repo', 'new-feature', 'origin/main');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'checkout',
        '-b',
        'new-feature',
        'origin/main',
      ]);
    });

    it('should reject invalid branch names', async () => {
      await expect(service.createBranch('/repo', 'bad name')).rejects.toThrow(
        'Invalid branch name'
      );
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('should reject invalid start point names', async () => {
      await expect(service.createBranch('/repo', 'good-name', 'bad..ref')).rejects.toThrow(
        'Invalid start point'
      );
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('should allow a start point of undefined', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.createBranch('/repo', 'feature');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['checkout', '-b', 'feature']);
    });
  });

  describe('getBranches', () => {
    it('should parse local and remote branches from git branch -a output', async () => {
      // Call 1: getCurrentBranch
      gitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // Call 2: git branch -a --format
      gitBase.execGit.mockResolvedValueOnce({
        stdout: [
          '*|main|refs/heads',
          ' |develop|refs/heads',
          ' |origin/main|refs/remotes',
          ' |origin/develop|refs/remotes',
        ].join('\n'),
        stderr: '',
      });
      // Call 3: for-each-ref local refs
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // Call 4: for-each-ref remote refs
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getBranches('/repo');

      expect(result).toHaveLength(4);

      const main = result.find(b => b.name === 'main' && !b.isRemote);
      expect(main).toBeDefined();
      expect(main!.isCurrent).toBe(true);
      expect(main!.isRemote).toBe(false);

      const develop = result.find(b => b.name === 'develop' && !b.isRemote);
      expect(develop).toBeDefined();
      expect(develop!.isCurrent).toBe(false);

      const remoteMain = result.find(b => b.name === 'origin/main');
      expect(remoteMain).toBeDefined();
      expect(remoteMain!.isRemote).toBe(true);
      expect(remoteMain!.remote).toBe('origin');
    });

    it('should skip HEAD pointer entries', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({
        stdout: [
          '*|main|refs/heads',
          ' |origin/HEAD|refs/remotes',
          ' |origin/main|refs/remotes',
        ].join('\n'),
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getBranches('/repo');

      const headEntry = result.find(b => b.name === 'origin/HEAD');
      expect(headEntry).toBeUndefined();
      expect(result).toHaveLength(2);
    });

    it('should fall back to for-each-ref when branch -a returns no results', async () => {
      // getCurrentBranch
      gitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // git branch -a returns empty
      gitBase.execGit.mockResolvedValueOnce({ stdout: '\n', stderr: '' });
      // for-each-ref local
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'main|abc1234|initial commit|origin/main|[ahead 1]\n',
        stderr: '',
      });
      // for-each-ref remote
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'origin/main|abc1234|initial commit\n',
        stderr: '',
      });

      const result = await service.getBranches('/repo');

      expect(result.length).toBeGreaterThan(0);
      const localMain = result.find(b => b.name === 'main' && !b.isRemote);
      expect(localMain).toBeDefined();
      expect(localMain!.isCurrent).toBe(true);
    });

    it('should handle empty repository with no branches', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getBranches('/repo');

      expect(result).toEqual([]);
    });

    it('should skip remote entries without a slash in name', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({
        stdout: ['*|main|refs/heads', ' |origin|refs/remotes'].join('\n'),
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getBranches('/repo');

      // "origin" without a slash should be skipped since it's a symbolic ref
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('main');
    });
  });

  describe('enrichBranchesWithTrackingInfo', () => {
    it('should enrich local branches with commit and tracking info', async () => {
      const branches: BranchInfo[] = [
        { name: 'main', isCurrent: true, isRemote: false },
        { name: 'origin/main', isCurrent: false, isRemote: true, remote: 'origin' },
      ];

      // for-each-ref local
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'main|abc1234|fix something|origin/main|[ahead 2, behind 1]\n',
        stderr: '',
      });
      // for-each-ref remote
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'origin/main|def5678|remote commit\n',
        stderr: '',
      });

      await service.enrichBranchesWithTrackingInfo('/repo', branches, 'main');

      expect(branches[0].lastCommitHash).toBe('abc1234');
      expect(branches[0].lastCommitMessage).toBe('fix something');
      expect(branches[0].upstream).toBe('origin/main');
      expect(branches[0].ahead).toBe(2);
      expect(branches[0].behind).toBe(1);
      expect(branches[0].remote).toBe('origin');

      expect(branches[1].lastCommitHash).toBe('def5678');
      expect(branches[1].lastCommitMessage).toBe('remote commit');
    });

    it('should handle branches with no tracking info', async () => {
      const branches: BranchInfo[] = [{ name: 'feature', isCurrent: false, isRemote: false }];

      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'feature|abc1234|wip||\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.enrichBranchesWithTrackingInfo('/repo', branches, 'main');

      expect(branches[0].lastCommitHash).toBe('abc1234');
      expect(branches[0].upstream).toBeUndefined();
      expect(branches[0].ahead).toBeUndefined();
    });

    it('should not throw when for-each-ref fails', async () => {
      const branches: BranchInfo[] = [{ name: 'main', isCurrent: true, isRemote: false }];

      gitBase.execGit.mockRejectedValue(new Error('git failed'));

      await expect(
        service.enrichBranchesWithTrackingInfo('/repo', branches, 'main')
      ).resolves.toBeUndefined();
    });
  });

  describe('getBranchesWithForEachRef', () => {
    it('should parse local and remote branches from for-each-ref', async () => {
      // for-each-ref local
      gitBase.execGit.mockResolvedValueOnce({
        stdout: [
          'main|abc1234|initial commit|origin/main|[ahead 1]',
          'feature|def5678|add feature||',
        ].join('\n'),
        stderr: '',
      });
      // for-each-ref remote
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'origin/main|abc1234|initial commit\n',
        stderr: '',
      });

      const result = await service.getBranchesWithForEachRef('/repo', 'main');

      expect(result).toHaveLength(3);

      const main = result.find(b => b.name === 'main');
      expect(main).toBeDefined();
      expect(main!.isCurrent).toBe(true);
      expect(main!.upstream).toBe('origin/main');
      expect(main!.ahead).toBe(1);

      const feature = result.find(b => b.name === 'feature');
      expect(feature).toBeDefined();
      expect(feature!.isCurrent).toBe(false);

      const remoteMain = result.find(b => b.name === 'origin/main');
      expect(remoteMain).toBeDefined();
      expect(remoteMain!.isRemote).toBe(true);
      expect(remoteMain!.remote).toBe('origin');
    });

    it('should skip remote HEAD entries', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({
        stdout: ['origin/HEAD|abc1234|head pointer', 'origin/main|abc1234|initial commit'].join(
          '\n'
        ),
        stderr: '',
      });

      const result = await service.getBranchesWithForEachRef('/repo', 'main');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('origin/main');
    });

    it('should parse behind tracking info', async () => {
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'main|abc1234|commit|origin/main|[behind 3]\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getBranchesWithForEachRef('/repo', 'main');

      const main = result.find(b => b.name === 'main');
      expect(main!.behind).toBe(3);
      expect(main!.ahead).toBeUndefined();
    });

    it('should return empty array for empty output', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getBranchesWithForEachRef('/repo', 'main');

      expect(result).toEqual([]);
    });
  });
});
