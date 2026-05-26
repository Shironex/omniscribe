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
import { validatePath } from '../shared/validation';
import { SessionService } from './session.service';
import { SessionLauncherService } from './session-launcher.service';
import { BackendSessionConfig } from './types';
import { TerminalGateway } from '../terminal';
import { WorktreeService, GitService } from '../git';
import { WorkspaceService } from '../workspace';
import { PluginRegistryService } from '../plugin';
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
  SessionHookEndedPayload,
  WorktreeSettings,
  DEFAULT_WORKTREE_SETTINGS,
  SessionSettings,
  DEFAULT_SESSION_SETTINGS,
  MAX_CONCURRENT_SESSIONS,
  MAX_MODEL_LENGTH,
  MAX_SYSTEM_PROMPT_LENGTH,
  MAX_SESSION_NAME_LENGTH,
  SessionEvents,
  ZombieEvents,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { InternalSessionEvents, InternalZombieEvents } from '../shared/events';
import { CORS_CONFIG } from '../shared/cors.config';
import { hasProviderMethod } from '../shared/provider-guards';

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

  /**
   * Launches that have passed the concurrency check but not yet registered a
   * terminal. A freshly created session has no terminalSessionId until several
   * awaits later, so getRunningSessions() alone can't see it — without counting
   * these, N concurrent creates all slip past the limit and over-spawn PTYs.
   */
  private launchesInFlight = 0;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionLauncherService: SessionLauncherService,
    @Inject(forwardRef(() => TerminalGateway))
    private readonly terminalGateway: TerminalGateway,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService,
    private readonly pluginRegistry: PluginRegistryService
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
    this.logger.debug(`[session:create] mode=${payload.mode}, project=${payload.projectPath}`);

    if (payload.workingDirectory) {
      const pathError = validatePath(payload.workingDirectory, 'workingDirectory');
      if (pathError) {
        return { error: pathError };
      }
    }

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
    this.logger.debug(`[session:update] sessionId=${payload.sessionId}`);
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
    this.logger.debug(`[session:remove] sessionId=${payload.sessionId}`);
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
    this.logger.debug(`[session:list] projectPath=${payload.projectPath ?? 'all'}`);
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
    this.logger.debug(`[session:created] broadcasting for ${session.id}`);
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
    this.logger.debug(`[session:removed] broadcasting for ${payload.sessionId}`);
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
   * Handle session end hook events from a provider plugin's hook manager
   * (e.g. ClaudeHookManagerService in @omniscribe/provider-claude).
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
   * Fired by ClaudeSessionTrackerService when a new Claude session is detected.
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
   * Delegates to the provider plugin's session reader via the plugin registry.
   */
  @SkipThrottle()
  @SubscribeMessage(SessionEvents.HISTORY)
  async handleGetHistory(
    @MessageBody() payload: ClaudeSessionHistoryPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<ClaudeSessionHistoryResponse> {
    this.logger.debug(`[session:history] projectPath=${payload.projectPath}`);
    try {
      // Delegate to provider plugin for session history
      if (this.pluginRegistry.isPluginMode('claude')) {
        const provider = this.pluginRegistry.getProvider('claude');
        if (hasProviderMethod(provider, 'getSessionReader')) {
          const reader = provider.getSessionReader() as {
            readSessionsIndex(
              projectPath: string
            ): Promise<ClaudeSessionHistoryResponse['sessions']>;
          };
          const sessions = await reader.readSessionsIndex(payload.projectPath);
          return { sessions };
        }
      }
      return { sessions: [], error: 'No session history provider available' };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.error('Failed to fetch session history', error);
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
    this.logger.debug(
      `[session:resume] claudeSessionId=${payload.claudeSessionId}, project=${payload.projectPath}`
    );
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
    this.logger.debug(
      `[session:fork] claudeSessionId=${payload.claudeSessionId}, project=${payload.projectPath}`
    );
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
    this.logger.debug(`[session:continue-last] project=${payload.projectPath}`);
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

    // Validate mode via plugin registry (supports built-in and plugin-registered modes)
    if (!this.pluginRegistry.isValidMode(mode)) {
      return {
        error: `Invalid AI mode: ${String(mode)}. No built-in or plugin provider registered for this mode.`,
      };
    }

    // Validate projectPath
    const pathError = validatePath(payload.projectPath);
    if (pathError) {
      return { error: pathError };
    }

    // Check concurrency limit. Count in-flight launches that haven't registered
    // a terminal yet (check + increment below are synchronous, so concurrent
    // creates observe each other and can't all slip past the limit).
    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length + this.launchesInFlight >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      this.logger.warn(
        `[${errorPrefix}] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running, ${this.launchesInFlight} launching`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleSessions.map(s => s.name),
      };
    }

    this.launchesInFlight++;
    try {
      const preferences = this.workspaceService.getPreferences();
      const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
      const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
      const skipPermissions =
        mode !== 'plain' && sessionSettings.skipPermissions ? true : undefined;

      const session = this.sessionService.create(mode, payload.projectPath, {
        ...createOptions,
        skipPermissions,
      });

      return await this.runLaunch(client, payload, mode, session, worktreeSettings, errorPrefix);
    } finally {
      this.launchesInFlight--;
    }
  }

  /**
   * Worktree setup, launch, and terminal-room join for an already-created
   * session. Extracted so launchSessionWithWorktree can hold the in-flight
   * counter across the whole async body via try/finally.
   */
  private async runLaunch(
    client: Socket,
    payload: { projectPath: string; branch?: string; name?: string },
    mode: AiMode,
    session: BackendSessionConfig,
    worktreeSettings: WorktreeSettings,
    errorPrefix: string
  ): Promise<CreateSessionResponse> {
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
    const launchResult = await this.sessionLauncherService.launchSession(
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
}
