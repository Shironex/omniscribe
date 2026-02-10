/**
 * Git Gateway Integration Tests
 *
 * Tests git branch, commit, checkout, and worktree operations
 * with a real NestJS application and real socket.io connections.
 * GitService, WorktreeService, and GithubService are mocked at the service boundary.
 */
import { Module, INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import { createTestApp, getAppPort } from '../../../test/integration/helpers/create-test-app';
import {
  createSocketClient,
  connectClient,
  emitWithAck,
} from '../../../test/integration/helpers/socket-client';
import { GitGateway } from './git.gateway';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';

describe('GitGateway (integration)', () => {
  let app: INestApplication;
  let client: Socket;
  let mockGitService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockGitService = {
      getBranches: jest.fn().mockResolvedValue([
        { name: 'main', isCurrent: true, isRemote: false },
        { name: 'feature/test', isCurrent: false, isRemote: false },
      ]),
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getCommitLog: jest
        .fn()
        .mockResolvedValue([
          { hash: 'abc123', message: 'Initial commit', author: 'test', date: '2024-01-01' },
        ]),
      checkout: jest.fn().mockResolvedValue(undefined),
      createBranch: jest.fn().mockResolvedValue(undefined),
    };

    const mockWorktreeService = {
      list: jest.fn().mockResolvedValue([]),
      prepare: jest.fn().mockResolvedValue('/tmp/worktree'),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const mockGithubService = {
      getStatus: jest.fn().mockResolvedValue({
        installed: true,
        platform: 'darwin',
        arch: 'arm64',
        auth: { authenticated: true },
      }),
      getRepoInfo: jest.fn().mockResolvedValue(null),
      listPullRequests: jest.fn().mockResolvedValue([]),
      getPullRequest: jest.fn().mockResolvedValue(null),
      createPullRequest: jest.fn().mockResolvedValue(null),
      listIssues: jest.fn().mockResolvedValue([]),
      getIssue: jest.fn().mockResolvedValue(null),
      clearCache: jest.fn(),
    };

    @Module({
      providers: [
        GitGateway,
        { provide: GitService, useValue: mockGitService },
        { provide: WorktreeService, useValue: mockWorktreeService },
        { provide: GithubService, useValue: mockGithubService },
      ],
    })
    class TestGitModule {}

    app = await createTestApp({
      modules: [TestGitModule],
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    client = createSocketClient(getAppPort(app));
    await connectClient(client);
  });

  afterEach(() => {
    client?.disconnect();
  });

  it('should handle git:branches and return branch list', async () => {
    const response = await emitWithAck<{ branches: any[]; currentBranch: string }>(
      client,
      'git:branches',
      { projectPath: '/tmp/test-project' }
    );

    expect(response.branches).toHaveLength(2);
    expect(response.currentBranch).toBe('main');
    expect(mockGitService.getBranches).toHaveBeenCalledWith('/tmp/test-project');
  });

  it('should handle git:commits and return commit log', async () => {
    const response = await emitWithAck<{ commits: any[] }>(client, 'git:commits', {
      projectPath: '/tmp/test-project',
      limit: 10,
    });

    expect(response.commits).toHaveLength(1);
    expect(response.commits[0].hash).toBe('abc123');
    expect(mockGitService.getCommitLog).toHaveBeenCalledWith('/tmp/test-project', 10, true);
  });

  it('should handle git:checkout and return success', async () => {
    const response = await emitWithAck<{ success: boolean; currentBranch?: string }>(
      client,
      'git:checkout',
      { projectPath: '/tmp/test-project', branch: 'feature/test' }
    );

    expect(response.success).toBe(true);
    expect(response.currentBranch).toBe('main');
    expect(mockGitService.checkout).toHaveBeenCalledWith('/tmp/test-project', 'feature/test');
  });

  it('should handle git:current-branch and return current branch', async () => {
    const response = await emitWithAck<{ currentBranch: string }>(client, 'git:current-branch', {
      projectPath: '/tmp/test-project',
    });

    expect(response.currentBranch).toBe('main');
  });

  it('should return error for missing projectPath', async () => {
    const response = await emitWithAck<{
      branches: any[];
      currentBranch: string;
      error?: string;
    }>(client, 'git:branches', { projectPath: '' });

    expect(response.error).toBe('Invalid projectPath: must be a non-empty string');
    expect(response.branches).toEqual([]);
  });
});
