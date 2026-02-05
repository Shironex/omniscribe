import { Test, TestingModule } from '@nestjs/testing';
import { GitService } from './git.service';
import { GitBranchService } from './git-branch.service';
import { GitStatusService } from './git-status.service';
import { GitCommitService } from './git-commit.service';
import { GitRemoteService } from './git-remote.service';
import { GitRepoService } from './git-repo.service';

const mockGitBranch = {
  getBranches: jest.fn(),
  getCurrentBranch: jest.fn(),
  checkout: jest.fn(),
  createBranch: jest.fn(),
};

const mockGitStatus = {
  getStatus: jest.fn(),
  getUncommittedCount: jest.fn(),
};

const mockGitCommit = {
  getCommitLog: jest.fn(),
  stage: jest.fn(),
  unstage: jest.fn(),
  commit: jest.fn(),
  diff: jest.fn(),
};

const mockGitRemote = {
  getRemotes: jest.fn(),
  push: jest.fn(),
  pull: jest.fn(),
  fetch: jest.fn(),
};

const mockGitRepo = {
  isGitRepository: jest.fn(),
  getRepositoryRoot: jest.fn(),
  getUserConfig: jest.fn(),
  setUserConfig: jest.fn(),
};

describe('GitService', () => {
  let service: GitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitService,
        { provide: GitBranchService, useValue: mockGitBranch },
        { provide: GitStatusService, useValue: mockGitStatus },
        { provide: GitCommitService, useValue: mockGitCommit },
        { provide: GitRemoteService, useValue: mockGitRemote },
        { provide: GitRepoService, useValue: mockGitRepo },
      ],
    }).compile();

    service = module.get<GitService>(GitService);
  });

  // ==================== Branch Operations ====================

  describe('getBranches', () => {
    it('should delegate to GitBranchService.getBranches', async () => {
      const branches = [
        { name: 'main', isCurrent: true, isRemote: false },
        { name: 'feature/x', isCurrent: false, isRemote: false },
      ];
      mockGitBranch.getBranches.mockResolvedValue(branches);

      const result = await service.getBranches('/repo');

      expect(mockGitBranch.getBranches).toHaveBeenCalledWith('/repo');
      expect(result).toEqual(branches);
    });
  });

  describe('getCurrentBranch', () => {
    it('should delegate to GitBranchService.getCurrentBranch', async () => {
      mockGitBranch.getCurrentBranch.mockResolvedValue('main');

      const result = await service.getCurrentBranch('/repo');

      expect(mockGitBranch.getCurrentBranch).toHaveBeenCalledWith('/repo');
      expect(result).toBe('main');
    });
  });

  describe('checkout', () => {
    it('should delegate to GitBranchService.checkout', async () => {
      mockGitBranch.checkout.mockResolvedValue(undefined);

      await service.checkout('/repo', 'feature/new');

      expect(mockGitBranch.checkout).toHaveBeenCalledWith('/repo', 'feature/new');
    });
  });

  describe('createBranch', () => {
    it('should delegate to GitBranchService.createBranch without startPoint', async () => {
      mockGitBranch.createBranch.mockResolvedValue(undefined);

      await service.createBranch('/repo', 'feature/new');

      expect(mockGitBranch.createBranch).toHaveBeenCalledWith('/repo', 'feature/new', undefined);
    });

    it('should delegate to GitBranchService.createBranch with startPoint', async () => {
      mockGitBranch.createBranch.mockResolvedValue(undefined);

      await service.createBranch('/repo', 'feature/new', 'develop');

      expect(mockGitBranch.createBranch).toHaveBeenCalledWith('/repo', 'feature/new', 'develop');
    });
  });

  // ==================== Status Operations ====================

  describe('getStatus', () => {
    it('should delegate to GitStatusService.getStatus', async () => {
      const status = {
        isRepo: true,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      };
      mockGitStatus.getStatus.mockResolvedValue(status);

      const result = await service.getStatus('/project');

      expect(mockGitStatus.getStatus).toHaveBeenCalledWith('/project');
      expect(result).toEqual(status);
    });
  });

  describe('getUncommittedCount', () => {
    it('should delegate to GitStatusService.getUncommittedCount', async () => {
      mockGitStatus.getUncommittedCount.mockResolvedValue(5);

      const result = await service.getUncommittedCount('/repo');

      expect(mockGitStatus.getUncommittedCount).toHaveBeenCalledWith('/repo');
      expect(result).toBe(5);
    });
  });

  // ==================== Commit Operations ====================

  describe('getCommitLog', () => {
    it('should delegate to GitCommitService.getCommitLog with defaults', async () => {
      const commits = [{ hash: 'abc123', subject: 'Initial commit' }];
      mockGitCommit.getCommitLog.mockResolvedValue(commits);

      const result = await service.getCommitLog('/repo');

      expect(mockGitCommit.getCommitLog).toHaveBeenCalledWith('/repo', 50, true);
      expect(result).toEqual(commits);
    });

    it('should delegate with custom limit and allBranches', async () => {
      mockGitCommit.getCommitLog.mockResolvedValue([]);

      await service.getCommitLog('/repo', 10, false);

      expect(mockGitCommit.getCommitLog).toHaveBeenCalledWith('/repo', 10, false);
    });
  });

  describe('stage', () => {
    it('should delegate to GitCommitService.stage', async () => {
      mockGitCommit.stage.mockResolvedValue(undefined);

      await service.stage('/project', ['file1.ts', 'file2.ts']);

      expect(mockGitCommit.stage).toHaveBeenCalledWith('/project', ['file1.ts', 'file2.ts']);
    });
  });

  describe('unstage', () => {
    it('should delegate to GitCommitService.unstage', async () => {
      mockGitCommit.unstage.mockResolvedValue(undefined);

      await service.unstage('/project', ['file1.ts']);

      expect(mockGitCommit.unstage).toHaveBeenCalledWith('/project', ['file1.ts']);
    });
  });

  describe('commit', () => {
    it('should delegate to GitCommitService.commit', async () => {
      mockGitCommit.commit.mockResolvedValue('abc123def');

      const result = await service.commit('/project', 'fix: resolve bug');

      expect(mockGitCommit.commit).toHaveBeenCalledWith('/project', 'fix: resolve bug');
      expect(result).toBe('abc123def');
    });
  });

  describe('diff', () => {
    it('should delegate to GitCommitService.diff without file', async () => {
      mockGitCommit.diff.mockResolvedValue('diff output');

      const result = await service.diff('/project');

      expect(mockGitCommit.diff).toHaveBeenCalledWith('/project', undefined);
      expect(result).toBe('diff output');
    });

    it('should delegate to GitCommitService.diff with file', async () => {
      mockGitCommit.diff.mockResolvedValue('file diff');

      const result = await service.diff('/project', 'src/app.ts');

      expect(mockGitCommit.diff).toHaveBeenCalledWith('/project', 'src/app.ts');
      expect(result).toBe('file diff');
    });
  });

  // ==================== Remote Operations ====================

  describe('getRemotes', () => {
    it('should delegate to GitRemoteService.getRemotes', async () => {
      const remotes = [
        {
          name: 'origin',
          fetchUrl: 'git@github.com:user/repo.git',
          pushUrl: 'git@github.com:user/repo.git',
        },
      ];
      mockGitRemote.getRemotes.mockResolvedValue(remotes);

      const result = await service.getRemotes('/repo');

      expect(mockGitRemote.getRemotes).toHaveBeenCalledWith('/repo');
      expect(result).toEqual(remotes);
    });
  });

  describe('push', () => {
    it('should delegate to GitRemoteService.push with defaults', async () => {
      mockGitRemote.push.mockResolvedValue(undefined);

      await service.push('/project');

      expect(mockGitRemote.push).toHaveBeenCalledWith('/project', 'origin', undefined);
    });

    it('should delegate to GitRemoteService.push with custom remote and branch', async () => {
      mockGitRemote.push.mockResolvedValue(undefined);

      await service.push('/project', 'upstream', 'main');

      expect(mockGitRemote.push).toHaveBeenCalledWith('/project', 'upstream', 'main');
    });
  });

  describe('pull', () => {
    it('should delegate to GitRemoteService.pull with defaults', async () => {
      mockGitRemote.pull.mockResolvedValue(undefined);

      await service.pull('/project');

      expect(mockGitRemote.pull).toHaveBeenCalledWith('/project', 'origin', undefined);
    });

    it('should delegate to GitRemoteService.pull with custom remote and branch', async () => {
      mockGitRemote.pull.mockResolvedValue(undefined);

      await service.pull('/project', 'upstream', 'develop');

      expect(mockGitRemote.pull).toHaveBeenCalledWith('/project', 'upstream', 'develop');
    });
  });

  describe('fetch', () => {
    it('should delegate to GitRemoteService.fetch without remote', async () => {
      mockGitRemote.fetch.mockResolvedValue(undefined);

      await service.fetch('/project');

      expect(mockGitRemote.fetch).toHaveBeenCalledWith('/project', undefined);
    });

    it('should delegate to GitRemoteService.fetch with remote', async () => {
      mockGitRemote.fetch.mockResolvedValue(undefined);

      await service.fetch('/project', 'origin');

      expect(mockGitRemote.fetch).toHaveBeenCalledWith('/project', 'origin');
    });
  });

  // ==================== Repository Operations ====================

  describe('isGitRepository', () => {
    it('should delegate to GitRepoService.isGitRepository and return true', async () => {
      mockGitRepo.isGitRepository.mockResolvedValue(true);

      const result = await service.isGitRepository('/repo');

      expect(mockGitRepo.isGitRepository).toHaveBeenCalledWith('/repo');
      expect(result).toBe(true);
    });

    it('should delegate to GitRepoService.isGitRepository and return false', async () => {
      mockGitRepo.isGitRepository.mockResolvedValue(false);

      const result = await service.isGitRepository('/not-a-repo');

      expect(mockGitRepo.isGitRepository).toHaveBeenCalledWith('/not-a-repo');
      expect(result).toBe(false);
    });
  });

  describe('getRepositoryRoot', () => {
    it('should delegate to GitRepoService.getRepositoryRoot', async () => {
      mockGitRepo.getRepositoryRoot.mockResolvedValue('/repo/root');

      const result = await service.getRepositoryRoot('/repo/sub/dir');

      expect(mockGitRepo.getRepositoryRoot).toHaveBeenCalledWith('/repo/sub/dir');
      expect(result).toBe('/repo/root');
    });
  });

  describe('getUserConfig', () => {
    it('should delegate to GitRepoService.getUserConfig', async () => {
      const config = { name: 'John Doe', email: 'john@example.com' };
      mockGitRepo.getUserConfig.mockResolvedValue(config);

      const result = await service.getUserConfig('/repo');

      expect(mockGitRepo.getUserConfig).toHaveBeenCalledWith('/repo');
      expect(result).toEqual(config);
    });
  });

  describe('setUserConfig', () => {
    it('should delegate to GitRepoService.setUserConfig with defaults', async () => {
      mockGitRepo.setUserConfig.mockResolvedValue(undefined);

      await service.setUserConfig('/repo', 'Jane', 'jane@example.com');

      expect(mockGitRepo.setUserConfig).toHaveBeenCalledWith(
        '/repo',
        'Jane',
        'jane@example.com',
        false
      );
    });

    it('should delegate to GitRepoService.setUserConfig with global flag', async () => {
      mockGitRepo.setUserConfig.mockResolvedValue(undefined);

      await service.setUserConfig('/repo', 'Jane', 'jane@example.com', true);

      expect(mockGitRepo.setUserConfig).toHaveBeenCalledWith(
        '/repo',
        'Jane',
        'jane@example.com',
        true
      );
    });
  });
});
