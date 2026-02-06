import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';
import {
  GitBranchesPayload,
  GitCommitsPayload,
  GitCheckoutPayload,
  GitCreateBranchPayload,
  GitCurrentBranchPayload,
  GitBranchesResponse,
  GitCommitsResponse,
  GitCheckoutResponse,
  GitCreateBranchResponse,
  GitCurrentBranchResponse,
  WorktreeInfo,
  SuccessResponse,
  GithubStatusPayload,
  GithubStatusResponse,
  GithubProjectPayload,
  GithubRepoInfoResponse,
  GithubListPRsPayload,
  GithubPRsResponse,
  GithubCreatePRPayload,
  GithubCreatePRResponse,
  GithubGetPRPayload,
  GithubPRResponse,
  GithubListIssuesPayload,
  GithubIssuesResponse,
  GithubGetIssuePayload,
  GithubIssueResponse,
  createLogger,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

/**
 * Payload for listing worktrees
 */
interface GitWorktreesPayload {
  projectPath: string;
}

/**
 * Payload for cleaning up a worktree
 */
interface GitWorktreeCleanupPayload {
  projectPath: string;
  worktreePath: string;
}

/**
 * Response for worktrees list
 */
interface GitWorktreesResponse {
  worktrees: WorktreeInfo[];
  error?: string;
}

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
  namespace: '/',
})
export class GitGateway {
  private readonly logger = createLogger('GitGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gitService: GitService,
    private readonly worktreeService: WorktreeService,
    private readonly githubService: GithubService
  ) {}

  @SkipThrottle()
  @SubscribeMessage('git:branches')
  async handleBranches(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitBranchesPayload
  ): Promise<GitBranchesResponse> {
    try {
      const { projectPath } = payload;

      if (!projectPath) {
        return {
          branches: [],
          currentBranch: '',
          error: 'Project path is required',
        };
      }

      const [branches, currentBranch] = await Promise.all([
        this.gitService.getBranches(projectPath),
        this.gitService.getCurrentBranch(projectPath),
      ]);

      // Emit to all clients watching this project
      client.join(`git:${projectPath}`);

      return {
        branches,
        currentBranch,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching branches: ${message}`);

      return {
        branches: [],
        currentBranch: '',
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('git:commits')
  async handleCommits(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCommitsPayload
  ): Promise<GitCommitsResponse> {
    try {
      const { projectPath, limit = 50, allBranches = true } = payload;

      if (!projectPath) {
        return {
          commits: [],
          error: 'Project path is required',
        };
      }

      const commits = await this.gitService.getCommitLog(projectPath, limit, allBranches);

      // Emit to all clients watching this project
      client.join(`git:${projectPath}`);

      return {
        commits,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching commits: ${message}`);

      return {
        commits: [],
        error: message,
      };
    }
  }

