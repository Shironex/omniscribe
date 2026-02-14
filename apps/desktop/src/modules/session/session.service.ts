import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  SessionStatus,
  AiMode,
  CreateSessionOptions,
  UpdateSessionOptions,
  WorktreeSettings,
  DEFAULT_WORKTREE_SETTINGS,
  SessionStatusUpdate,
  MAX_SESSION_NAME_LENGTH,
  MAX_MODEL_LENGTH,
  MAX_SYSTEM_PROMPT_LENGTH,
  createLogger,
  extractErrorMessage,
  normalizePath,
} from '@omniscribe/shared';
import { TerminalService } from '../terminal';
import { WorktreeService } from '../git';
import { WorkspaceService } from '../workspace';
import { InternalSessionEvents, InternalTerminalEvents } from '../shared/events';
import { BackendSessionConfig } from './types';

// Re-export for backwards compatibility
export type { BackendSessionConfig } from './types';

/**
 * Valid session status transitions.
 * Maps each status to the set of statuses it can transition to.
 */
const VALID_TRANSITIONS: Record<SessionStatus, Set<SessionStatus>> = {
  idle: new Set([
    'connecting',
    'working',
    'planning',
    'thinking',
    'needs_input',
    'finished',
    'error',
  ]),
  connecting: new Set(['idle', 'error']),
  working: new Set([
    'idle',
    'needs_input',
    'planning',
    'thinking',
    'error',
    'finished',
    'disconnected',
  ]),
  planning: new Set([
    'idle',
    'working',
    'needs_input',
    'thinking',
    'error',
    'finished',
    'disconnected',
  ]),
  thinking: new Set([
    'idle',
    'working',
    'planning',
    'needs_input',
    'error',
    'finished',
    'disconnected',
  ]),
  needs_input: new Set([
    'idle',
    'working',
    'planning',
    'thinking',
    'error',
    'finished',
    'disconnected',
  ]),
  finished: new Set(['idle', 'error']),
  error: new Set(['idle', 'connecting']),
  disconnected: new Set(['idle', 'error']),
};

@Injectable()
export class SessionService {
  private readonly logger = createLogger('SessionService');
  private sessions = new Map<string, BackendSessionConfig>();
  private terminalToSession = new Map<number, string>();
  private sessionCounter = 0;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly terminalService: TerminalService,
    private readonly worktreeService: WorktreeService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {
    // Listen for terminal close events to update session status
    this.eventEmitter.on(InternalTerminalEvents.CLOSED, this.handleTerminalClosed.bind(this));

    // Listen for terminal output to track last output time (for health checks)
    this.eventEmitter.on(
      InternalTerminalEvents.OUTPUT,
      (event: { sessionId: number; data: string }) => {
        this.updateLastOutput(event.sessionId);
      }
    );
  }

  /**
   * Clear the terminal reference from a session and remove the reverse lookup entry.
   */
  clearTerminalRef(session: BackendSessionConfig): void {
    if (session.terminalSessionId !== undefined) {
      this.terminalToSession.delete(session.terminalSessionId);
      session.terminalSessionId = undefined;
    }
  }

  /**
   * Handle terminal closed events.
   * Updates session state and emits an event for the tracker to handle persistence.
   */
  private handleTerminalClosed(event: {
    sessionId: number;
    externalId?: string;
    exitCode: number;
    signal?: number;
  }): void {
    if (event.externalId) {
      const session = this.sessions.get(event.externalId);
      if (session) {
        const status = event.exitCode === 0 ? 'idle' : 'error';
        const message =
          event.exitCode === 0
            ? 'Session ended normally'
            : `Session exited with code ${event.exitCode}`;

        this.updateStatus(event.externalId, status, message);
        this.clearTerminalRef(session);

        // Emit event for ClaudeSessionTrackerService to handle persistence and snapshot
        this.eventEmitter.emit(InternalSessionEvents.TERMINAL_CLOSED_WITH_SESSION, {
          sessionId: event.externalId,
          claudeSessionId: session.claudeSessionId,
          exitCode: event.exitCode,
        });

        this.logger.log(`Session ${event.externalId} terminal closed (exit=${event.exitCode})`);
      }
    }
  }

