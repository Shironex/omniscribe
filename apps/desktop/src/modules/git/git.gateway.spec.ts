import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { GitGateway } from './git.gateway';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
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
});
