import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
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
} from '@omniscribe/shared';

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

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class GitGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gitService: GitService,
    private readonly worktreeService: WorktreeService,
  ) {}

  @SubscribeMessage('git:branches')
  async handleBranches(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitBranchesPayload,
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
      console.error('[GitGateway] Error fetching branches:', message);

      return {
        branches: [],
        currentBranch: '',
        error: message,
      };
    }
  }

  @SubscribeMessage('git:commits')
  async handleCommits(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCommitsPayload,
  ): Promise<GitCommitsResponse> {
    try {
      const { projectPath, limit = 50, allBranches = true } = payload;

      if (!projectPath) {
        return {
          commits: [],
          error: 'Project path is required',
        };
      }

      const commits = await this.gitService.getCommitLog(
        projectPath,
        limit,
        allBranches,
      );

      // Emit to all clients watching this project
      client.join(`git:${projectPath}`);

      return {
        commits,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[GitGateway] Error fetching commits:', message);

      return {
        commits: [],
        error: message,
      };
    }
  }

  @SubscribeMessage('git:checkout')
  async handleCheckout(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCheckoutPayload,
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
      console.error('[GitGateway] Error checking out branch:', message);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SubscribeMessage('git:create-branch')
  async handleCreateBranch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitCreateBranchPayload,
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
      const newBranch = branches.find((b) => b.name === name);

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
      console.error('[GitGateway] Error creating branch:', message);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SubscribeMessage('git:current-branch')
  async handleCurrentBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GitCurrentBranchPayload,
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
      console.error('[GitGateway] Error getting current branch:', message);

      return {
        currentBranch: '',
        error: message,
      };
    }
  }

  @SubscribeMessage('git:worktrees')
  async handleWorktrees(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreesPayload,
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
      console.error('[GitGateway] Error listing worktrees:', message);

      return {
        worktrees: [],
        error: message,
      };
    }
  }

  @SubscribeMessage('git:worktree:cleanup')
  async handleWorktreeCleanup(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GitWorktreeCleanupPayload,
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
      console.error('[GitGateway] Error cleaning up worktree:', message);

      return {
        success: false,
        error: message,
      };
    }
  }
}
