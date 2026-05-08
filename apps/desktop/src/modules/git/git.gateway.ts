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
import { Server, Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { validatePath } from '../shared/validation';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import {
  GitBranchesPayload,
  GitCommitsPayload,
  GitCheckoutPayload,
  GitCreateBranchPayload,
  GitCurrentBranchPayload,
  GitWorktreesPayload,
  GitWorktreeCleanupPayload,
  GitDiffPayload,
  GitRemotesPayload,
  GitRemotesResponse,
  GitBranchesResponse,
  GitCommitsResponse,
  GitCheckoutResponse,
  GitCreateBranchResponse,
  GitCurrentBranchResponse,
  GitWorktreesResponse,
  GitDiffResponse,
  SuccessResponse,
  GitEvents,
  createLogger,
  parseGitHubRepoUrl,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class GitGateway implements OnGatewayInit {
  private readonly logger = createLogger('GitGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gitService: GitService,
    private readonly worktreeService: WorktreeService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.BRANCHES)
  async handleBranches(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitBranchesPayload
  ): Promise<GitBranchesResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:branches]',
      payload,
      defaultResult: { branches: [], currentBranch: '' },
      handler: async projectPath => {
        const [branches, currentBranch] = await Promise.all([
          this.gitService.getBranches(projectPath),
          this.gitService.getCurrentBranch(projectPath),
        ]);

        // Emit to all clients watching this project
        client.join(`git:${projectPath}`);

        return { branches, currentBranch };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.COMMITS)
  async handleCommits(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCommitsPayload
  ): Promise<GitCommitsResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:commits]',
      payload,
      defaultResult: { commits: [] },
      handler: async projectPath => {
        const { limit = 50, allBranches = true } = payload;
        const commits = await this.gitService.getCommitLog(projectPath, limit, allBranches);

        // Emit to all clients watching this project
        client.join(`git:${projectPath}`);

        return { commits };
      },
    });
  }

  @SubscribeMessage(GitEvents.CHECKOUT)
  async handleCheckout(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCheckoutPayload
  ): Promise<GitCheckoutResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:checkout]',
      payload,
      defaultResult: { success: false },
      handler: async projectPath => {
        const { branch } = payload;

        if (!branch) {
          return { success: false, error: 'Branch is required' };
        }

        await this.gitService.checkout(projectPath, branch);
        const currentBranch = await this.gitService.getCurrentBranch(projectPath);

        // Notify all clients watching this project
        this.server.to(`git:${projectPath}`).emit(GitEvents.BRANCHES, {
          projectPath,
          currentBranch,
        });

        return { success: true, currentBranch };
      },
    });
  }

  @SubscribeMessage(GitEvents.CREATE_BRANCH)
  async handleCreateBranch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCreateBranchPayload
  ): Promise<GitCreateBranchResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:create-branch]',
      payload,
      defaultResult: { success: false },
      handler: async projectPath => {
        const { name, startPoint } = payload;

        if (!name) {
          return { success: false, error: 'Branch name is required' };
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

        return { success: true, branch: newBranch };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.CURRENT_BRANCH)
  async handleCurrentBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCurrentBranchPayload
  ): Promise<GitCurrentBranchResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:current-branch]',
      payload,
      defaultResult: { currentBranch: '' },
      handler: async projectPath => {
        const currentBranch = await this.gitService.getCurrentBranch(projectPath);

        // Join the project room for updates
        client.join(`git:${projectPath}`);

        return { currentBranch };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.WORKTREES)
  async handleWorktrees(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreesPayload
  ): Promise<GitWorktreesResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:worktrees]',
      payload,
      defaultResult: { worktrees: [] },
      handler: async projectPath => {
        const worktrees = await this.worktreeService.list(projectPath);
        return { worktrees };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.DIFF)
  async handleDiff(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitDiffPayload
  ): Promise<GitDiffResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:diff]',
      payload,
      defaultResult: { files: [], totalAdditions: 0, totalDeletions: 0 },
      handler: async projectPath => {
        const { baseCommit, includeUntracked } = payload;

        // Validate baseCommit to prevent argument injection (e.g. --output=/path)
        if (baseCommit && (/^-/.test(baseCommit) || /[\n\r]/.test(baseCommit))) {
          return {
            files: [],
            totalAdditions: 0,
            totalDeletions: 0,
            error: 'Invalid base commit reference',
          };
        }

        const result = await this.gitService.getStructuredDiff(
          projectPath,
          baseCommit,
          includeUntracked
        );

        return {
          files: result.files,
          totalAdditions: result.totalAdditions,
          totalDeletions: result.totalDeletions,
        };
      },
    });
  }

  @SubscribeMessage(GitEvents.WORKTREE_CLEANUP)
  async handleWorktreeCleanup(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreeCleanupPayload
  ): Promise<SuccessResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:worktree:cleanup]',
      payload,
      defaultResult: { success: false },
      handler: async projectPath => {
        const { worktreePath } = payload;
        const worktreePathError = validatePath(worktreePath, 'worktreePath');

        if (worktreePathError) {
          return { success: false, error: worktreePathError };
        }

        await this.worktreeService.cleanup(projectPath, worktreePath);

        return { success: true };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GitEvents.REMOTES)
  async handleRemotes(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitRemotesPayload
  ): Promise<GitRemotesResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[git:remotes]',
      payload,
      defaultResult: { remotes: [] },
      handler: async projectPath => {
        const rawRemotes = await this.gitService.getRemoteUrls(projectPath);

        // Strip embedded credentials (user:token@host) before sending to renderer
        const remotes = rawRemotes.map(r => {
          let url = r.url;
          try {
            const parsed = new URL(url);
            if (parsed.username || parsed.password) {
              parsed.username = '';
              parsed.password = '';
              url = parsed.toString();
            }
          } catch {
            // Non-URL form (SSH shorthand) — no embedded credentials possible
          }
          // Validate the URL still parses as a recognizable GitHub URL
          const parsed = parseGitHubRepoUrl(url);
          return { name: r.name, fetchUrl: parsed ? parsed.httpsUrl : url };
        });

        return { remotes };
      },
    });
  }
}
