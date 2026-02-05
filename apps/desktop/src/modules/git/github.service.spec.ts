import { Test, TestingModule } from '@nestjs/testing';
import { GithubService } from './github.service';

// The promisified exec mock function.
let mockExecAsync: jest.Mock;

jest.mock('util', () => {
  const fn = jest.fn();
  (global as Record<string, unknown>).__mockGhExec = fn;
  return {
    promisify: () => fn,
  };
});

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockExecSync = require('child_process').execSync as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockExistsSync = require('fs').existsSync as jest.Mock;

describe('GithubService', () => {
  let service: GithubService;

  beforeEach(async () => {
    mockExecAsync = (global as Record<string, unknown>).__mockGhExec as jest.Mock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GithubService],
    }).compile();

    service = module.get<GithubService>(GithubService);
    mockExecAsync.mockReset();
    mockExecSync.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);

    // Clear the internal cache between tests
    service.clearCache();
  });

  // ==================== isAvailable ====================

  describe('isAvailable', () => {
    it('should return true when gh CLI is found in PATH', () => {
      mockExecSync.mockReturnValue(Buffer.from('/usr/local/bin/gh'));

      const result = service.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when gh CLI is not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const result = service.isAvailable();

      expect(result).toBe(false);
    });
  });

  // ==================== getStatus ====================

  describe('getStatus', () => {
    it('should return not-installed status when gh CLI is not found', async () => {
      // findCli: "which gh" / "where gh" fails
      mockExecAsync.mockRejectedValueOnce(new Error('not found'));
      // existsSync returns false for all common paths
      mockExistsSync.mockReturnValue(false);

      const status = await service.getStatus();

      expect(status.installed).toBe(false);
      expect(status.auth.authenticated).toBe(false);
    });

    it('should return installed status with version and auth when gh CLI is found', async () => {
      // findCli: "which gh" succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'gh version 2.40.1 (2024-01-15)\n',
        stderr: '',
      });
      // checkAuth
      mockExecAsync.mockResolvedValueOnce({
        stdout:
          'Logged in to github.com account testuser (oauth_token)\nToken scopes: repo, read:org\n',
        stderr: '',
      });

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.path).toBe('/usr/local/bin/gh');
      expect(status.version).toBe('2.40.1');
      expect(status.method).toBe('path');
      expect(status.auth.authenticated).toBe(true);
      expect(status.auth.username).toBe('testuser');
      expect(status.auth.scopes).toEqual(['repo', 'read:org']);
    });

    it('should return cached status within TTL', async () => {
      // First call - findCli
      mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user1',
        stderr: '',
      });

      const status1 = await service.getStatus();
      const status2 = await service.getStatus();

      // Should only call execAsync for the first request (3 times: findCli, getVersion, checkAuth)
      expect(mockExecAsync).toHaveBeenCalledTimes(3);
      expect(status1).toBe(status2);
    });

    it('should handle unauthenticated gh CLI', async () => {
      // findCli
      mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth - not logged in
      mockExecAsync.mockRejectedValueOnce(new Error('You are not logged into any GitHub hosts'));

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.auth.authenticated).toBe(false);
    });

    it('should handle auth check timeout gracefully', async () => {
      // findCli
      mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth - timeout
      const timeoutError = new Error('timed out') as Error & { killed?: boolean; signal?: string };
      timeoutError.killed = true;
      mockExecAsync.mockRejectedValueOnce(timeoutError);

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.auth.authenticated).toBe(false);
    });
  });

  // ==================== clearCache ====================

  describe('clearCache', () => {
    it('should force a fresh fetch on next getStatus call', async () => {
      // First call
      mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user1',
        stderr: '',
      });

      await service.getStatus();

      service.clearCache();

      // Second call after cache clear
      mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: 'gh version 2.41.0\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user2',
        stderr: '',
      });

      const status = await service.getStatus();

      expect(mockExecAsync).toHaveBeenCalledTimes(6); // 3 + 3
      expect(status.version).toBe('2.41.0');
    });
  });

  // ==================== hasGitHubRemote ====================

  describe('hasGitHubRemote', () => {
    it('should return true when repo has a GitHub remote', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ url: 'https://github.com/user/repo' }),
        stderr: '',
      });

      const result = await service.hasGitHubRemote('/repo');

      expect(result).toBe(true);
    });

    it('should return false when gh command fails', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('not a github repo'));

      const result = await service.hasGitHubRemote('/repo');

      expect(result).toBe(false);
    });

    it('should return false when url is empty', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ url: '' }),
        stderr: '',
      });

      const result = await service.hasGitHubRemote('/repo');

      expect(result).toBe(false);
    });
  });

  // ==================== getRepoInfo ====================

  describe('getRepoInfo', () => {
    it('should return repo information on success', async () => {
      const repoData = {
        name: 'my-repo',
        nameWithOwner: 'user/my-repo',
        description: 'A great repo',
        url: 'https://github.com/user/my-repo',
        defaultBranchRef: { name: 'main' },
        visibility: 'PUBLIC',
        isFork: false,
        isArchived: false,
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(repoData),
        stderr: '',
      });

      const result = await service.getRepoInfo('/repo');

      expect(result).toEqual({
        name: 'my-repo',
        fullName: 'user/my-repo',
        description: 'A great repo',
        url: 'https://github.com/user/my-repo',
        defaultBranch: 'main',
        visibility: 'public',
        isFork: false,
        isArchived: false,
      });
    });

    it('should return null when gh command fails', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('not a repo'));

      const result = await service.getRepoInfo('/repo');

      expect(result).toBeNull();
    });

    it('should use "main" as default branch when defaultBranchRef is missing', async () => {
      const repoData = {
        name: 'my-repo',
        nameWithOwner: 'user/my-repo',
        url: 'https://github.com/user/my-repo',
        defaultBranchRef: null,
        visibility: 'PRIVATE',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(repoData),
        stderr: '',
      });

      const result = await service.getRepoInfo('/repo');

      expect(result!.defaultBranch).toBe('main');
    });

    it('should handle missing description', async () => {
      const repoData = {
        name: 'my-repo',
        nameWithOwner: 'user/my-repo',
        description: null,
        url: 'https://github.com/user/my-repo',
        defaultBranchRef: { name: 'main' },
        visibility: 'PUBLIC',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(repoData),
        stderr: '',
      });

      const result = await service.getRepoInfo('/repo');

      expect(result!.description).toBeUndefined();
    });
  });

  // ==================== listPullRequests ====================

  describe('listPullRequests', () => {
    it('should return pull requests', async () => {
      const prData = [
        {
          number: 1,
          title: 'Fix bug',
          body: 'Fixes the bug',
          state: 'OPEN',
          author: { login: 'user1', name: 'User One' },
          url: 'https://github.com/user/repo/pull/1',
          headRefName: 'fix-bug',
          baseRefName: 'main',
          isDraft: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          mergedAt: null,
        },
      ];
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prData),
        stderr: '',
      });

      const result = await service.listPullRequests('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(1);
      expect(result[0].title).toBe('Fix bug');
      expect(result[0].state).toBe('open');
      expect(result[0].author.login).toBe('user1');
    });

    it('should return empty array for empty stdout', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '  \n', stderr: '' });

      const result = await service.listPullRequests('/repo');

      expect(result).toEqual([]);
    });

    it('should pass state and limit options', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listPullRequests('/repo', { state: 'closed', limit: 10 });

      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).toContain('--state closed');
      expect(command).toContain('--limit 10');
    });

    it('should not pass state flag for "all"', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listPullRequests('/repo', { state: 'all' });

      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).not.toContain('--state');
    });

    it('should map MERGED state to "merged"', async () => {
      const prData = [
        {
          number: 1,
          title: 'Merged PR',
          state: 'MERGED',
          author: { login: 'user1' },
          url: 'https://github.com/user/repo/pull/1',
          headRefName: 'feature',
          baseRefName: 'main',
          isDraft: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          mergedAt: '2024-01-03T00:00:00Z',
        },
      ];
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prData),
        stderr: '',
      });

      const result = await service.listPullRequests('/repo');

      expect(result[0].state).toBe('merged');
      expect(result[0].mergedAt).toBe('2024-01-03T00:00:00Z');
    });
  });

  // ==================== createPullRequest ====================

  describe('createPullRequest', () => {
    it('should create a pull request with required options', async () => {
      const prResponse = {
        number: 42,
        title: 'New Feature',
        body: 'Description here',
        state: 'OPEN',
        author: { login: 'creator', name: 'Creator' },
        url: 'https://github.com/user/repo/pull/42',
        headRefName: 'feature',
        baseRefName: 'main',
        isDraft: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prResponse),
        stderr: '',
      });

      const result = await service.createPullRequest('/repo', { title: 'New Feature' });

      expect(result.number).toBe(42);
      expect(result.title).toBe('New Feature');
      expect(result.state).toBe('open');
      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).toContain('--title New Feature');
    });

    it('should pass optional body, base, head, and draft flags', async () => {
      const prResponse = {
        number: 43,
        title: 'Draft PR',
        state: 'OPEN',
        author: { login: 'creator' },
        url: 'https://github.com/user/repo/pull/43',
        headRefName: 'feature',
        baseRefName: 'develop',
        isDraft: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prResponse),
        stderr: '',
      });

      await service.createPullRequest('/repo', {
        title: 'Draft PR',
        body: 'Some body',
        base: 'develop',
        head: 'feature',
        draft: true,
      });

      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).toContain('--body Some body');
      expect(command).toContain('--base develop');
      expect(command).toContain('--head feature');
      expect(command).toContain('--draft');
    });
  });

  // ==================== listIssues ====================

  describe('listIssues', () => {
    it('should return issues', async () => {
      const issueData = [
        {
          number: 10,
          title: 'Bug report',
          body: 'Something is broken',
          state: 'OPEN',
          author: { login: 'reporter', name: 'Reporter' },
          url: 'https://github.com/user/repo/issues/10',
          labels: [{ name: 'bug', color: 'fc2929' }],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          closedAt: null,
        },
      ];
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(issueData),
        stderr: '',
      });

      const result = await service.listIssues('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(10);
      expect(result[0].state).toBe('open');
      expect(result[0].labels).toEqual([{ name: 'bug', color: 'fc2929' }]);
      expect(result[0].closedAt).toBeUndefined();
    });

    it('should return empty array for empty stdout', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.listIssues('/repo');

      expect(result).toEqual([]);
    });

    it('should pass state, limit, and labels options', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listIssues('/repo', {
        state: 'closed',
        limit: 20,
        labels: ['bug', 'high-priority'],
      });

      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).toContain('--state closed');
      expect(command).toContain('--limit 20');
      expect(command).toContain('--label bug,high-priority');
    });

    it('should not pass state flag for "all"', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listIssues('/repo', { state: 'all' });

      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).not.toContain('--state');
    });
  });

  // ==================== getPullRequest ====================

  describe('getPullRequest', () => {
    it('should return a specific pull request', async () => {
      const prData = {
        number: 5,
        title: 'My PR',
        body: 'Description',
        state: 'OPEN',
        author: { login: 'dev', name: 'Developer' },
        url: 'https://github.com/user/repo/pull/5',
        headRefName: 'feature',
        baseRefName: 'main',
        isDraft: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        mergedAt: null,
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prData),
        stderr: '',
      });

      const result = await service.getPullRequest('/repo', 5);

      expect(result).not.toBeNull();
      expect(result!.number).toBe(5);
      expect(result!.state).toBe('open');
      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).toContain('pr view 5');
    });

    it('should return null when PR is not found', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('PR not found'));

      const result = await service.getPullRequest('/repo', 999);

      expect(result).toBeNull();
    });

    it('should handle merged pull request state', async () => {
      const prData = {
        number: 5,
        title: 'Merged PR',
        state: 'MERGED',
        author: { login: 'dev' },
        url: 'https://github.com/user/repo/pull/5',
        headRefName: 'feature',
        baseRefName: 'main',
        isDraft: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        mergedAt: '2024-01-02T00:00:00Z',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prData),
        stderr: '',
      });

      const result = await service.getPullRequest('/repo', 5);

      expect(result!.state).toBe('merged');
      expect(result!.mergedAt).toBe('2024-01-02T00:00:00Z');
    });
  });

  // ==================== getIssue ====================

  describe('getIssue', () => {
    it('should return a specific issue', async () => {
      const issueData = {
        number: 15,
        title: 'Feature request',
        body: 'Please add X',
        state: 'OPEN',
        author: { login: 'requester', name: 'Requester' },
        url: 'https://github.com/user/repo/issues/15',
        labels: [{ name: 'enhancement', color: '84b6eb' }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        closedAt: null,
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(issueData),
        stderr: '',
      });

      const result = await service.getIssue('/repo', 15);

      expect(result).not.toBeNull();
      expect(result!.number).toBe(15);
      expect(result!.title).toBe('Feature request');
      expect(result!.labels).toEqual([{ name: 'enhancement', color: '84b6eb' }]);
      const command = mockExecAsync.mock.calls[0][0] as string;
      expect(command).toContain('issue view 15');
    });

    it('should return null when issue is not found', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('issue not found'));

      const result = await service.getIssue('/repo', 999);

      expect(result).toBeNull();
    });

    it('should handle closed issue', async () => {
      const issueData = {
        number: 15,
        title: 'Fixed bug',
        state: 'CLOSED',
        author: { login: 'dev' },
        url: 'https://github.com/user/repo/issues/15',
        labels: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        closedAt: '2024-01-02T00:00:00Z',
      };
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(issueData),
        stderr: '',
      });

      const result = await service.getIssue('/repo', 15);

      expect(result!.state).toBe('closed');
      expect(result!.closedAt).toBe('2024-01-02T00:00:00Z');
    });
  });

  // ==================== execGh (tested through public methods) ====================

  describe('execGh (via hasGitHubRemote)', () => {
    it('should throw timeout error when process is killed', async () => {
      const timeoutError = new Error('killed') as Error & {
        killed: boolean;
        stdout?: string;
        stderr?: string;
      };
      timeoutError.killed = true;
      mockExecAsync.mockRejectedValueOnce(timeoutError);

      // hasGitHubRemote catches errors and returns false
      const result = await service.hasGitHubRemote('/repo');
      expect(result).toBe(false);
    });

    it('should return stdout/stderr on non-zero exit code when they are present', async () => {
      const error = new Error('exit code 1') as Error & {
        killed: boolean;
        stdout?: string;
        stderr?: string;
      };
      error.killed = false;
      error.stdout = JSON.stringify({ url: 'https://github.com/user/repo' });
      error.stderr = 'some warning';
      mockExecAsync.mockRejectedValueOnce(error);

      const result = await service.hasGitHubRemote('/repo');

      // execGh returns {stdout, stderr} even on non-zero exit, so hasGitHubRemote parses it
      expect(result).toBe(true);
    });
  });
});
