import { Test, TestingModule } from '@nestjs/testing';
import { GithubService } from './github.service';

// The promisified execFile mock function.
let mockExecFileAsync: jest.Mock;

jest.mock('util', () => {
  const fn = jest.fn();
  (global as Record<string, unknown>).__mockGhExecFile = fn;
  return {
    promisify: () => fn,
  };
});

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

const mockExistsSync = require('fs').existsSync as jest.Mock;

describe('GithubService', () => {
  let service: GithubService;

  beforeEach(async () => {
    mockExecFileAsync = (global as Record<string, unknown>).__mockGhExecFile as jest.Mock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GithubService],
    }).compile();

    service = module.get<GithubService>(GithubService);
    mockExecFileAsync.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);

    // Clear the internal cache between tests
    service.clearCache();
  });

  // ==================== getStatus ====================

  describe('getStatus', () => {
    it('should return not-installed status when gh CLI is not found', async () => {
      // findCli: which/where gh fails
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'));
      // existsSync returns false for all common paths
      mockExistsSync.mockReturnValue(false);

      const status = await service.getStatus();

      expect(status.installed).toBe(false);
      expect(status.auth.authenticated).toBe(false);
    });

    it('should return installed status with version and auth when gh CLI is found', async () => {
      // findCli: which gh succeeds
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'gh version 2.40.1 (2024-01-15)\n',
        stderr: '',
      });
      // checkAuth
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user1',
        stderr: '',
      });

      const status1 = await service.getStatus();
      const status2 = await service.getStatus();

      // Should only call execFileAsync for the first request (3 times: findCli, getVersion, checkAuth)
      expect(mockExecFileAsync).toHaveBeenCalledTimes(3);
      expect(status1).toBe(status2);
    });

    it('should handle unauthenticated gh CLI', async () => {
      // findCli
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth - not logged in
      mockExecFileAsync.mockRejectedValueOnce(
        new Error('You are not logged into any GitHub hosts')
      );

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.auth.authenticated).toBe(false);
    });

    it('should handle auth check timeout gracefully', async () => {
      // findCli
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth - timeout
      const timeoutError = new Error('timed out') as Error & { killed?: boolean; signal?: string };
      timeoutError.killed = true;
      mockExecFileAsync.mockRejectedValueOnce(timeoutError);

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.auth.authenticated).toBe(false);
    });
  });

  // ==================== clearCache ====================

  describe('clearCache', () => {
    it('should force a fresh fetch on next getStatus call', async () => {
      // First call
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user1',
        stderr: '',
      });

      await service.getStatus();

      service.clearCache();

      // Second call after cache clear
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/gh\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.41.0\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user2',
        stderr: '',
      });

      const status = await service.getStatus();

      expect(mockExecFileAsync).toHaveBeenCalledTimes(6); // 3 + 3
      expect(status.version).toBe('2.41.0');
    });
  });

  // ==================== hasGitHubRemote ====================

  describe('hasGitHubRemote', () => {
    it('should return true when repo has a GitHub remote', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ url: 'https://github.com/user/repo' }),
        stderr: '',
      });

      const result = await service.hasGitHubRemote('/repo');

      expect(result).toBe(true);
    });

    it('should return false when gh command fails', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('not a github repo'));

      const result = await service.hasGitHubRemote('/repo');

      expect(result).toBe(false);
    });

    it('should return false when url is empty', async () => {
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockRejectedValueOnce(new Error('not a repo'));

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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '  \n', stderr: '' });

      const result = await service.listPullRequests('/repo');

      expect(result).toEqual([]);
    });

    it('should pass state and limit options as args', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listPullRequests('/repo', { state: 'closed', limit: 10 });

      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).toContain('--state');
      expect(args).toContain('closed');
      expect(args).toContain('--limit');
      expect(args).toContain('10');
    });

    it('should not pass state flag for "all"', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listPullRequests('/repo', { state: 'all' });

      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).not.toContain('--state');
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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prResponse),
        stderr: '',
      });

      const result = await service.createPullRequest('/repo', { title: 'New Feature' });

      expect(result.number).toBe(42);
      expect(result.title).toBe('New Feature');
      expect(result.state).toBe('open');
      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).toContain('--title');
      expect(args).toContain('New Feature');
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
      mockExecFileAsync.mockResolvedValueOnce({
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

      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).toContain('--body');
      expect(args).toContain('Some body');
      expect(args).toContain('--base');
      expect(args).toContain('develop');
      expect(args).toContain('--head');
      expect(args).toContain('feature');
      expect(args).toContain('--draft');
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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.listIssues('/repo');

      expect(result).toEqual([]);
    });

    it('should pass state, limit, and labels options as args', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listIssues('/repo', {
        state: 'closed',
        limit: 20,
        labels: ['bug', 'high-priority'],
      });

      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).toContain('--state');
      expect(args).toContain('closed');
      expect(args).toContain('--limit');
      expect(args).toContain('20');
      expect(args).toContain('--label');
      expect(args).toContain('bug,high-priority');
    });

    it('should not pass state flag for "all"', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      await service.listIssues('/repo', { state: 'all' });

      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).not.toContain('--state');
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
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(prData),
        stderr: '',
      });

      const result = await service.getPullRequest('/repo', 5);

      expect(result).not.toBeNull();
      expect(result!.number).toBe(5);
      expect(result!.state).toBe('open');
      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).toContain('pr');
      expect(args).toContain('view');
      expect(args).toContain('5');
    });

    it('should return null when PR is not found', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('PR not found'));

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
      mockExecFileAsync.mockResolvedValueOnce({
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
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(issueData),
        stderr: '',
      });

      const result = await service.getIssue('/repo', 15);

      expect(result).not.toBeNull();
      expect(result!.number).toBe(15);
      expect(result!.title).toBe('Feature request');
      expect(result!.labels).toEqual([{ name: 'enhancement', color: '84b6eb' }]);
      const args = mockExecFileAsync.mock.calls[0][1] as string[];
      expect(args).toContain('issue');
      expect(args).toContain('view');
      expect(args).toContain('15');
    });

    it('should return null when issue is not found', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('issue not found'));

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
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(issueData),
        stderr: '',
      });

      const result = await service.getIssue('/repo', 15);

      expect(result!.state).toBe('closed');
      expect(result!.closedAt).toBe('2024-01-02T00:00:00Z');
    });
  });

  // ==================== cross-platform CLI detection ====================

  describe('cross-platform CLI detection', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should use "where" on Windows for findCli', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'C:\\path\\gh.exe\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user',
        stderr: '',
      });

      const status = await service.getStatus();

      const findCliCall = mockExecFileAsync.mock.calls[0];
      expect(findCliCall[0]).toBe('where');
      expect(findCliCall[1]).toEqual(['gh']);
      expect(status.installed).toBe(true);
      expect(status.platform).toBe('win32');
    });

    it('should use "which" on Linux for findCli', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/bin/gh\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user',
        stderr: '',
      });

      const status = await service.getStatus();

      const findCliCall = mockExecFileAsync.mock.calls[0];
      expect(findCliCall[0]).toBe('/usr/bin/which');
      expect(findCliCall[1]).toEqual(['gh']);
      expect(status.installed).toBe(true);
      expect(status.platform).toBe('linux');
    });

    it('should check Windows-specific paths when not found in PATH on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      // findCli: PATH lookup fails
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'));
      // Check local paths - one exists
      mockExistsSync.mockImplementation((p: string) => p.includes('GitHub CLI'));
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user',
        stderr: '',
      });

      const status = await service.getStatus();

      // Should have checked at least one Windows-specific path
      const checkedPaths = mockExistsSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(
        checkedPaths.some((p: string) => p.includes('GitHub CLI') || p.includes('scoop'))
      ).toBe(true);
      expect(status.installed).toBe(true);
    });

    it('should check Unix-specific paths when not found in PATH on Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      // findCli: PATH lookup fails
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'));
      // Check local paths - one exists
      mockExistsSync.mockImplementation((p: string) => p === '/usr/local/bin/gh');
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user',
        stderr: '',
      });

      const status = await service.getStatus();

      const checkedPaths = mockExistsSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(
        checkedPaths.some((p: string) => p === '/usr/local/bin/gh' || p === '/usr/bin/gh')
      ).toBe(true);
      expect(status.installed).toBe(true);
    });

    it('should check macOS-specific paths (homebrew) on darwin', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      // findCli: PATH lookup fails
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'));
      // Check local paths - homebrew path exists
      mockExistsSync.mockImplementation((p: string) => p === '/opt/homebrew/bin/gh');
      // getVersion
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'gh version 2.40.1\n', stderr: '' });
      // checkAuth
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'Logged in to github.com account user',
        stderr: '',
      });

      const status = await service.getStatus();

      const checkedPaths = mockExistsSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(checkedPaths.some((p: string) => p === '/opt/homebrew/bin/gh')).toBe(true);
      expect(status.installed).toBe(true);
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
      mockExecFileAsync.mockRejectedValueOnce(timeoutError);

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
      mockExecFileAsync.mockRejectedValueOnce(error);

      const result = await service.hasGitHubRemote('/repo');

      // execGh returns {stdout, stderr} even on non-zero exit, so hasGitHubRemote parses it
      expect(result).toBe(true);
    });
  });
});
