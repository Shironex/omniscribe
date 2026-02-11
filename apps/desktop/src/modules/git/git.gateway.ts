import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import * as path from 'path';
import { Server, Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { GitHubCliGuard, RequiresGhCli, SkipGhCliCheck } from '../../common/guards';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';
import {
  GitBranchesPayload,
  GitCommitsPayload,
  GitCheckoutPayload,
  GitCreateBranchPayload,
  GitCurrentBranchPayload,
  GitWorktreesPayload,
  GitWorktreeCleanupPayload,
  GitBranchesResponse,
  GitCommitsResponse,
  GitCheckoutResponse,
  GitCreateBranchResponse,
  GitCurrentBranchResponse,
  GitWorktreesResponse,
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
  GitEvents,
  GithubEvents,
  MAX_PATH_LENGTH,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

@UseGuards(WsThrottlerGuard, GitHubCliGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class GitGateway implements OnGatewayInit {
  private readonly logger = createLogger('GitGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gitService: GitService,
    private readonly worktreeService: WorktreeService,
    private readonly githubService: GithubService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Validate that a path is a non-empty absolute string within length limits.
   * Returns an error message string if invalid, or null if valid.
   */
  private validatePath(value: unknown, label = 'projectPath'): string | null {
    if (!value || typeof value !== 'string') {
      return `Invalid ${label}: must be a non-empty string`;
    }
    if (value.length > MAX_PATH_LENGTH) {
      return `${label} exceeds maximum length of ${MAX_PATH_LENGTH} characters`;
    }
    if (!path.isAbsolute(value)) {
      return `Invalid ${label}: must be an absolute path`;
    }
    return null;
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.BRANCHES)
  async handleBranches(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitBranchesPayload
  ): Promise<GitBranchesResponse> {
    try {
      const { projectPath } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          branches: [],
          currentBranch: '',
          error: pathError,
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
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error fetching branches: ${message}`);

      return {
        branches: [],
        currentBranch: '',
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.COMMITS)
  async handleCommits(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCommitsPayload
  ): Promise<GitCommitsResponse> {
    try {
      const { projectPath, limit = 50, allBranches = true } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          commits: [],
          error: pathError,
        };
      }

      const commits = await this.gitService.getCommitLog(projectPath, limit, allBranches);

      // Emit to all clients watching this project
      client.join(`git:${projectPath}`);

      return {
        commits,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error fetching commits: ${message}`);

      return {
        commits: [],
        error: message,
      };
    }
  }

  @SubscribeMessage(GitEvents.CHECKOUT)
  async handleCheckout(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCheckoutPayload
  ): Promise<GitCheckoutResponse> {
    try {
      const { projectPath, branch } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return { success: false, error: pathError };
      }

      if (!branch) {
        return {
          success: false,
          error: 'Branch is required',
        };
      }

      await this.gitService.checkout(projectPath, branch);
      const currentBranch = await this.gitService.getCurrentBranch(projectPath);

      // Notify all clients watching this project
      this.server.to(`git:${projectPath}`).emit(GitEvents.BRANCHES, {
        projectPath,
        currentBranch,
      });

      return {
        success: true,
        currentBranch,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error checking out branch: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SubscribeMessage(GitEvents.CREATE_BRANCH)
  async handleCreateBranch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCreateBranchPayload
  ): Promise<GitCreateBranchResponse> {
    try {
      const { projectPath, name, startPoint } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return { success: false, error: pathError };
      }

      if (!name) {
        return {
          success: false,
          error: 'Branch name is required',
        };
      }

      await this.gitService.createBranch(projectPath, name, startPoint);

      // Get the newly created branch info
      const branches = await this.gitService.getBranches(projectPath);
      const newBranch = branches.find(b => b.name === name);

      // Notify all clients watching this project
      this.server.to(`git:${projectPath}`).emit(GitEvents.BRANCHES, {
        projectPath,
        branches,
        currentBranch: name,
      });

      return {
        success: true,
        branch: newBranch,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error creating branch: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.CURRENT_BRANCH)
  async handleCurrentBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCurrentBranchPayload
  ): Promise<GitCurrentBranchResponse> {
    try {
      const { projectPath } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          currentBranch: '',
          error: pathError,
        };
      }

      const currentBranch = await this.gitService.getCurrentBranch(projectPath);

      // Join the project room for updates
      client.join(`git:${projectPath}`);

      return {
        currentBranch,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error getting current branch: ${message}`);

      return {
        currentBranch: '',
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.WORKTREES)
  async handleWorktrees(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreesPayload
  ): Promise<GitWorktreesResponse> {
    try {
      const { projectPath } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          worktrees: [],
          error: pathError,
        };
      }

      const worktrees = await this.worktreeService.list(projectPath);

      return {
        worktrees,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error listing worktrees: ${message}`);

      return {
        worktrees: [],
        error: message,
      };
    }
  }

  @SubscribeMessage(GitEvents.WORKTREE_CLEANUP)
  async handleWorktreeCleanup(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreeCleanupPayload
  ): Promise<SuccessResponse> {
    try {
      const { projectPath, worktreePath } = payload;
      const projectPathError = this.validatePath(projectPath);

      if (projectPathError) {
        return { success: false, error: projectPathError };
      }

      const worktreePathError = this.validatePath(worktreePath, 'worktreePath');

      if (worktreePathError) {
        return { success: false, error: worktreePathError };
      }

      await this.worktreeService.cleanup(projectPath, worktreePath);

      return {
        success: true,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
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
  @SkipGhCliCheck()
  @SubscribeMessage(GithubEvents.STATUS)
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
      const message = extractErrorMessage(error, 'Unknown error');
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
  @RequiresGhCli()
  @SubscribeMessage(GithubEvents.REPO_INFO)
  async handleGithubRepoInfo(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubProjectPayload
  ): Promise<GithubRepoInfoResponse> {
    try {
      const { projectPath } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          repo: null,
          error: pathError,
        };
      }

      const repo = await this.githubService.getRepoInfo(projectPath);

      return {
        repo,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error getting repo info: ${message}`);

      return {
        repo: null,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @RequiresGhCli()
  @SubscribeMessage(GithubEvents.PRS)
  async handleGithubPRs(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListPRsPayload
  ): Promise<GithubPRsResponse> {
    try {
      const { projectPath, state, limit } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          pullRequests: [],
          error: pathError,
        };
      }

      const pullRequests = await this.githubService.listPullRequests(projectPath, { state, limit });

      return {
        pullRequests,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error listing pull requests: ${message}`);

      return {
        pullRequests: [],
        error: message,
      };
    }
  }

  @SkipThrottle()
  @RequiresGhCli()
  @SubscribeMessage(GithubEvents.PR)
  async handleGithubPR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetPRPayload
  ): Promise<GithubPRResponse> {
    try {
      const { projectPath, prNumber } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return { pullRequest: null, error: pathError };
      }

      if (!prNumber) {
        return {
          pullRequest: null,
          error: 'PR number is required',
        };
      }

      const pullRequest = await this.githubService.getPullRequest(projectPath, prNumber);

      return {
        pullRequest,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error getting pull request: ${message}`);

      return {
        pullRequest: null,
        error: message,
      };
    }
  }

  @RequiresGhCli()
  @SubscribeMessage(GithubEvents.CREATE_PR)
  async handleGithubCreatePR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubCreatePRPayload
  ): Promise<GithubCreatePRResponse> {
    try {
      const { projectPath, title, body, base, head, draft } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return { success: false, error: pathError };
      }

      if (!title) {
        return {
          success: false,
          error: 'Title is required',
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
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error creating pull request: ${message}`);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @RequiresGhCli()
  @SubscribeMessage(GithubEvents.ISSUES)
  async handleGithubIssues(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListIssuesPayload
  ): Promise<GithubIssuesResponse> {
    try {
      const { projectPath, state, limit, labels } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return {
          issues: [],
          error: pathError,
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
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error listing issues: ${message}`);

      return {
        issues: [],
        error: message,
      };
    }
  }

  @SkipThrottle()
  @RequiresGhCli()
  @SubscribeMessage(GithubEvents.ISSUE)
  async handleGithubIssue(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetIssuePayload
  ): Promise<GithubIssueResponse> {
    try {
      const { projectPath, issueNumber } = payload;
      const pathError = this.validatePath(projectPath);

      if (pathError) {
        return { issue: null, error: pathError };
      }

      if (!issueNumber) {
        return {
          issue: null,
          error: 'Issue number is required',
        };
      }

      const issue = await this.githubService.getIssue(projectPath, issueNumber);

      return {
        issue,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error(`Error getting issue: ${message}`);

      return {
        issue: null,
        error: message,
      };
    }
  }
}
