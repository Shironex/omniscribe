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
  ClaudeSessionHistoryPayload,
  ClaudeSessionHistoryResponse,
  ClaudeSessionIdCapturedEvent,
  ResumeSessionPayload,
  ForkSessionPayload,
  ContinueLastSessionPayload,
  RestoreSnapshotResponse,
  WorktreeSettings,
  DEFAULT_WORKTREE_SETTINGS,
  SessionSettings,
  DEFAULT_SESSION_SETTINGS,
  MAX_CONCURRENT_SESSIONS,
  createLogger,
} from '@omniscribe/shared';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
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
    private readonly workspaceService: WorkspaceService,
    private readonly claudeSessionReader: ClaudeSessionReaderService
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

    // Get settings from workspace preferences
    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;

    // Determine skip-permissions flag (only for AI sessions)
    const skipPermissions =
      payload.mode !== 'plain' && sessionSettings.skipPermissions ? true : undefined;

    const session = this.sessionService.create(payload.mode, payload.projectPath, {
      name: payload.name,
      workingDirectory: payload.workingDirectory,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      mcpServers: payload.mcpServers,
      skipPermissions,
    });

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

  /**
   * Handle session end hook events from HookManagerService.
   * Broadcasts to frontend so it can update UI immediately.
   */
  @OnEvent('session.hook.end')
  onSessionHookEnd(payload: { session_id?: string; [key: string]: unknown }): void {
    if (payload.session_id) {
      this.server.emit('session:hook-ended', { claudeSessionId: payload.session_id });
      this.logger.debug(`Session hook end broadcast for ${payload.session_id}`);
    }
  }

  /**
   * Broadcast Claude session ID captured event.
   * Fired by SessionService.pollForClaudeSessionId when a new Claude session is detected.
   */
  @OnEvent('session.claude-id-captured')
  onClaudeSessionIdCaptured(payload: ClaudeSessionIdCapturedEvent): void {
    this.server.emit('session:claude-id-captured', payload);
    this.logger.log(
      `Claude session ID captured: ${payload.claudeSessionId} for session ${payload.sessionId}`
    );
  }

  /**
   * Handle request for Claude Code session history for a project.
   * Reads the sessions-index.json from Claude Code's data directory.
   */
  @SkipThrottle()
  @SubscribeMessage('session:history')
  async handleGetHistory(
    @MessageBody() payload: ClaudeSessionHistoryPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<ClaudeSessionHistoryResponse> {
    try {
      const sessions = await this.claudeSessionReader.readSessionsIndex(payload.projectPath);
      return { sessions };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch session history: ${errorMessage}`);
      return { sessions: [], error: errorMessage };
    }
  }

  /**
   * Handle request to resume a previous Claude Code session.
   * Creates a new Omniscribe session with the resume flag set, which causes
   * the CLI to be spawned with --resume <sessionId>.
   */
  @SkipThrottle()
  @SubscribeMessage('session:resume')
  async handleResume(
    @MessageBody() payload: ResumeSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    // Check concurrency limit before creating session
    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      const idleNames = idleSessions.map(s => s.name);
      this.logger.warn(
        `[handleResume] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleNames,
      };
    }

    // Get settings from workspace preferences
    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;

    // Determine skip-permissions flag
    const skipPermissions = sessionSettings.skipPermissions ? true : undefined;

    // Create session with resumeSessionId set
    const session = this.sessionService.create('claude', payload.projectPath, {
      name: payload.name ?? `Resumed: ${payload.claudeSessionId.slice(0, 8)}`,
      skipPermissions,
      resumeSessionId: payload.claudeSessionId,
    });

    // Handle worktree setup for resumed sessions
    let worktreePath: string | null = null;

    try {
      if (worktreeSettings.mode !== 'never' && payload.branch) {
        const currentBranch = await this.gitService.getCurrentBranch(payload.projectPath);

        if (worktreeSettings.mode === 'always') {
          const uniqueSuffix = crypto.randomUUID().slice(0, 8);
          const isolatedBranch = `${payload.branch}-${uniqueSuffix}`;
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            isolatedBranch,
            worktreeSettings.location
          );
          this.logger.log(
            `Created isolated worktree at ${worktreePath} for resumed session ${session.id}`
          );
        } else if (worktreeSettings.mode === 'branch' && payload.branch !== currentBranch) {
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            payload.branch,
            worktreeSettings.location
          );
          this.logger.log(
            `Created branch worktree at ${worktreePath} for resumed session ${session.id}`
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create worktree for resumed session ${session.id}: ${errorMessage}`
      );
    }

    // Assign branch
    if (payload.branch) {
      this.sessionService.assignBranch(session.id, payload.branch, worktreePath ?? undefined);
    }

    // Launch the terminal session
    const workingDir = worktreePath ?? session.workingDirectory;
    const launchResult = await this.sessionService.launchSession(
      session.id,
      payload.projectPath,
      workingDir,
      'claude'
    );

    if (!launchResult.success) {
      return { error: launchResult.error ?? 'Failed to launch resumed session' };
    }

    // Join the client to the terminal room
    if (launchResult.terminalSessionId !== undefined) {
      client.join(`terminal:${launchResult.terminalSessionId}`);
      this.terminalGateway.registerClientSession(client.id, launchResult.terminalSessionId);
      this.logger.log(
        `Client ${client.id} joined terminal room terminal:${launchResult.terminalSessionId} (resumed)`
      );
    }

    return { session: this.sessionService.get(session.id) ?? session };
  }

  /**
   * Handle request to fork a Claude Code session.
   * Creates a conversation branch from an existing session's history using --resume + --fork-session.
   */
  @SkipThrottle()
  @SubscribeMessage('session:fork')
  async handleFork(
    @MessageBody() payload: ForkSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    // Check concurrency limit
    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      const idleNames = idleSessions.map(s => s.name);
      this.logger.warn(
        `[handleFork] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleNames,
      };
    }

    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
    const skipPermissions = sessionSettings.skipPermissions ? true : undefined;

    // Create session with forkSessionId set
    const session = this.sessionService.create('claude', payload.projectPath, {
      name: payload.name ?? `Fork: ${payload.claudeSessionId.slice(0, 8)}`,
      skipPermissions,
      forkSessionId: payload.claudeSessionId,
    });

    // Handle worktree setup (same as resume)
    let worktreePath: string | null = null;
    try {
      if (worktreeSettings.mode !== 'never' && payload.branch) {
        const currentBranch = await this.gitService.getCurrentBranch(payload.projectPath);

        if (worktreeSettings.mode === 'always') {
          const uniqueSuffix = crypto.randomUUID().slice(0, 8);
          const isolatedBranch = `${payload.branch}-${uniqueSuffix}`;
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            isolatedBranch,
            worktreeSettings.location
          );
        } else if (worktreeSettings.mode === 'branch' && payload.branch !== currentBranch) {
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            payload.branch,
            worktreeSettings.location
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create worktree for forked session ${session.id}: ${errorMessage}`
      );
    }

    if (payload.branch) {
      this.sessionService.assignBranch(session.id, payload.branch, worktreePath ?? undefined);
    }

    const workingDir = worktreePath ?? session.workingDirectory;
    const launchResult = await this.sessionService.launchSession(
      session.id,
      payload.projectPath,
      workingDir,
      'claude'
    );

    if (!launchResult.success) {
      return { error: launchResult.error ?? 'Failed to launch forked session' };
    }

    if (launchResult.terminalSessionId !== undefined) {
      client.join(`terminal:${launchResult.terminalSessionId}`);
      this.terminalGateway.registerClientSession(client.id, launchResult.terminalSessionId);
      this.logger.log(
        `Client ${client.id} joined terminal room terminal:${launchResult.terminalSessionId} (forked)`
      );
    }

    return { session: this.sessionService.get(session.id) ?? session };
  }

  /**
   * Handle request to continue the most recent Claude Code session.
   * Uses `claude --continue` which resumes the latest session in the project directory.
   */
  @SkipThrottle()
  @SubscribeMessage('session:continue-last')
  async handleContinueLast(
    @MessageBody() payload: ContinueLastSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    // Check concurrency limit
    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      const idleNames = idleSessions.map(s => s.name);
      this.logger.warn(
        `[handleContinueLast] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleNames,
      };
    }

    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
    const skipPermissions = sessionSettings.skipPermissions ? true : undefined;

    const session = this.sessionService.create('claude', payload.projectPath, {
      name: payload.name ?? 'Continue Last',
      skipPermissions,
      continueLastSession: true,
    });

    // Handle worktree setup
    let worktreePath: string | null = null;
    try {
      if (worktreeSettings.mode !== 'never' && payload.branch) {
        const currentBranch = await this.gitService.getCurrentBranch(payload.projectPath);

        if (worktreeSettings.mode === 'always') {
          const uniqueSuffix = crypto.randomUUID().slice(0, 8);
          const isolatedBranch = `${payload.branch}-${uniqueSuffix}`;
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            isolatedBranch,
            worktreeSettings.location
          );
        } else if (worktreeSettings.mode === 'branch' && payload.branch !== currentBranch) {
          worktreePath = await this.worktreeService.prepare(
            payload.projectPath,
            payload.branch,
            worktreeSettings.location
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to create worktree for continue-last session ${session.id}: ${errorMessage}`
      );
    }

    if (payload.branch) {
      this.sessionService.assignBranch(session.id, payload.branch, worktreePath ?? undefined);
    }

    const workingDir = worktreePath ?? session.workingDirectory;
    const launchResult = await this.sessionService.launchSession(
      session.id,
      payload.projectPath,
      workingDir,
      'claude'
    );

    if (!launchResult.success) {
      return { error: launchResult.error ?? 'Failed to launch continue-last session' };
    }

    if (launchResult.terminalSessionId !== undefined) {
      client.join(`terminal:${launchResult.terminalSessionId}`);
      this.terminalGateway.registerClientSession(client.id, launchResult.terminalSessionId);
      this.logger.log(
        `Client ${client.id} joined terminal room terminal:${launchResult.terminalSessionId} (continue-last)`
      );
    }

    return { session: this.sessionService.get(session.id) ?? session };
  }

  /**
   * Handle request to get the restore snapshot for auto-resume on restart.
   * Returns saved active sessions snapshot and the autoResume preference.
   */
  @SkipThrottle()
  @SubscribeMessage('session:get-restore-snapshot')
  handleGetRestoreSnapshot(): RestoreSnapshotResponse {
    const preferences = this.workspaceService.getPreferences();
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
    const autoResumeEnabled = sessionSettings.autoResumeOnRestart ?? false;
    const sessions = this.workspaceService.getActiveSessionsSnapshot();

    return {
      sessions,
      autoResumeEnabled,
    };
  }
}
