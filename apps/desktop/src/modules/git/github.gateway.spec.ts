import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Socket } from 'socket.io';
import { GithubGateway } from './github.gateway';
import { GithubService } from './github.service';

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

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

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

describe('GithubGateway', () => {
  let gateway: GithubGateway;
  let client: Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [GithubGateway, { provide: GithubService, useValue: mockGithubService }],
    }).compile();

    gateway = module.get<GithubGateway>(GithubGateway);
    client = createMockSocket();
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
