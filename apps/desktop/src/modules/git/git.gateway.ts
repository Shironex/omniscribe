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
  GitBranchesResponse,
  GitCommitsResponse,
  GitCheckoutResponse,
  GitCreateBranchResponse,
  GitCurrentBranchResponse,
  GitWorktreesResponse,
  SuccessResponse,
  GitEvents,
  createLogger,
  extractErrorMessage,
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
    this.logger.debug(`[git:branches] projectPath=${payload.projectPath}`);
    try {
      const { projectPath } = payload;
      const pathError = validatePath(projectPath);

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
      this.logger.error('Error fetching branches', error);

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
    this.logger.debug(`[git:commits] projectPath=${payload.projectPath}, limit=${payload.limit}`);
    try {
      const { projectPath, limit = 50, allBranches = true } = payload;
      const pathError = validatePath(projectPath);

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
      this.logger.error('Error fetching commits', error);

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
    this.logger.debug(
      `[git:checkout] projectPath=${payload.projectPath}, branch=${payload.branch}`
    );
    try {
      const { projectPath, branch } = payload;
      const pathError = validatePath(projectPath);

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
      this.logger.error('Error checking out branch', error);

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
    this.logger.debug(
      `[git:create-branch] projectPath=${payload.projectPath}, name=${payload.name}`
    );
    try {
      const { projectPath, name, startPoint } = payload;
      const pathError = validatePath(projectPath);

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
      this.logger.error('Error creating branch', error);

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
    this.logger.debug(`[git:current-branch] projectPath=${payload.projectPath}`);
    try {
      const { projectPath } = payload;
      const pathError = validatePath(projectPath);

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
      this.logger.error('Error getting current branch', error);

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
    this.logger.debug(`[git:worktrees] projectPath=${payload.projectPath}`);
    try {
      const { projectPath } = payload;
      const pathError = validatePath(projectPath);

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
      this.logger.error('Error listing worktrees', error);

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
    this.logger.debug(
      `[git:worktree:cleanup] projectPath=${payload.projectPath}, worktreePath=${payload.worktreePath}`
    );
    try {
      const { projectPath, worktreePath } = payload;
      const projectPathError = validatePath(projectPath);

      if (projectPathError) {
        return { success: false, error: projectPathError };
      }

      const worktreePathError = validatePath(worktreePath, 'worktreePath');

      if (worktreePathError) {
        return { success: false, error: worktreePathError };
      }

      await this.worktreeService.cleanup(projectPath, worktreePath);

      return {
        success: true,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error cleaning up worktree', error);

      return {
        success: false,
        error: message,
      };
    }
  }
}
