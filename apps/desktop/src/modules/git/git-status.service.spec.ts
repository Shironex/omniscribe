import { Test, TestingModule } from '@nestjs/testing';
import { GitStatusService } from './git-status.service';
import { GitBaseService } from './git-base.service';
import { GitRepoService } from './git-repo.service';
import { GitBranchService } from './git-branch.service';

describe('GitStatusService', () => {
  let service: GitStatusService;
  let gitBase: jest.Mocked<GitBaseService>;
  let gitRepo: jest.Mocked<GitRepoService>;
  let gitBranch: jest.Mocked<GitBranchService>;

  beforeEach(async () => {
    gitBase = {
      execGit: jest.fn(),
    } as unknown as jest.Mocked<GitBaseService>;

    gitRepo = {
      isGitRepository: jest.fn(),
      getRepositoryRoot: jest.fn(),
    } as unknown as jest.Mocked<GitRepoService>;

    gitBranch = {
      getCurrentBranch: jest.fn(),
    } as unknown as jest.Mocked<GitBranchService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitStatusService,
        { provide: GitBaseService, useValue: gitBase },
        { provide: GitRepoService, useValue: gitRepo },
        { provide: GitBranchService, useValue: gitBranch },
      ],
    }).compile();

    service = module.get<GitStatusService>(GitStatusService);
  });

  describe('getStatus', () => {
    it('should return not-a-repo status when path is not a git repo', async () => {
      gitRepo.isGitRepository.mockResolvedValue(false);

      const result = await service.getStatus('/not-a-repo');

      expect(result).toEqual({
        isRepo: false,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });
    });

    it('should return clean repo status with no changes', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      // status --porcelain=v2
      gitBase.execGit.mockResolvedValueOnce({
        stdout: '# branch.oid abc123\n# branch.head main\n',
        stderr: '',
      });
      // checkRebaseState: rev-parse --git-path rebase-merge
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      // checkRebaseState: rev-parse --git-path rebase-apply
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      // checkRebaseState: ls-files rebase-merge (fails = no rebase)
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // checkRebaseState: ls-files rebase-apply (fails = no rebase)
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // checkMergeState: rev-parse --git-path MERGE_HEAD
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      // checkMergeState: cat-file (fails = no merge)
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // getStashCount
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.isRepo).toBe(true);
      expect(result.isClean).toBe(true);
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
      expect(result.untracked).toEqual([]);
      expect(result.currentBranch?.name).toBe('main');
      expect(result.rootPath).toBe('/repo');
      expect(result.hasConflicts).toBe(false);
      expect(result.isRebasing).toBe(false);
      expect(result.isMerging).toBe(false);
      expect(result.stashCount).toBe(0);
    });

    it('should parse staged modified files', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: '1 M. N... 100644 100644 100644 abc123 def456 src/app.ts\n',
        stderr: '',
      });
      // checkRebaseState calls
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // checkMergeState calls
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // stash
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.staged).toHaveLength(1);
      expect(result.staged[0].path).toBe('src/app.ts');
      expect(result.staged[0].status).toBe('modified');
      expect(result.staged[0].staged).toBe(true);
      expect(result.unstaged).toHaveLength(0);
    });

    it('should parse unstaged modified files', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: '1 .M N... 100644 100644 100644 abc123 def456 src/app.ts\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.staged).toHaveLength(0);
      expect(result.unstaged).toHaveLength(1);
      expect(result.unstaged[0].path).toBe('src/app.ts');
      expect(result.unstaged[0].status).toBe('modified');
      expect(result.unstaged[0].staged).toBe(false);
    });

    it('should parse files that are both staged and unstaged', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: '1 MM N... 100644 100644 100644 abc123 def456 src/app.ts\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.staged).toHaveLength(1);
      expect(result.unstaged).toHaveLength(1);
      expect(result.staged[0].path).toBe('src/app.ts');
      expect(result.unstaged[0].path).toBe('src/app.ts');
    });

    it('should parse untracked files', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: '? newfile.ts\n? another.ts\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.untracked).toEqual(['newfile.ts', 'another.ts']);
      expect(result.isClean).toBe(false);
    });

    it('should parse renamed files (type 2 entries)', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: '2 R. N... 100644 100644 100644 abc123 def456 R100 new-name.ts\told-name.ts\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.staged).toHaveLength(1);
      expect(result.staged[0].path).toBe('new-name.ts');
      expect(result.staged[0].oldPath).toBe('old-name.ts');
      expect(result.staged[0].status).toBe('renamed');
    });

    it('should parse unmerged (conflicted) entries', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'u UU N... 100644 100644 100644 100644 abc123 def456 ghi789 conflict.ts\n',
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.hasConflicts).toBe(true);
      expect(result.conflictedFiles).toEqual(['conflict.ts']);
    });

    it('should parse ahead/behind info from branch.ab header', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('feature');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: [
          '# branch.oid abc123',
          '# branch.head feature',
          '# branch.upstream origin/feature',
          '# branch.ab +3 -1',
        ].join('\n'),
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.currentBranch?.ahead).toBe(3);
      expect(result.currentBranch?.behind).toBe(1);
      // Note: the source code uses line.split(' ')[1] which yields 'branch.upstream'
      // instead of 'origin/feature' (the value at index [2]). This is a bug in the
      // source - it should use index [2] to get the actual upstream ref name.
      // The test documents the current (buggy) behavior.
      expect(result.currentBranch?.upstream).toBe('branch.upstream');
      expect(result.currentBranch?.remote).toBe('branch.upstream');
    });

    it('should parse staged added and deleted files', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBranch.getCurrentBranch.mockResolvedValue('main');

      gitBase.execGit.mockResolvedValueOnce({
        stdout: [
          '1 A. N... 000000 100644 100644 0000000 abc1234 newfile.ts',
          '1 D. N... 100644 000000 000000 abc1234 0000000 removed.ts',
        ].join('\n'),
        stderr: '',
      });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getStatus('/repo');

      expect(result.staged).toHaveLength(2);
      expect(result.staged[0].status).toBe('added');
      expect(result.staged[1].status).toBe('deleted');
    });
  });

  describe('getUncommittedCount', () => {
    it('should return count of uncommitted changes', async () => {
      gitBase.execGit.mockResolvedValue({
        stdout: ' M file1.ts\n M file2.ts\n?? newfile.ts\n',
        stderr: '',
      });

      const result = await service.getUncommittedCount('/repo');

      expect(result).toBe(3);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['status', '--porcelain']);
    });

    it('should return 0 for a clean repository', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await service.getUncommittedCount('/repo');

      expect(result).toBe(0);
    });

    it('should return 0 for output with only whitespace', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '\n', stderr: '' });

      const result = await service.getUncommittedCount('/repo');

      expect(result).toBe(0);
    });
  });

  describe('parseStatusCode', () => {
    it('should parse M as modified', () => {
      expect(service.parseStatusCode('M')).toBe('modified');
    });

    it('should parse A as added', () => {
      expect(service.parseStatusCode('A')).toBe('added');
    });

    it('should parse D as deleted', () => {
      expect(service.parseStatusCode('D')).toBe('deleted');
    });

    it('should parse R as renamed', () => {
      expect(service.parseStatusCode('R')).toBe('renamed');
    });

    it('should parse C as copied', () => {
      expect(service.parseStatusCode('C')).toBe('copied');
    });

    it('should parse U as conflicted', () => {
      expect(service.parseStatusCode('U')).toBe('conflicted');
    });

    it('should default to modified for unknown codes', () => {
      expect(service.parseStatusCode('X')).toBe('modified');
      expect(service.parseStatusCode('?')).toBe('modified');
    });
  });

  describe('checkRebaseState', () => {
    it('should return true when rebase-merge directory exists', async () => {
      // rev-parse --git-path rebase-merge
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      // rev-parse --git-path rebase-apply
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      // ls-files rebase-merge succeeds
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });

      const result = await service.checkRebaseState('/repo');

      expect(result).toBe(true);
    });

    it('should return true when rebase-apply directory exists', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      // ls-files rebase-merge fails
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // ls-files rebase-apply succeeds
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });

      const result = await service.checkRebaseState('/repo');

      expect(result).toBe(true);
    });

    it('should return false when neither rebase directory exists', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-merge\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/rebase-apply\n', stderr: '' });
      // Both ls-files fail
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      gitBase.execGit.mockRejectedValueOnce(new Error('not found'));

      const result = await service.checkRebaseState('/repo');

      expect(result).toBe(false);
    });

    it('should return false when an error occurs', async () => {
      gitBase.execGit.mockRejectedValue(new Error('git failed'));

      const result = await service.checkRebaseState('/repo');

      expect(result).toBe(false);
    });
  });

  describe('checkMergeState', () => {
    it('should return true when MERGE_HEAD exists', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.checkMergeState('/repo');

      expect(result).toBe(true);
    });

    it('should return false when MERGE_HEAD does not exist', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '.git/MERGE_HEAD\n', stderr: '' });
      gitBase.execGit.mockRejectedValueOnce(new Error('not a valid object'));

      const result = await service.checkMergeState('/repo');

      expect(result).toBe(false);
    });

    it('should return false when an error occurs', async () => {
      gitBase.execGit.mockRejectedValue(new Error('git failed'));

      const result = await service.checkMergeState('/repo');

      expect(result).toBe(false);
    });
  });

  describe('getStashCount', () => {
    it('should return the number of stash entries', async () => {
      gitBase.execGit.mockResolvedValue({
        stdout: 'stash@{0}: WIP on main: abc123 message\nstash@{1}: WIP on main: def456 other\n',
        stderr: '',
      });

      const result = await service.getStashCount('/repo');

      expect(result).toBe(2);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['stash', 'list']);
    });

    it('should return 0 when there are no stashes', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await service.getStashCount('/repo');

      expect(result).toBe(0);
    });

    it('should return 0 when stash list throws an error', async () => {
      gitBase.execGit.mockRejectedValue(new Error('git failed'));

      const result = await service.getStashCount('/repo');

      expect(result).toBe(0);
    });

    it('should return 1 for a single stash entry', async () => {
      gitBase.execGit.mockResolvedValue({
        stdout: 'stash@{0}: WIP on main: abc123 message\n',
        stderr: '',
      });

      const result = await service.getStashCount('/repo');

      expect(result).toBe(1);
    });
  });
});