  /**
   * Create a new session
   */
  create(
    mode: AiMode,
    projectPath: string,
    options?: Partial<CreateSessionOptions> & {
      skipPermissions?: boolean;
      resumeSessionId?: string;
      forkSessionId?: string;
      continueLastSession?: boolean;
    }
  ): BackendSessionConfig {
    const id = `session-${++this.sessionCounter}-${Date.now()}`;
    const now = new Date();
    const isResumed = !!options?.resumeSessionId;

    const session: BackendSessionConfig = {
      id,
      name: options?.name ?? `Session ${this.sessionCounter}`,
      workingDirectory: options?.workingDirectory ?? projectPath,
      aiMode: mode,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      mcpServers: options?.mcpServers,
      createdAt: now,
      lastActiveAt: now,
      projectPath,
      status: 'idle',
      skipPermissions: options?.skipPermissions,
      // Resume-related fields
      claudeSessionId: options?.resumeSessionId,
      isResumed,
      resumeSessionId: options?.resumeSessionId,
      // Fork-related fields
      forkSessionId: options?.forkSessionId,
      // Continue-last field
      continueLastSession: options?.continueLastSession,
    };

    this.sessions.set(id, session);

    let detail = '';
    if (isResumed) {
      detail = `, resuming: ${options!.resumeSessionId}`;
    } else if (options?.forkSessionId) {
      detail = `, forking: ${options.forkSessionId}`;
    } else if (options?.continueLastSession) {
      detail = ', continuing last';
    }
    this.logger.info(`Created session ${id} (mode: ${mode}, project: ${projectPath}${detail})`);

    this.eventEmitter.emit(InternalSessionEvents.CREATED, session);

    return session;
  }

  /**
   * Update session status
   */
  updateStatus(
    sessionId: string,
    status: SessionStatus,
    message?: string,
    needsInputPrompt?: boolean
  ): BackendSessionConfig | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    // Validate state transition
    const validTargets = VALID_TRANSITIONS[session.status];
    if (validTargets && !validTargets.has(status)) {
      this.logger.warn(
        `Invalid session status transition for ${sessionId}: ${session.status} -> ${status}`
      );
      return undefined;
    }

    this.logger.debug(
      `Updating status for session ${sessionId}: ${status}${message ? ` (${message})` : ''}`
    );
    session.status = status;
    session.statusMessage = message;
    session.needsInputPrompt = needsInputPrompt;
    session.lastActiveAt = new Date();

    const statusUpdate: SessionStatusUpdate = {
      sessionId,
      status,
      message,
      needsInputPrompt,
    };

    this.eventEmitter.emit(InternalSessionEvents.STATUS, statusUpdate);

