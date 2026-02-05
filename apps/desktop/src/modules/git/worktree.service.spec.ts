import { Test, TestingModule } from '@nestjs/testing';
import { WorktreeService } from './worktree.service';
import { GitBaseService } from './git-base.service';
import * as path from 'path';

// Mock fs/promises before imports
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockFs = require('fs/promises') as {
  mkdir: jest.Mock;
  access: jest.Mock;
  rm: jest.Mock;
};

const mockGitBase = {
  execGit: jest.fn(),
};

describe('WorktreeService', () => {
  let service: WorktreeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorktreeService, { provide: GitBaseService, useValue: mockGitBase }],
    }).compile();

    service = module.get<WorktreeService>(WorktreeService);
    mockGitBase.execGit.mockReset();
    mockFs.mkdir.mockClear();
    mockFs.access.mockClear();
    mockFs.rm.mockClear();
  });

  // ==================== getWorktreePath ====================

  describe('getWorktreePath', () => {
    it('should return a project-local worktree path by default', () => {
      const result = service.getWorktreePath('/repo', 'feature-branch');

      expect(result).toBe(path.join('/repo', '.worktrees', 'feature-branch'));
    });

    it('should return a project-local worktree path when location is "project"', () => {
      const result = service.getWorktreePath('/repo', 'my-branch', 'project');

      expect(result).toBe(path.join('/repo', '.worktrees', 'my-branch'));
    });

    it('should return a central worktree path when location is "central"', () => {
      const result = service.getWorktreePath('/repo', 'my-branch', 'central');

      // Central path includes a hash of projectPath
      expect(result).toContain('my-branch');
      // Should NOT be under /repo
      expect(result).not.toContain(path.join('/repo', '.worktrees'));
    });

    it('should use a different hash for different project paths in central mode', () => {
      const path1 = service.getWorktreePath('/repo1', 'branch', 'central');
      const path2 = service.getWorktreePath('/repo2', 'branch', 'central');

      expect(path1).not.toBe(path2);
    });

    it('should sanitize branch names with slashes', () => {
      const result = service.getWorktreePath('/repo', 'feature/my-branch');

      // Slashes are replaced with underscores
      expect(result).toBe(path.join('/repo', '.worktrees', 'feature_my-branch'));
    });

    it('should sanitize branch names with special characters', () => {
      const result = service.getWorktreePath('/repo', 'feature@{1}');

      // Special chars replaced with underscores, leading/trailing stripped
      expect(result).toContain('.worktrees');
      expect(result).not.toContain('@');
      expect(result).not.toContain('{');
    });

    it('should throw for empty branch name', () => {
      expect(() => service.getWorktreePath('/repo', '')).toThrow('Invalid branch name');
    });

    it('should throw for branch name with only control characters', () => {
      expect(() => service.getWorktreePath('/repo', '\x00\x01')).toThrow('Invalid branch name');
    });

    it('should throw for branch name that is too long (over 255 chars)', () => {
      const longBranch = 'a'.repeat(256);
      expect(() => service.getWorktreePath('/repo', longBranch)).toThrow('Invalid branch name');
    });

    it('should throw for path traversal attempts with ".."', () => {
      expect(() => service.getWorktreePath('/repo', '..')).toThrow('Invalid branch name');
    });

    it('should throw for path traversal attempts with "/../"', () => {
      expect(() => service.getWorktreePath('/repo', 'foo/../bar')).toThrow('Invalid branch name');
    });

    it('should throw for branch name "."', () => {
      expect(() => service.getWorktreePath('/repo', '.')).toThrow('Invalid branch name');
    });

    it('should handle branch names that sanitize to only dots/dashes', () => {
      // A branch name like "---" sanitizes to "---", then trimming leading/trailing dashes gives ""
      expect(() => service.getWorktreePath('/repo', '---')).toThrow('Invalid branch name');
    });
  });

  // ==================== prepare ====================

  describe('prepare', () => {
    it('should return null when no branch is specified', async () => {
      const result = await service.prepare('/repo');

      expect(result).toBeNull();
      expect(mockGitBase.execGit).not.toHaveBeenCalled();
    });

    it('should return null when requested branch is the current branch', async () => {
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });

      const result = await service.prepare('/repo', 'main');

      expect(result).toBeNull();
    });

    it('should create a worktree for an existing local branch', async () => {
      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list (worktree list --porcelain) - no existing worktrees match
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\n',
        stderr: '',
      });
      // rev-parse --verify (branch exists locally)
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });
      // worktree add
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.prepare('/repo', 'feature');

      expect(result).toBe(path.join('/repo', '.worktrees', 'feature'));
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'add',
        path.join('/repo', '.worktrees', 'feature'),
        'feature',
      ]);
    });

    it('should create a new branch with worktree when branch does not exist', async () => {
      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list (worktree list --porcelain)
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\n',
        stderr: '',
      });
      // rev-parse --verify (branch does NOT exist locally)
      mockGitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // branch -r --list (not on remote either)
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // worktree add -b
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const worktreePath = path.join('/repo', '.worktrees', 'new-branch');
      const result = await service.prepare('/repo', 'new-branch');

      expect(result).toBe(worktreePath);
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'add',
        '-b',
        'new-branch',
        worktreePath,
        'HEAD',
      ]);
    });

    it('should return existing worktree path if worktree already exists and directory is valid', async () => {
      const worktreePath = path.join('/repo', '.worktrees', 'feature');

      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list (worktree list --porcelain) - worktree exists
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: `worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath}\nHEAD def456\nbranch refs/heads/feature\n\n`,
        stderr: '',
      });
      // fs.access succeeds (directory exists)
      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await service.prepare('/repo', 'feature');

      expect(result).toBe(worktreePath);
    });

    it('should prune and recreate worktree if existing worktree directory is missing', async () => {
      const worktreePath = path.join('/repo', '.worktrees', 'feature');

      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list (worktree list --porcelain) - worktree listed
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: `worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath}\nHEAD def456\nbranch refs/heads/feature\n\n`,
        stderr: '',
      });
      // fs.access fails (directory missing)
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
      // worktree prune
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // rev-parse --verify (branch exists)
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'def456\n', stderr: '' });
      // worktree add
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.prepare('/repo', 'feature');

      expect(result).toBe(worktreePath);
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', ['worktree', 'prune']);
    });

    it('should use --detach when branch is already checked out elsewhere', async () => {
      const worktreePath = path.join('/repo', '.worktrees', 'feature');

      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\n',
        stderr: '',
      });
      // rev-parse --verify (branch exists)
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });
      // worktree add fails with "already checked out"
      mockGitBase.execGit.mockRejectedValueOnce(
        new Error('already checked out in another worktree')
      );
      // worktree add --detach
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.prepare('/repo', 'feature');

      expect(result).toBe(worktreePath);
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'add',
        '--detach',
        worktreePath,
        'feature',
      ]);
    });

    it('should create parent directory for the worktree', async () => {
      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\n',
        stderr: '',
      });
      // rev-parse --verify
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });
      // worktree add
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.prepare('/repo', 'feature');

      expect(mockFs.mkdir).toHaveBeenCalledWith(path.join('/repo', '.worktrees'), {
        recursive: true,
      });
    });

    it('should detect remote branch and create worktree for it', async () => {
      const worktreePath = path.join('/repo', '.worktrees', 'remote-branch');

      // getCurrentBranch
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      // list
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\n',
        stderr: '',
      });
      // rev-parse --verify (not found locally)
      mockGitBase.execGit.mockRejectedValueOnce(new Error('not found'));
      // branch -r --list (found on remote)
      mockGitBase.execGit.mockResolvedValueOnce({
        stdout: '  origin/remote-branch\n',
        stderr: '',
      });
      // worktree add (branch exists remotely, so branchExists = true)
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.prepare('/repo', 'remote-branch');

      expect(result).toBe(worktreePath);
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'add',
        worktreePath,
        'remote-branch',
      ]);
    });
  });

  // ==================== cleanup ====================

  describe('cleanup', () => {
    it('should remove worktree using git worktree remove', async () => {
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.cleanup('/repo', '/repo/.worktrees/feature');

      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'remove',
        '/repo/.worktrees/feature',
        '--force',
      ]);
    });

    it('should fall back to manual cleanup when git worktree remove fails', async () => {
      // worktree remove fails
      mockGitBase.execGit.mockRejectedValueOnce(new Error('worktree remove failed'));
      // worktree prune succeeds
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.cleanup('/repo', '/repo/.worktrees/feature');

      expect(mockFs.rm).toHaveBeenCalledWith('/repo/.worktrees/feature', {
        recursive: true,
        force: true,
      });
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', ['worktree', 'prune']);
    });

    it('should not throw when manual cleanup also fails', async () => {
      // worktree remove fails
      mockGitBase.execGit.mockRejectedValueOnce(new Error('worktree remove failed'));
      // fs.rm fails
      mockFs.rm.mockRejectedValueOnce(new Error('rm failed'));

      // Should not throw
      await expect(service.cleanup('/repo', '/repo/.worktrees/feature')).resolves.toBeUndefined();
    });
  });

  // ==================== list ====================

  describe('list', () => {
    it('should parse porcelain worktree list output correctly', async () => {
      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc1234567890',
        'branch refs/heads/main',
        '',
        'worktree /repo/.worktrees/feature',
        'HEAD def4567890123',
        'branch refs/heads/feature',
        '',
      ].join('\n');

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      const result = await service.list('/repo');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: '/repo',
        head: 'abc1234567890',
        branch: 'main',
        isMain: true,
        isLocked: false,
        isPrunable: false,
      });
      expect(result[1]).toEqual({
        path: '/repo/.worktrees/feature',
        head: 'def4567890123',
        branch: 'feature',
        isMain: false,
        isLocked: false,
        isPrunable: false,
      });
    });

    it('should handle locked worktrees', async () => {
      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo/.worktrees/locked-branch',
        'HEAD def456',
        'branch refs/heads/locked-branch',
        'locked',
        '',
      ].join('\n');

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      const result = await service.list('/repo');

      expect(result[1].isLocked).toBe(true);
    });

    it('should handle prunable worktrees', async () => {
      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo/.worktrees/stale',
        'HEAD def456',
        'branch refs/heads/stale',
        'prunable',
        '',
      ].join('\n');

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      const result = await service.list('/repo');

      expect(result[1].isPrunable).toBe(true);
    });

    it('should handle detached HEAD worktrees', async () => {
      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo/.worktrees/detached',
        'HEAD def456',
        'detached',
        '',
      ].join('\n');

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      const result = await service.list('/repo');

      expect(result[1].branch).toBe('detached');
    });

    it('should handle bare repositories', async () => {
      const porcelainOutput = ['worktree /repo.git', 'HEAD abc123', 'bare', ''].join('\n');

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      const result = await service.list('/repo');

      expect(result[0].isMain).toBe(true);
    });

    it('should mark first worktree as main if none are explicitly marked', async () => {
      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo/.worktrees/feature',
        'HEAD def456',
        'branch refs/heads/feature',
        '',
      ].join('\n');

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      const result = await service.list('/repo');

      expect(result[0].isMain).toBe(true);
      expect(result[1].isMain).toBe(false);
    });

    it('should return empty array for empty output', async () => {
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.list('/repo');

      expect(result).toEqual([]);
    });
  });

  // ==================== cleanupAll ====================

  describe('cleanupAll', () => {
    it('should clean up only Omniscribe-managed worktrees', async () => {
      const projectWorktreePath = path.join('/repo', '.worktrees', 'feature');

      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        `worktree ${projectWorktreePath}`,
        'HEAD def456',
        'branch refs/heads/feature',
        '',
        'worktree /some/other/path',
        'HEAD ghi789',
        'branch refs/heads/other',
        '',
      ].join('\n');

      // list call
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });
      // cleanup for project worktree only
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.cleanupAll('/repo');

      // Should only clean up the .worktrees one, not /some/other/path and not main
      expect(mockGitBase.execGit).toHaveBeenCalledTimes(2);
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'remove',
        projectWorktreePath,
        '--force',
      ]);
    });

    it('should not clean up the main worktree', async () => {
      const porcelainOutput = ['worktree /repo', 'HEAD abc123', 'branch refs/heads/main', ''].join(
        '\n'
      );

      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });

      await service.cleanupAll('/repo');

      // Only the list call should have been made, no cleanup
      expect(mockGitBase.execGit).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed path separators in worktree paths', async () => {
      // Simulate git porcelain returning forward-slash paths even when
      // path.join might produce backslash paths (or vice versa)
      const projectWorktreePath = '/repo/.worktrees/feature';

      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        `worktree ${projectWorktreePath}`,
        'HEAD def456',
        'branch refs/heads/feature',
        '',
      ].join('\n');

      // list call
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });
      // cleanup for project worktree
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.cleanupAll('/repo');

      // Should clean up the worktree even if separators differ
      expect(mockGitBase.execGit).toHaveBeenCalledTimes(2);
      expect(mockGitBase.execGit).toHaveBeenCalledWith('/repo', [
        'worktree',
        'remove',
        projectWorktreePath,
        '--force',
      ]);
    });

    it('should clean up multiple managed worktrees', async () => {
      const wt1 = path.join('/repo', '.worktrees', 'feature-1');
      const wt2 = path.join('/repo', '.worktrees', 'feature-2');

      const porcelainOutput = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        `worktree ${wt1}`,
        'HEAD def456',
        'branch refs/heads/feature-1',
        '',
        `worktree ${wt2}`,
        'HEAD ghi789',
        'branch refs/heads/feature-2',
        '',
      ].join('\n');

      // list call
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: porcelainOutput, stderr: '' });
      // cleanup for wt1
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // cleanup for wt2
      mockGitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.cleanupAll('/repo');

      expect(mockGitBase.execGit).toHaveBeenCalledTimes(3); // 1 list + 2 cleanups
    });
  });
});