  @SubscribeMessage('git:checkout')
  async handleCheckout(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCheckoutPayload
  ): Promise<GitCheckoutResponse> {
    try {
      const { projectPath, branch } = payload;

      if (!projectPath || !branch) {
        return {
          success: false,
          error: 'Project path and branch are required',
        };
      }

      await this.gitService.checkout(projectPath, branch);
      const currentBranch = await this.gitService.getCurrentBranch(projectPath);

      // Notify all clients watching this project
      this.server.to(`git:${projectPath}`).emit('git:branches', {
        projectPath,
        currentBranch,
      });

      return {
        success: true,
        currentBranch,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking out branch: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SubscribeMessage('git:create-branch')
  async handleCreateBranch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCreateBranchPayload
  ): Promise<GitCreateBranchResponse> {
    try {
      const { projectPath, name, startPoint } = payload;

      if (!projectPath || !name) {
        return {
          success: false,
          error: 'Project path and branch name are required',
        };
      }

      await this.gitService.createBranch(projectPath, name, startPoint);

      // Get the newly created branch info
      const branches = await this.gitService.getBranches(projectPath);
      const newBranch = branches.find(b => b.name === name);

      // Notify all clients watching this project
      this.server.to(`git:${projectPath}`).emit('git:branches', {
        projectPath,
        branches,
        currentBranch: name,
      });

      return {
        success: true,
        branch: newBranch,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating branch: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('git:current-branch')
  async handleCurrentBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCurrentBranchPayload
  ): Promise<GitCurrentBranchResponse> {
    try {
      const { projectPath } = payload;

      if (!projectPath) {
        return {
          currentBranch: '',
          error: 'Project path is required',
        };
      }

      const currentBranch = await this.gitService.getCurrentBranch(projectPath);

      // Join the project room for updates
      client.join(`git:${projectPath}`);

      return {
        currentBranch,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting current branch: ${message}`);

      return {
        currentBranch: '',
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('git:worktrees')
  async handleWorktrees(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreesPayload
  ): Promise<GitWorktreesResponse> {
    try {
      const { projectPath } = payload;

      if (!projectPath) {
        return {
          worktrees: [],
          error: 'Project path is required',
        };
      }

      const worktrees = await this.worktreeService.list(projectPath);

      return {
        worktrees,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error listing worktrees: ${message}`);

      return {
        worktrees: [],
        error: message,
      };
    }
  }

  @SubscribeMessage('git:worktree:cleanup')
  async handleWorktreeCleanup(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreeCleanupPayload
  ): Promise<SuccessResponse> {
    try {
      const { projectPath, worktreePath } = payload;

      if (!projectPath || !worktreePath) {
        return {
          success: false,
          error: 'Project path and worktree path are required',
        };
      }

      await this.worktreeService.cleanup(projectPath, worktreePath);

      return {
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error cleaning up worktree: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  // ============================================
  // GitHub CLI Handlers
  // ============================================

  @SkipThrottle()
  @SubscribeMessage('github:status')
  async handleGithubStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubStatusPayload
  ): Promise<GithubStatusResponse> {
    try {
      if (payload?.refresh) {
        this.githubService.clearCache();
      }

      const status = await this.githubService.getStatus();

      return {
        status,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting GitHub CLI status: ${message}`);

      return {
        status: {
          installed: false,
          platform: process.platform,
          arch: process.arch,
          auth: { authenticated: false },
        },
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('github:repo-info')
  async handleGithubRepoInfo(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubProjectPayload
  ): Promise<GithubRepoInfoResponse> {
    try {
      const { projectPath } = payload;

      if (!projectPath) {
        return {
          repo: null,
          error: 'Project path is required',
        };
      }

      const repo = await this.githubService.getRepoInfo(projectPath);

      return {
        repo,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting repo info: ${message}`);

      return {
        repo: null,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('github:prs')
  async handleGithubPRs(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListPRsPayload
  ): Promise<GithubPRsResponse> {
    try {
      const { projectPath, state, limit } = payload;

      if (!projectPath) {
        return {
          pullRequests: [],
          error: 'Project path is required',
        };
      }

      const pullRequests = await this.githubService.listPullRequests(projectPath, { state, limit });

      return {
        pullRequests,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error listing pull requests: ${message}`);

      return {
        pullRequests: [],
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('github:pr')
  async handleGithubPR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetPRPayload
  ): Promise<GithubPRResponse> {
    try {
      const { projectPath, prNumber } = payload;

      if (!projectPath || !prNumber) {
        return {
          pullRequest: null,
          error: 'Project path and PR number are required',
        };
      }

      const pullRequest = await this.githubService.getPullRequest(projectPath, prNumber);

      return {
        pullRequest,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting pull request: ${message}`);

      return {
        pullRequest: null,
        error: message,
      };
    }
  }

  @SubscribeMessage('github:create-pr')
  async handleGithubCreatePR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubCreatePRPayload
  ): Promise<GithubCreatePRResponse> {
    try {
      const { projectPath, title, body, base, head, draft } = payload;

      if (!projectPath || !title) {
        return {
          success: false,
          error: 'Project path and title are required',
        };
      }

      const pullRequest = await this.githubService.createPullRequest(projectPath, {
        title,
        body,
        base,
        head,
        draft,
      });

      return {
        success: true,
        pullRequest,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating pull request: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('github:issues')
  async handleGithubIssues(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListIssuesPayload
  ): Promise<GithubIssuesResponse> {
    try {
      const { projectPath, state, limit, labels } = payload;

      if (!projectPath) {
        return {
          issues: [],
          error: 'Project path is required',
        };
      }

      const issues = await this.githubService.listIssues(projectPath, {
        state,
        limit,
        labels,
      });

      return {
        issues,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error listing issues: ${message}`);

      return {
        issues: [],
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage('github:issue')
  async handleGithubIssue(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetIssuePayload
  ): Promise<GithubIssueResponse> {
    try {
      const { projectPath, issueNumber } = payload;

      if (!projectPath || !issueNumber) {
        return {
          issue: null,
          error: 'Project path and issue number are required',
        };
      }

      const issue = await this.githubService.getIssue(projectPath, issueNumber);

      return {
        issue,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting issue: ${message}`);

      return {
        issue: null,
        error: message,
      };
    }
  }
}