    return session;
  }

  /**
   * Handle MCP status updates received by the HTTP status server.
   * Uses event-based communication to avoid circular dependency between
   * McpModule and SessionModule.
   */
  @OnEvent(InternalSessionEvents.MCP_STATUS_RECEIVED)
  onMcpStatusReceived(event: {
    sessionId: string;
    status: string;
    message?: string;
    needsInputPrompt?: string;
  }): void {
    const updated = this.updateStatus(
      event.sessionId,
      event.status as SessionStatus,
      event.message,
      event.needsInputPrompt ? true : undefined
    );

    if (!updated) {
      this.logger.debug(
        `MCP status update not applied for ${event.sessionId} (session not found or invalid transition)`
      );
    }
  }

  /**
   * Update session metadata (name, model, systemPrompt, etc.)
   * Emits a status update event so the frontend is notified.
   */
  update(sessionId: string, updates: UpdateSessionOptions): BackendSessionConfig | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    // Validate string length limits (same as session creation)
    if (updates.name !== undefined && updates.name.length > MAX_SESSION_NAME_LENGTH) {
      this.logger.warn(`[update] name exceeds max length for session ${sessionId}`);
      return undefined;
    }
    if (updates.model !== undefined && updates.model.length > MAX_MODEL_LENGTH) {
      this.logger.warn(`[update] model exceeds max length for session ${sessionId}`);
      return undefined;
    }
    if (
      updates.systemPrompt !== undefined &&
      updates.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH
    ) {
      this.logger.warn(`[update] systemPrompt exceeds max length for session ${sessionId}`);
      return undefined;
    }

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

    const statusUpdate: SessionStatusUpdate = {
      sessionId,
      status: session.status,
      message: 'Session updated',
    };

    this.eventEmitter.emit(InternalSessionEvents.STATUS, statusUpdate);

    return session;
  }

  /**
   * Update the last output timestamp for a session (identified by terminal session ID).
   * Used by health checks to determine output recency.
   * @param terminalSessionId The terminal PTY session ID
   */
  updateLastOutput(terminalSessionId: number): void {
    const sessionId = this.terminalToSession.get(terminalSessionId);
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastOutputAt = new Date();
      }
    }
  }

  /**
   * Assign a git branch to the session
   */
  assignBranch(
    sessionId: string,
    branch: string,
    worktreePath?: string
  ): BackendSessionConfig | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    session.branch = branch;
    session.worktreePath = worktreePath;
    session.lastActiveAt = new Date();

    // Emit status update to notify about branch assignment (includes branch/worktreePath for frontend)
    const statusUpdate: SessionStatusUpdate = {
      sessionId,
      status: session.status,
      message: `Branch assigned: ${branch}`,
      branch,
      worktreePath,
    };
    this.eventEmitter.emit(InternalSessionEvents.STATUS, statusUpdate);

    return session;
  }

  /**
   * Remove a session and kill its terminal if running
   */
  async remove(sessionId: string): Promise<boolean> {
    this.logger.info(`Removing session ${sessionId}`);
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    // Kill the terminal if it's running
    if (session.terminalSessionId !== undefined) {
      if (this.terminalService.hasSession(session.terminalSessionId)) {
        await this.terminalService.kill(session.terminalSessionId);
      }
      this.clearTerminalRef(session);
    }

    // Cleanup worktree if auto-cleanup is enabled (with reference counting — Bug #6)
    if (session.worktreePath) {
      const preferences = this.workspaceService.getPreferences();
      const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;

      if (worktreeSettings.autoCleanup) {
        // Check if other sessions are still using the same worktree path
        // Use normalizePath for cross-platform comparison (Windows backslash vs forward slash)
        const normalizedPath = normalizePath(session.worktreePath);
        const otherSessionsUsingWorktree = Array.from(this.sessions.values()).filter(
          s =>
            s.id !== sessionId && s.worktreePath && normalizePath(s.worktreePath) === normalizedPath
        );

        if (otherSessionsUsingWorktree.length === 0) {
          try {
            await this.worktreeService.cleanup(session.projectPath, session.worktreePath);
            this.logger.log(
              `Cleaned up worktree at ${session.worktreePath} for session ${sessionId}`
            );
          } catch (error) {
            const errorMessage = extractErrorMessage(error);
            this.logger.warn(
              `Failed to cleanup worktree for session ${sessionId}: ${errorMessage}`
            );
            // Continue with session removal even if worktree cleanup fails
          }
        } else {
          this.logger.info(
            `Skipping worktree cleanup for ${session.worktreePath} — still in use by ${otherSessionsUsingWorktree.length} other session(s)`
          );
        }
      }
    }

    // Note: We intentionally don't remove the omniscribe MCP entry from .mcp.json
    // because other sessions may still be running and need it, plus it's useful
    // to keep it there for future sessions

    this.sessions.delete(sessionId);

    this.eventEmitter.emit(InternalSessionEvents.REMOVED, { sessionId });

    return true;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): BackendSessionConfig | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAll(): BackendSessionConfig[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get all sessions that have an active terminal (running sessions).
   * Done/Error sessions without terminals are NOT counted.
   */
  getRunningSessions(): BackendSessionConfig[] {
    return Array.from(this.sessions.values()).filter(
      session =>
        session.terminalSessionId !== undefined &&
        this.terminalService.hasSession(session.terminalSessionId)
    );
  }

  /**
   * Get idle sessions that could be closed to free slots.
   * A session is "idle" if it has an active terminal but status is 'idle' or 'needs_input'.
   */
  getIdleSessions(): BackendSessionConfig[] {
    return this.getRunningSessions().filter(
      session => session.status === 'idle' || session.status === 'needs_input'
    );
  }

  /**
   * Get sessions for a specific project
   */
  getForProject(projectPath: string): BackendSessionConfig[] {
    return Array.from(this.sessions.values()).filter(
      session => session.projectPath === projectPath
    );
  }

  /**
   * Remove all sessions for a project
   */
  async removeForProject(projectPath: string): Promise<number> {
    const sessionsToRemove = this.getForProject(projectPath);

    for (const session of sessionsToRemove) {
      await this.remove(session.id);
    }

    return sessionsToRemove.length;
  }

  /**
   * Register a terminal reference for a session.
   * Called by SessionLauncherService after spawning a terminal.
   */
  registerTerminal(sessionId: string, terminalSessionId: number, worktreePath: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.terminalSessionId = terminalSessionId;
      this.terminalToSession.set(terminalSessionId, session.id);
      session.worktreePath = worktreePath;
      session.lastActiveAt = new Date();
    }
  }

  /**
   * Set the Claude session ID for a session.
   * Called by ClaudeSessionTrackerService when a new Claude session is detected.
   */
  setClaudeSessionId(sessionId: string, claudeSessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.claudeSessionId = claudeSessionId;
    }
  }

  /**
   * Stop a running session by killing its terminal
   * @param sessionId The session ID to stop
   * @returns True if session was stopped, false if not running or not found
   */
  async stopSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      this.logger.debug(`stopSession: session ${sessionId} not found`);
      return false;
    }

    if (session.terminalSessionId === undefined) {
      this.logger.debug(`stopSession: session ${sessionId} has no terminal`);
      return false;
    }

    const terminalId = session.terminalSessionId;

    if (!this.terminalService.hasSession(terminalId)) {
      this.logger.debug(
        `stopSession: terminal ${terminalId} for session ${sessionId} no longer exists`
      );
      this.clearTerminalRef(session);
      return false;
    }

    this.updateStatus(sessionId, 'disconnected', 'Stopping session...');

    await this.terminalService.kill(terminalId);

    this.clearTerminalRef(session);
    this.updateStatus(sessionId, 'idle', 'Session stopped');

    this.logger.log(`Session ${sessionId} stopped`);

    return true;
  }

  /**
   * Write input to a session's terminal
   * @param sessionId The session ID
   * @param data The data to write
   * @returns True if data was written, false if session not found or not running
   */
  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session || session.terminalSessionId === undefined) {
      return false;
    }

    this.terminalService.write(session.terminalSessionId, data);
    session.lastActiveAt = new Date();

    return true;
  }

  /**
   * Resize a session's terminal
   * @param sessionId The session ID
   * @param cols Number of columns
   * @param rows Number of rows
   * @returns True if resize was successful
   */
  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);

    if (!session || session.terminalSessionId === undefined) {
      return false;
    }

    this.terminalService.resize(session.terminalSessionId, cols, rows);
    return true;
  }

  /**
   * Check if a session has an active terminal
   * @param sessionId The session ID
   * @returns True if session has an active terminal
   */
  isSessionRunning(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session || session.terminalSessionId === undefined) {
      return false;
    }

    return this.terminalService.hasSession(session.terminalSessionId);
  }
}
