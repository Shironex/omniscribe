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
import * as path from 'path';
import { SessionService, BackendSessionConfig } from './session.service';
import { TerminalGateway } from '../terminal';
import { WorktreeService, GitService } from '../git';
import { WorkspaceService } from '../workspace';
import {
  AiMode,
  CreateSessionPayload,
  UpdateSessionPayload,
  SessionRemovePayload,
  SessionListPayload,
  SessionRemoveResponse,
  SessionStatusUpdate,
  ClaudeSessionHistoryPayload,
  ClaudeSessionHistoryResponse,
  ClaudeSessionIdCapturedEvent,
  ResumeSessionPayload,
  ForkSessionPayload,
  ContinueLastSessionPayload,
  RestoreSnapshotResponse,
  SessionHookEndedPayload,
  WorktreeSettings,
  DEFAULT_WORKTREE_SETTINGS,
  SessionSettings,
  DEFAULT_SESSION_SETTINGS,
  MAX_CONCURRENT_SESSIONS,
  VALID_AI_MODES,
  MAX_MODEL_LENGTH,
  MAX_SYSTEM_PROMPT_LENGTH,
  MAX_SESSION_NAME_LENGTH,
  MAX_PATH_LENGTH,
  SessionEvents,
  ZombieEvents,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { InternalSessionEvents, InternalZombieEvents } from '../shared/events';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { CORS_CONFIG } from '../shared/cors.config';

/**
 * Response for session creation - either the session or an error.
 * When limit is hit, includes names of idle sessions the user could close.
 */
interface CreateSessionResponse {
  session?: BackendSessionConfig;
  error?: string;
  warning?: string;
  idleSessions?: string[];
}

/**
 * Response for session update - either the session or an error
 */
interface UpdateSessionResponse {
  session?: BackendSessionConfig;
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
  @SubscribeMessage(SessionEvents.CREATE)
  async handleCreate(
    @MessageBody() payload: CreateSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    // Validate string length limits (model/systemPrompt are create-only fields)
    if (payload.model && payload.model.length > MAX_MODEL_LENGTH) {
      return { error: `model exceeds maximum length of ${MAX_MODEL_LENGTH} characters` };
    }
    if (payload.systemPrompt && payload.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
      return {
        error: `systemPrompt exceeds maximum length of ${MAX_SYSTEM_PROMPT_LENGTH} characters`,
      };
    }

    return this.launchSessionWithWorktree(
      client,
      { projectPath: payload.projectPath, branch: payload.branch, name: payload.name },
      payload.mode,
      {
        name: payload.name,
        workingDirectory: payload.workingDirectory,
        model: payload.model,
        systemPrompt: payload.systemPrompt,
        mcpServers: payload.mcpServers,
      },
      'new'
    );
  }

  /**
   * Handle session update request
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.UPDATE)
  handleUpdate(
    @MessageBody() payload: UpdateSessionPayload,
    @ConnectedSocket() _client: Socket
  ): UpdateSessionResponse {
    const session = this.sessionService.update(payload.sessionId, payload.updates);

    if (!session) {
      return { error: `Session not found: ${payload.sessionId}` };
    }

    return { session };
  }

  /**
   * Handle session removal request
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.REMOVE)
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
  @SubscribeMessage(SessionEvents.LIST)
  handleList(
    @MessageBody() payload: SessionListPayload,
    @ConnectedSocket() _client: Socket
  ): BackendSessionConfig[] {
    if (payload.projectPath) {
      return this.sessionService.getForProject(payload.projectPath);
    }

    return this.sessionService.getAll();
  }

  /**
   * Broadcast session created event
   */
  @OnEvent(InternalSessionEvents.CREATED)
  onSessionCreated(session: BackendSessionConfig): void {
    this.server.emit(SessionEvents.CREATED, session);
  }

  /**
   * Broadcast session status event
   */
  @OnEvent(InternalSessionEvents.STATUS)
  onSessionStatus(update: SessionStatusUpdate): void {
    this.server.emit(SessionEvents.STATUS, update);
  }

  /**
   * Broadcast session removed event
   */
  @OnEvent(InternalSessionEvents.REMOVED)
  onSessionRemoved(payload: { sessionId: string }): void {
    this.server.emit(SessionEvents.REMOVED, payload);
  }

  /**
   * Broadcast session health event (from HealthService)
   */
  @OnEvent(InternalSessionEvents.HEALTH)
  onSessionHealth(payload: { sessionId: string; health: string; reason?: string }): void {
    this.server.emit(SessionEvents.HEALTH, payload);
  }

  /**
   * Broadcast zombie cleanup event (from HealthService)
   */
  @OnEvent(InternalZombieEvents.CLEANUP)
  onZombieCleanup(payload: { sessionId: string; sessionName: string; reason: string }): void {
    this.server.emit(ZombieEvents.CLEANUP, payload);
  }

  /**
   * Handle session end hook events from HookManagerService.
   * Broadcasts to frontend so it can update UI immediately.
   */
  @OnEvent(InternalSessionEvents.HOOK_END)
  onSessionHookEnd(payload: { session_id?: string; [key: string]: unknown }): void {
    if (payload.session_id) {
      const hookEndedPayload: SessionHookEndedPayload = { claudeSessionId: payload.session_id };
      this.server.emit(SessionEvents.HOOK_ENDED, hookEndedPayload);
      this.logger.debug(`Session hook end broadcast for ${payload.session_id}`);
    }
  }

  /**
   * Broadcast Claude session ID captured event.
   * Fired by SessionService.pollForClaudeSessionId when a new Claude session is detected.
   */
  @OnEvent(InternalSessionEvents.CLAUDE_ID_CAPTURED)
  onClaudeSessionIdCaptured(payload: ClaudeSessionIdCapturedEvent): void {
    this.server.emit(SessionEvents.CLAUDE_ID_CAPTURED, payload);
    this.logger.log(
      `Claude session ID captured: ${payload.claudeSessionId} for session ${payload.sessionId}`
    );
  }

  /**
   * Handle request for Claude Code session history for a project.
   * Reads the sessions-index.json from Claude Code's data directory.
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.HISTORY)
  async handleGetHistory(
    @MessageBody() payload: ClaudeSessionHistoryPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<ClaudeSessionHistoryResponse> {
    try {
      const sessions = await this.claudeSessionReader.readSessionsIndex(payload.projectPath);
      return { sessions };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
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
  @SubscribeMessage(SessionEvents.RESUME)
  async handleResume(
    @MessageBody() payload: ResumeSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    return this.launchSessionWithWorktree(
      client,
      { projectPath: payload.projectPath, branch: payload.branch, name: payload.name },
      'claude',
      {
        name: payload.name ?? `Resumed: ${payload.claudeSessionId.slice(0, 8)}`,
        resumeSessionId: payload.claudeSessionId,
      },
      'resumed'
    );
  }

  /**
   * Handle request to fork a Claude Code session.
   * Creates a conversation branch from an existing session's history using --resume + --fork-session.
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.FORK)
  async handleFork(
    @MessageBody() payload: ForkSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    return this.launchSessionWithWorktree(
      client,
      { projectPath: payload.projectPath, branch: payload.branch, name: payload.name },
      'claude',
      {
        name: payload.name ?? `Fork: ${payload.claudeSessionId.slice(0, 8)}`,
        forkSessionId: payload.claudeSessionId,
      },
      'forked'
    );
  }

  /**
   * Handle request to continue the most recent Claude Code session.
   * Uses `claude --continue` which resumes the latest session in the project directory.
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.CONTINUE_LAST)
  async handleContinueLast(
    @MessageBody() payload: ContinueLastSessionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<CreateSessionResponse> {
    return this.launchSessionWithWorktree(
      client,
      { projectPath: payload.projectPath, branch: payload.branch, name: payload.name },
      'claude',
      {
        name: payload.name ?? 'Continue Last',
        continueLastSession: true,
      },
      'continue-last'
    );
  }

  /**
   * Shared helper for all session launches (new, resume, fork, continue-last).
   * Handles concurrency check, preferences, worktree setup, launch, and terminal room join.
   */
  private async launchSessionWithWorktree(
    client: Socket,
    payload: { projectPath: string; branch?: string; name?: string },
    mode: AiMode,
    createOptions: Parameters<SessionService['create']>[2],
    errorPrefix: string
  ): Promise<CreateSessionResponse> {
    // Validate name (covers all creation paths: new, resume, fork, continue-last)
    if (payload.name && payload.name.length > MAX_SESSION_NAME_LENGTH) {
      return { error: `name exceeds maximum length of ${MAX_SESSION_NAME_LENGTH} characters` };
    }

    // Validate mode
    if (!VALID_AI_MODES.includes(mode as (typeof VALID_AI_MODES)[number])) {
      return {
        error: `Invalid AI mode: ${String(mode)}. Must be one of: ${VALID_AI_MODES.join(', ')}`,
      };
    }

    // Validate projectPath
    if (!payload.projectPath || typeof payload.projectPath !== 'string') {
      return { error: 'Invalid projectPath: must be a non-empty string' };
    }
    if (payload.projectPath.length > MAX_PATH_LENGTH) {
      return { error: `projectPath exceeds maximum length of ${MAX_PATH_LENGTH} characters` };
    }
    if (!path.isAbsolute(payload.projectPath)) {
      return { error: 'Invalid projectPath: must be an absolute path' };
    }

    // Check concurrency limit
    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      this.logger.warn(
        `[${errorPrefix}] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleSessions.map(s => s.name),
      };
    }

    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
    const skipPermissions = mode !== 'plain' && sessionSettings.skipPermissions ? true : undefined;

    const session = this.sessionService.create(mode, payload.projectPath, {
      ...createOptions,
      skipPermissions,
    });

    // Worktree setup (use currentBranch fallback when branch is absent)
    let worktreePath: string | null = null;
    let worktreeWarning: string | undefined;

    if (worktreeSettings.mode !== 'never') {
      // Fetch currentBranch once to avoid TOCTOU race (Bug #8)
      // Wrapped in try-catch so a git failure doesn't block session creation
      let currentBranch: string | undefined;
      try {
        currentBranch = await this.gitService.getCurrentBranch(payload.projectPath);
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        this.logger.warn(`Failed to get current branch for worktree setup: ${errorMessage}`);
        worktreeWarning = `Could not determine current branch: ${errorMessage}. Skipping worktree setup.`;
      }

      if (currentBranch) {
        const branchToUse = payload.branch ?? currentBranch;

        try {
          if (worktreeSettings.mode === 'always') {
            const uniqueSuffix = crypto.randomUUID().slice(0, 8);
            const isolatedBranch = `${branchToUse}-${uniqueSuffix}`;
            worktreePath = await this.worktreeService.prepare(
              payload.projectPath,
              isolatedBranch,
              worktreeSettings.location,
              currentBranch
            );
          } else if (worktreeSettings.mode === 'branch' && branchToUse !== currentBranch) {
            worktreePath = await this.worktreeService.prepare(
              payload.projectPath,
              branchToUse,
              worktreeSettings.location,
              currentBranch
            );
          }
        } catch (error) {
          const errorMessage = extractErrorMessage(error);
          this.logger.warn(`Failed to create worktree for session ${session.id}: ${errorMessage}`);
          worktreeWarning = `Worktree creation failed: ${errorMessage}. Running in main project directory.`;
        }

        // Assign branch (only when worktrees are enabled)
        if (payload.branch) {
          this.sessionService.assignBranch(session.id, payload.branch, worktreePath ?? undefined);
        } else if (worktreePath) {
          this.sessionService.assignBranch(session.id, currentBranch, worktreePath);
        } else {
          // No worktree needed (e.g., already on the target branch) — still label the session
          this.sessionService.assignBranch(session.id, currentBranch);
        }
      } else if (payload.branch) {
        // getCurrentBranch failed but user specified a branch — assign it without worktree
        this.sessionService.assignBranch(session.id, payload.branch);
      }
    }

    // Launch
    const workingDir = worktreePath ?? session.workingDirectory;
    const launchResult = await this.sessionService.launchSession(
      session.id,
      payload.projectPath,
      workingDir,
      mode
    );

    if (!launchResult.success) {
      return { error: launchResult.error ?? `Failed to launch ${errorPrefix} session` };
    }

    // Join terminal room
    if (launchResult.terminalSessionId !== undefined) {
      client.join(`terminal:${launchResult.terminalSessionId}`);
      this.terminalGateway.registerClientSession(client.id, launchResult.terminalSessionId);
      this.logger.log(
        `Client ${client.id} joined terminal room terminal:${launchResult.terminalSessionId} (${errorPrefix})`
      );
    }

    const result: CreateSessionResponse = {
      session: this.sessionService.get(session.id) ?? session,
    };

    // Notify frontend about worktree creation failure (Bug #7)
    if (worktreeWarning) {
      result.warning = worktreeWarning;
    }

    return result;
  }

  /**
   * Handle request to get the restore snapshot for auto-resume on restart.
   * Returns saved active sessions snapshot and the autoResume preference.
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.GET_RESTORE_SNAPSHOT)
  handleGetRestoreSnapshot(): RestoreSnapshotResponse {
    const preferences = this.workspaceService.getPreferences();
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
    const autoResumeEnabled = sessionSettings.autoResumeOnRestart ?? false;
    const sessions = this.workspaceService.getActiveSessionsSnapshot();

    // Clear snapshot after reading to prevent stale re-consumption on crash
    if (sessions.length > 0) {
      this.workspaceService.clearActiveSessionsSnapshot();
    }

    return {
      sessions,
      autoResumeEnabled,
    };
  }
}
