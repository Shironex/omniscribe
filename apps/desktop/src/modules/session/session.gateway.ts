import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, forwardRef, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { SessionService, ExtendedSessionConfig, SessionStatusUpdate } from './session.service';
import { TerminalGateway } from '../terminal/terminal.gateway';
import { WorktreeService } from '../git/worktree.service';
import { GitService } from '../git/git.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  AiMode,
  UpdateSessionOptions,
  SessionRemovePayload,
  SessionListPayload,
  SessionRemoveResponse,
  WorktreeSettings,
  DEFAULT_WORKTREE_SETTINGS,
  MAX_CONCURRENT_SESSIONS,
  createLogger,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

/**
 * Payload for creating a session
 */
interface CreateSessionPayload {
  mode: AiMode;
  projectPath: string;
  branch?: string;
  name?: string;
  workingDirectory?: string;
  model?: string;
  systemPrompt?: string;
  mcpServers?: string[];
}

/**
 * Payload for updating a session
 */
interface UpdateSessionPayload {
  sessionId: string;
  updates: UpdateSessionOptions;
}

/**
 * Response for session creation - either the session or an error.
 * When limit is hit, includes names of idle sessions the user could close.
 */
interface CreateSessionResponse {
  session?: ExtendedSessionConfig;
  error?: string;
  idleSessions?: string[];
}

/**
 * Response for session update - either the session or an error
 */
