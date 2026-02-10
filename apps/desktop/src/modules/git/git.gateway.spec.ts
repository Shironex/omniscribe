import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { GitGateway } from './git.gateway';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';
import { MAX_PATH_LENGTH } from '@omniscribe/shared';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

function createMockServer(): Server {
  const toEmit = jest.fn();
  const server = {
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: toEmit }),
  } as unknown as Server;
  return server;
}

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockGitService = {
  getBranches: jest.fn(),
  getCurrentBranch: jest.fn(),
  getCommitLog: jest.fn(),
  checkout: jest.fn(),
  createBranch: jest.fn(),
};

const mockWorktreeService = {
  list: jest.fn(),
  cleanup: jest.fn(),
};

const mockGithubService = {
  getStatus: jest.fn(),
  clearCache: jest.fn(),
  getRepoInfo: jest.fn(),
  listPullRequests: jest.fn(),
  getPullRequest: jest.fn(),
  createPullRequest: jest.fn(),
  listIssues: jest.fn(),
  getIssue: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitGateway', () => {
  let gateway: GitGateway;
  let server: Server;
  let client: Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [
        GitGateway,
        { provide: GitService, useValue: mockGitService },
        { provide: WorktreeService, useValue: mockWorktreeService },
        { provide: GithubService, useValue: mockGithubService },
      ],
    }).compile();

    gateway = module.get<GitGateway>(GitGateway);
    server = createMockServer();
    gateway.server = server;
    client = createMockSocket();
  });

  // ========================================================================
  // Path validation (shared across handlers)
  // ========================================================================

  describe('path validation', () => {
    it('should reject relative paths', async () => {
      const result = await gateway.handleBranches(client, {
        projectPath: 'relative/path',
      });

      expect(result.error).toBe('Invalid projectPath: must be an absolute path');
      expect(mockGitService.getBranches).not.toHaveBeenCalled();
    });

    it('should reject path traversal attempts', async () => {
      const result = await gateway.handleBranches(client, {
        projectPath: '../../etc',
      });

      expect(result.error).toBe('Invalid projectPath: must be an absolute path');
      expect(mockGitService.getBranches).not.toHaveBeenCalled();
    });

    it('should reject paths exceeding MAX_PATH_LENGTH', async () => {
      const result = await gateway.handleBranches(client, {
        projectPath: '/' + 'a'.repeat(MAX_PATH_LENGTH),
      });

      expect(result.error).toBe(
        `projectPath exceeds maximum length of ${MAX_PATH_LENGTH} characters`
      );
      expect(mockGitService.getBranches).not.toHaveBeenCalled();
    });

    it('should reject non-string projectPath values', async () => {
      const result = await gateway.handleBranches(client, {
        projectPath: 123 as unknown as string,
      });

      expect(result.error).toBe('Invalid projectPath: must be a non-empty string');
      expect(mockGitService.getBranches).not.toHaveBeenCalled();
    });

    it('should accept valid absolute paths', async () => {
      mockGitService.getBranches.mockResolvedValue([]);
      mockGitService.getCurrentBranch.mockResolvedValue('main');

      const result = await gateway.handleBranches(client, {
        projectPath: '/valid/absolute/path',
      });

      expect(result.error).toBeUndefined();
      expect(mockGitService.getBranches).toHaveBeenCalledWith('/valid/absolute/path');
    });

    it('should validate worktreePath in handleWorktreeCleanup', async () => {
      const result = await gateway.handleWorktreeCleanup(client, {
        projectPath: '/repo',
        worktreePath: 'relative/worktree',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid worktreePath: must be an absolute path',
      });
      expect(mockWorktreeService.cleanup).not.toHaveBeenCalled();
    });

    it('should validate projectPath before worktreePath in handleWorktreeCleanup', async () => {
      const result = await gateway.handleWorktreeCleanup(client, {
        projectPath: 'relative',
        worktreePath: 'also-relative',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid projectPath: must be an absolute path',
      });
    });
  });

  // ========================================================================
  // git:branches
  // ========================================================================

  describe('handleBranches', () => {
    it('should return branches and currentBranch on success', async () => {
      const branches = [
        { name: 'main', isCurrent: true, isRemote: false },
        { name: 'feature/x', isCurrent: false, isRemote: false },
      ];
      mockGitService.getBranches.mockResolvedValue(branches);
      mockGitService.getCurrentBranch.mockResolvedValue('main');

      const result = await gateway.handleBranches(client, {
        projectPath: '/repo',
      });

      expect(mockGitService.getBranches).toHaveBeenCalledWith('/repo');
      expect(mockGitService.getCurrentBranch).toHaveBeenCalledWith('/repo');
      expect(client.join).toHaveBeenCalledWith('git:/repo');
      expect(result).toEqual({ branches, currentBranch: 'main' });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleBranches(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        branches: [],
        currentBranch: '',
        error: 'Invalid projectPath: must be a non-empty string',
      });
      expect(mockGitService.getBranches).not.toHaveBeenCalled();
    });

    it('should return error when service throws', async () => {
      mockGitService.getBranches.mockRejectedValue(new Error('git not found'));

      const result = await gateway.handleBranches(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({
        branches: [],
        currentBranch: '',
        error: 'git not found',
      });
    });

    it('should handle non-Error thrown values', async () => {
      mockGitService.getBranches.mockRejectedValue('string error');

      const result = await gateway.handleBranches(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({
        branches: [],
        currentBranch: '',
        error: 'Unknown error',
      });
    });
  });

  // ========================================================================
  // git:commits
  // ========================================================================

  describe('handleCommits', () => {
    it('should return commits on success with default limit and allBranches', async () => {
      const commits = [{ hash: 'abc123', message: 'init' }];
      mockGitService.getCommitLog.mockResolvedValue(commits);

      const result = await gateway.handleCommits(client, {
        projectPath: '/repo',
      });

      expect(mockGitService.getCommitLog).toHaveBeenCalledWith('/repo', 50, true);
      expect(client.join).toHaveBeenCalledWith('git:/repo');
      expect(result).toEqual({ commits });
    });

    it('should pass custom limit and allBranches', async () => {
      mockGitService.getCommitLog.mockResolvedValue([]);

      await gateway.handleCommits(client, {
        projectPath: '/repo',
        limit: 10,
        allBranches: false,
      });

      expect(mockGitService.getCommitLog).toHaveBeenCalledWith('/repo', 10, false);
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleCommits(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        commits: [],
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockGitService.getCommitLog.mockRejectedValue(new Error('log failed'));

      const result = await gateway.handleCommits(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({ commits: [], error: 'log failed' });
    });
  });

  // ========================================================================
  // git:checkout
  // ========================================================================

  describe('handleCheckout', () => {
    it('should checkout branch and notify room on success', async () => {
      mockGitService.checkout.mockResolvedValue(undefined);
      mockGitService.getCurrentBranch.mockResolvedValue('feature/x');

      const result = await gateway.handleCheckout(client, {
        projectPath: '/repo',
        branch: 'feature/x',
      });

      expect(mockGitService.checkout).toHaveBeenCalledWith('/repo', 'feature/x');
      expect(server.to).toHaveBeenCalledWith('git:/repo');
      expect((server.to as jest.Mock).mock.results[0].value.emit).toHaveBeenCalledWith(
        'git:branches',
        { projectPath: '/repo', currentBranch: 'feature/x' }
      );
      expect(result).toEqual({ success: true, currentBranch: 'feature/x' });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleCheckout(client, {
        projectPath: '',
        branch: 'main',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when branch is missing', async () => {
      const result = await gateway.handleCheckout(client, {
        projectPath: '/repo',
        branch: '',
      });

      expect(result).toEqual({
        success: false,
        error: 'Branch is required',
      });
    });

    it('should return error when service throws', async () => {
      mockGitService.checkout.mockRejectedValue(new Error('checkout failed'));

      const result = await gateway.handleCheckout(client, {
        projectPath: '/repo',
        branch: 'main',
      });

      expect(result).toEqual({ success: false, error: 'checkout failed' });
    });
  });

  // ========================================================================
  // git:create-branch
  // ========================================================================

  describe('handleCreateBranch', () => {
    it('should create branch and notify room on success', async () => {
      const newBranch = { name: 'feature/new', isCurrent: false, isRemote: false };
      mockGitService.createBranch.mockResolvedValue(undefined);
      mockGitService.getBranches.mockResolvedValue([
        { name: 'main', isCurrent: true, isRemote: false },
        newBranch,
      ]);

      const result = await gateway.handleCreateBranch(client, {
        projectPath: '/repo',
        name: 'feature/new',
      });

      expect(mockGitService.createBranch).toHaveBeenCalledWith('/repo', 'feature/new', undefined);
      expect(server.to).toHaveBeenCalledWith('git:/repo');
      expect(result).toEqual({ success: true, branch: newBranch });
    });

    it('should pass startPoint when provided', async () => {
      mockGitService.createBranch.mockResolvedValue(undefined);
      mockGitService.getBranches.mockResolvedValue([]);

      await gateway.handleCreateBranch(client, {
        projectPath: '/repo',
        name: 'hotfix',
        startPoint: 'abc123',
      });

      expect(mockGitService.createBranch).toHaveBeenCalledWith('/repo', 'hotfix', 'abc123');
    });

    it('should return undefined branch when name not found in branches list', async () => {
      mockGitService.createBranch.mockResolvedValue(undefined);
      mockGitService.getBranches.mockResolvedValue([
        { name: 'main', isCurrent: true, isRemote: false },
      ]);

      const result = await gateway.handleCreateBranch(client, {
        projectPath: '/repo',
        name: 'nonexistent',
      });

      expect(result).toEqual({ success: true, branch: undefined });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleCreateBranch(client, {
        projectPath: '',
        name: 'feature/x',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when name is missing', async () => {
      const result = await gateway.handleCreateBranch(client, {
        projectPath: '/repo',
        name: '',
      });

      expect(result).toEqual({
        success: false,
        error: 'Branch name is required',
      });
    });

    it('should return error when service throws', async () => {
      mockGitService.createBranch.mockRejectedValue(new Error('branch exists'));

      const result = await gateway.handleCreateBranch(client, {
        projectPath: '/repo',
        name: 'feature/dup',
      });

      expect(result).toEqual({ success: false, error: 'branch exists' });
    });
  });

  // ========================================================================
  // git:current-branch
  // ========================================================================

  describe('handleCurrentBranch', () => {
    it('should return current branch and join room', async () => {
      mockGitService.getCurrentBranch.mockResolvedValue('develop');

      const result = await gateway.handleCurrentBranch(client, {
        projectPath: '/repo',
      });

      expect(mockGitService.getCurrentBranch).toHaveBeenCalledWith('/repo');
      expect(client.join).toHaveBeenCalledWith('git:/repo');
      expect(result).toEqual({ currentBranch: 'develop' });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleCurrentBranch(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        currentBranch: '',
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockGitService.getCurrentBranch.mockRejectedValue(new Error('not a git repo'));

      const result = await gateway.handleCurrentBranch(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({ currentBranch: '', error: 'not a git repo' });
    });
  });

  // ========================================================================
  // git:worktrees
  // ========================================================================

  describe('handleWorktrees', () => {
    it('should return worktrees on success', async () => {
      const worktrees = [{ path: '/repo/.worktrees/feat', branch: 'feat', isMain: false }];
      mockWorktreeService.list.mockResolvedValue(worktrees);

      const result = await gateway.handleWorktrees(client, {
        projectPath: '/repo',
      });

      expect(mockWorktreeService.list).toHaveBeenCalledWith('/repo');
      expect(result).toEqual({ worktrees });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleWorktrees(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        worktrees: [],
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockWorktreeService.list.mockRejectedValue(new Error('list failed'));

      const result = await gateway.handleWorktrees(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({ worktrees: [], error: 'list failed' });
    });
  });

  // ========================================================================
  // git:worktree:cleanup
  // ========================================================================

  describe('handleWorktreeCleanup', () => {
    it('should cleanup worktree on success', async () => {
      mockWorktreeService.cleanup.mockResolvedValue(undefined);

      const result = await gateway.handleWorktreeCleanup(client, {
        projectPath: '/repo',
        worktreePath: '/repo/.worktrees/feat',
      });

      expect(mockWorktreeService.cleanup).toHaveBeenCalledWith('/repo', '/repo/.worktrees/feat');
      expect(result).toEqual({ success: true });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleWorktreeCleanup(client, {
        projectPath: '',
        worktreePath: '/repo/.worktrees/feat',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when worktreePath is missing', async () => {
      const result = await gateway.handleWorktreeCleanup(client, {
        projectPath: '/repo',
        worktreePath: '',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid worktreePath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockWorktreeService.cleanup.mockRejectedValue(new Error('remove failed'));

      const result = await gateway.handleWorktreeCleanup(client, {
        projectPath: '/repo',
        worktreePath: '/repo/.worktrees/feat',
      });

      expect(result).toEqual({ success: false, error: 'remove failed' });
    });
  });

  // ========================================================================
  // github:status
  // ========================================================================

  describe('handleGithubStatus', () => {
    it('should return GitHub CLI status', async () => {
      const status = {
        installed: true,
        version: '2.40.0',
        platform: 'win32',
        arch: 'x64',
        auth: { authenticated: true, user: 'testuser' },
      };
      mockGithubService.getStatus.mockResolvedValue(status);

      const result = await gateway.handleGithubStatus(client, {});

      expect(mockGithubService.getStatus).toHaveBeenCalled();
      expect(mockGithubService.clearCache).not.toHaveBeenCalled();
      expect(result).toEqual({ status });
    });

    it('should clear cache when refresh is true', async () => {
      const status = {
        installed: true,
        platform: 'win32',
        arch: 'x64',
        auth: { authenticated: false },
      };
      mockGithubService.getStatus.mockResolvedValue(status);

      await gateway.handleGithubStatus(client, { refresh: true });

      expect(mockGithubService.clearCache).toHaveBeenCalled();
    });

    it('should return fallback status on error', async () => {
      mockGithubService.getStatus.mockRejectedValue(new Error('exec failed'));

      const result = await gateway.handleGithubStatus(client, {});

      expect(result.error).toBe('exec failed');
      expect(result.status.installed).toBe(false);
    });
  });

  // ========================================================================
  // github:repo-info
  // ========================================================================

  describe('handleGithubRepoInfo', () => {
    it('should return repo info on success', async () => {
      const repo = {
        name: 'omniscribe',
        owner: 'shirone',
        fullName: 'shirone/omniscribe',
        defaultBranch: 'main',
        isPrivate: false,
        url: 'https://github.com/shirone/omniscribe',
      };
      mockGithubService.getRepoInfo.mockResolvedValue(repo);

      const result = await gateway.handleGithubRepoInfo(client, {
        projectPath: '/repo',
      });

      expect(mockGithubService.getRepoInfo).toHaveBeenCalledWith('/repo');
      expect(result).toEqual({ repo });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleGithubRepoInfo(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        repo: null,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockGithubService.getRepoInfo.mockRejectedValue(new Error('not a github repo'));

      const result = await gateway.handleGithubRepoInfo(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({ repo: null, error: 'not a github repo' });
    });
  });

  // ========================================================================
  // github:prs
  // ========================================================================

  describe('handleGithubPRs', () => {
    it('should return pull requests on success', async () => {
      const pullRequests = [{ number: 1, title: 'feat: add tests' }];
      mockGithubService.listPullRequests.mockResolvedValue(pullRequests);

      const result = await gateway.handleGithubPRs(client, {
        projectPath: '/repo',
        state: 'open',
        limit: 10,
      });

      expect(mockGithubService.listPullRequests).toHaveBeenCalledWith('/repo', {
        state: 'open',
        limit: 10,
      });
      expect(result).toEqual({ pullRequests });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleGithubPRs(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        pullRequests: [],
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockGithubService.listPullRequests.mockRejectedValue(new Error('api error'));

      const result = await gateway.handleGithubPRs(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({ pullRequests: [], error: 'api error' });
    });
  });

  // ========================================================================
  // github:pr
  // ========================================================================

  describe('handleGithubPR', () => {
    it('should return a single pull request', async () => {
      const pr = { number: 42, title: 'fix: bug' };
      mockGithubService.getPullRequest.mockResolvedValue(pr);

      const result = await gateway.handleGithubPR(client, {
        projectPath: '/repo',
        prNumber: 42,
      });

      expect(mockGithubService.getPullRequest).toHaveBeenCalledWith('/repo', 42);
      expect(result).toEqual({ pullRequest: pr });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleGithubPR(client, {
        projectPath: '',
        prNumber: 1,
      });

      expect(result).toEqual({
        pullRequest: null,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when prNumber is missing', async () => {
      const result = await gateway.handleGithubPR(client, {
        projectPath: '/repo',
        prNumber: 0,
      });

      expect(result).toEqual({
        pullRequest: null,
        error: 'PR number is required',
      });
    });

    it('should return error when service throws', async () => {
      mockGithubService.getPullRequest.mockRejectedValue(new Error('not found'));

      const result = await gateway.handleGithubPR(client, {
        projectPath: '/repo',
        prNumber: 999,
      });

      expect(result).toEqual({ pullRequest: null, error: 'not found' });
    });
  });

  // ========================================================================
  // github:create-pr
  // ========================================================================

  describe('handleGithubCreatePR', () => {
    it('should create a pull request on success', async () => {
      const pr = { number: 10, title: 'feat: new' };
      mockGithubService.createPullRequest.mockResolvedValue(pr);

      const result = await gateway.handleGithubCreatePR(client, {
        projectPath: '/repo',
        title: 'feat: new',
        body: 'description',
        base: 'main',
        head: 'feature/new',
        draft: true,
      });

      expect(mockGithubService.createPullRequest).toHaveBeenCalledWith('/repo', {
        title: 'feat: new',
        body: 'description',
        base: 'main',
        head: 'feature/new',
        draft: true,
      });
      expect(result).toEqual({ success: true, pullRequest: pr });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleGithubCreatePR(client, {
        projectPath: '',
        title: 'test',
      });

      expect(result).toEqual({
        success: false,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when title is missing', async () => {
      const result = await gateway.handleGithubCreatePR(client, {
        projectPath: '/repo',
        title: '',
      });

      expect(result).toEqual({
        success: false,
        error: 'Title is required',
      });
    });

    it('should return error when service throws', async () => {
      mockGithubService.createPullRequest.mockRejectedValue(new Error('permission denied'));

      const result = await gateway.handleGithubCreatePR(client, {
        projectPath: '/repo',
        title: 'test pr',
      });

      expect(result).toEqual({
        success: false,
        error: 'permission denied',
      });
    });
  });

  // ========================================================================
  // github:issues
  // ========================================================================

  describe('handleGithubIssues', () => {
    it('should return issues on success', async () => {
      const issues = [{ number: 1, title: 'bug report' }];
      mockGithubService.listIssues.mockResolvedValue(issues);

      const result = await gateway.handleGithubIssues(client, {
        projectPath: '/repo',
        state: 'open',
        limit: 25,
        labels: ['bug'],
      });

      expect(mockGithubService.listIssues).toHaveBeenCalledWith('/repo', {
        state: 'open',
        limit: 25,
        labels: ['bug'],
      });
      expect(result).toEqual({ issues });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleGithubIssues(client, {
        projectPath: '',
      });

      expect(result).toEqual({
        issues: [],
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when service throws', async () => {
      mockGithubService.listIssues.mockRejectedValue(new Error('api error'));

      const result = await gateway.handleGithubIssues(client, {
        projectPath: '/repo',
      });

      expect(result).toEqual({ issues: [], error: 'api error' });
    });
  });

  // ========================================================================
  // github:issue
  // ========================================================================

  describe('handleGithubIssue', () => {
    it('should return a single issue', async () => {
      const issue = { number: 7, title: 'feature request' };
      mockGithubService.getIssue.mockResolvedValue(issue);

      const result = await gateway.handleGithubIssue(client, {
        projectPath: '/repo',
        issueNumber: 7,
      });

      expect(mockGithubService.getIssue).toHaveBeenCalledWith('/repo', 7);
      expect(result).toEqual({ issue });
    });

    it('should return error when projectPath is missing', async () => {
      const result = await gateway.handleGithubIssue(client, {
        projectPath: '',
        issueNumber: 1,
      });

      expect(result).toEqual({
        issue: null,
        error: 'Invalid projectPath: must be a non-empty string',
      });
    });

    it('should return error when issueNumber is missing', async () => {
      const result = await gateway.handleGithubIssue(client, {
        projectPath: '/repo',
        issueNumber: 0,
      });

      expect(result).toEqual({
        issue: null,
        error: 'Issue number is required',
      });
    });

    it('should return error when service throws', async () => {
      mockGithubService.getIssue.mockRejectedValue(new Error('issue not found'));

      const result = await gateway.handleGithubIssue(client, {
        projectPath: '/repo',
        issueNumber: 999,
      });

      expect(result).toEqual({ issue: null, error: 'issue not found' });
    });
  });
});
