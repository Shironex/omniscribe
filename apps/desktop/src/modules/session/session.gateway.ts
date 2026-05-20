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
import { validatePath } from '../shared/validation';
import { SessionService } from './session.service';
import { SessionLauncherService } from './session-launcher.service';
import { BackendSessionConfig } from './types';
import { TerminalGateway } from '../terminal';
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
  MAX_MODEL_LENGTH,
  MAX_SYSTEM_PROMPT_LENGTH,
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

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionLauncherService: SessionLauncherService,
    @Inject(forwardRef(() => TerminalGateway))
    private readonly terminalGateway: TerminalGateway,
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
   * Delegates the full launch flow to SessionLauncherService and handles
   * WebSocket-specific concerns (terminal-room join).
   */
  private async launchSessionWithWorktree(
    client: Socket,
    payload: { projectPath: string; branch?: string; name?: string },
    mode: AiMode,
    createOptions: Parameters<SessionService['create']>[2],
    errorPrefix: string
  ): Promise<CreateSessionResponse> {
    const outcome = await this.sessionLauncherService.launch({
      projectPath: payload.projectPath,
      mode,
      branch: payload.branch,
      name: payload.name,
      source: 'gateway',
      createOptions,
    });

    if (outcome.error) {
      const response: CreateSessionResponse = { error: outcome.error };
      if (outcome.idleSessions) {
        response.idleSessions = outcome.idleSessions;
      }
      return response;
    }

    if (outcome.terminalSessionId !== undefined) {
      client.join(`terminal:${outcome.terminalSessionId}`);
      this.terminalGateway.registerClientSession(client.id, outcome.terminalSessionId);
      this.logger.log(
        `Client ${client.id} joined terminal room terminal:${outcome.terminalSessionId} (${errorPrefix})`
      );
    }

    const result: CreateSessionResponse = {
      session: outcome.session,
    };

    if (outcome.worktreeWarning) {
      result.warning = outcome.worktreeWarning;
    }

    return result;
  }
}