interface UpdateSessionResponse {
  session?: ExtendedSessionConfig;
  error?: string;
}

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class SessionGateway implements OnGatewayInit {
  private readonly logger = createLogger('SessionGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => TerminalGateway))
    private readonly terminalGateway: TerminalGateway,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Handle session creation request
   */
  @SkipThrottle()
  @SubscribeMessage('session:create')
  async handleCreate(
    @MessageBody() payload: CreateSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    // Check concurrency limit before creating session
    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      const idleNames = idleSessions.map(s => s.name);
      this.logger.warn(
        `[handleCreate] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleNames,
      };
    }

    const session = this.sessionService.create(payload.mode, payload.projectPath, {
      name: payload.name,
      workingDirectory: payload.workingDirectory,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      mcpServers: payload.mcpServers,
    });

    // Get worktree settings from workspace preferences
    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;

    // Determine the working directory based on worktree mode
    let worktreePath: string | null = null;

    try {
      if (worktreeSettings.mode !== 'never') {
        const branch = payload.branch;

        if (worktreeSettings.mode === 'always') {
          // Always create a new worktree with unique suffix for full isolation
          const uniqueSuffix = crypto.randomUUID().slice(0, 8);
          const branchName =
            branch ?? (await this.gitService.getCurrentBranch(payload.projectPath));
          const isolatedBranch = `${branchName}-${uniqueSuffix}`;
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            isolatedBranch,
            worktreeSettings.location
          );
          this.logger.log(`Created isolated worktree at ${worktreePath} for session ${session.id}`);
        } else if (worktreeSettings.mode === 'branch' && branch) {
          // Create worktree only when selecting a non-current branch
          const currentBranch = await this.gitService.getCurrentBranch(payload.projectPath);
          if (branch !== currentBranch) {
            worktreePath = await this.worktreeService.prepare(
              payload.projectPath,
              branch,
              worktreeSettings.location
            );
            this.logger.log(`Created branch worktree at ${worktreePath} for session ${session.id}`);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to create worktree for session ${session.id}: ${errorMessage}`);
      // Continue without worktree - fall back to main project directory
    }

    // Assign branch and worktree path to session
    if (payload.branch) {
      this.sessionService.assignBranch(session.id, payload.branch, worktreePath ?? undefined);
    } else if (worktreePath) {
      // If we have a worktree but no explicit branch, use the current branch
      const currentBranch = await this.gitService.getCurrentBranch(payload.projectPath);
      this.sessionService.assignBranch(session.id, currentBranch, worktreePath);
    }

    // Launch the terminal session to spawn the PTY
    const workingDir = worktreePath ?? session.workingDirectory;
    const launchResult = await this.sessionService.launchSession(
      session.id,
      payload.projectPath,
      workingDir,
      payload.mode
    );

    if (!launchResult.success) {
      return { error: launchResult.error ?? 'Failed to launch session' };
    }

    // Join the client to the terminal room so they receive terminal output
    // Also register the client as owner so they can send input
    if (launchResult.terminalSessionId !== undefined) {
      client.join(`terminal:${launchResult.terminalSessionId}`);
      // Register client ownership in TerminalGateway so terminal:input works
      this.terminalGateway.registerClientSession(client.id, launchResult.terminalSessionId);
      this.logger.log(
        `Client ${client.id} joined terminal room terminal:${launchResult.terminalSessionId}`
      );
    }

    // Return the updated session with terminalSessionId populated
    return { session: this.sessionService.get(session.id) ?? session };
  }

  /**
   * Handle session update request
   */
  @SkipThrottle()
  @SubscribeMessage('session:update')
  handleUpdate(
    @MessageBody() payload: UpdateSessionPayload,
    @ConnectedSocket() _client: Socket
  ): UpdateSessionResponse {
    const session = this.sessionService.get(payload.sessionId);

    if (!session) {
      return { error: `Session not found: ${payload.sessionId}` };
    }

    // Apply updates to session
    const updates = payload.updates;

    if (updates.name !== undefined) {
      session.name = updates.name;
    }
    if (updates.aiMode !== undefined) {
      session.aiMode = updates.aiMode;
    }
    if (updates.model !== undefined) {
      session.model = updates.model;
    }
    if (updates.systemPrompt !== undefined) {
      session.systemPrompt = updates.systemPrompt;
    }
    if (updates.maxTokens !== undefined) {
      session.maxTokens = updates.maxTokens;
    }
    if (updates.temperature !== undefined) {
      session.temperature = updates.temperature;
    }
    if (updates.mcpServers !== undefined) {
      session.mcpServers = updates.mcpServers;
    }

    session.lastActiveAt = new Date();

    // Emit status update for the change
    this.server.emit('session:status', {
      sessionId: session.id,
      status: session.status,
      message: 'Session updated',
    });

    return { session };
  }

  /**
   * Handle session removal request
   */
  @SkipThrottle()
  @SubscribeMessage('session:remove')
  async handleRemove(
    @MessageBody() payload: SessionRemovePayload,
    @ConnectedSocket() _client: Socket
  ): Promise<SessionRemoveResponse> {
    const success = await this.sessionService.remove(payload.sessionId);

    if (!success) {
      return { success: false, error: `Session not found: ${payload.sessionId}` };
    }

    return { success: true };
  }

  /**
   * Handle session list request
   */
  @SkipThrottle()
  @SubscribeMessage('session:list')
  handleList(
    @MessageBody() payload: SessionListPayload,
    @ConnectedSocket() _client: Socket
  ): ExtendedSessionConfig[] {
    if (payload.projectPath) {
      return this.sessionService.getForProject(payload.projectPath);
    }

    return this.sessionService.getAll();
  }

  /**
   * Broadcast session created event
   */
  @OnEvent('session.created')
  onSessionCreated(session: ExtendedSessionConfig): void {
    this.server.emit('session:created', session);
  }

  /**
   * Broadcast session status event
   */
  @OnEvent('session.status')
  onSessionStatus(update: SessionStatusUpdate): void {
    this.server.emit('session:status', update);
  }

  /**
   * Broadcast session removed event
   */
  @OnEvent('session.removed')
  onSessionRemoved(payload: { sessionId: string }): void {
    this.server.emit('session:removed', payload);
  }

  /**
   * Broadcast session health event (from HealthService)
   */
  @OnEvent('session.health')
  onSessionHealth(payload: { sessionId: string; health: string; reason?: string }): void {
    this.server.emit('session:health', payload);
  }

  /**
   * Broadcast zombie cleanup event (from HealthService)
   */
  @OnEvent('zombie.cleanup')
  onZombieCleanup(payload: { sessionId: string; sessionName: string; reason: string }): void {
    this.server.emit('zombie:cleanup', payload);
  }
}
