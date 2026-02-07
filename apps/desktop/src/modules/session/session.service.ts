import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SessionConfig,
  SessionStatus,
  AiMode,
  CreateSessionOptions,
  WorktreeSettings,
  DEFAULT_WORKTREE_SETTINGS,
  createLogger,
} from '@omniscribe/shared';
import { TerminalService } from '../terminal/terminal.service';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { WorktreeService } from '../git/worktree.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { CliCommandService } from './cli-command.service';

/**
 * Extended session config with branch information
 */
export interface ExtendedSessionConfig extends SessionConfig {
  /** Git branch assigned to this session */
  branch?: string;
  /** Git worktree path if using worktrees */
  worktreePath?: string;
  /** Project path for grouping sessions */
  projectPath: string;
  /** Current status of the session */
  status: SessionStatus;
  /** Status message for display */
  statusMessage?: string;
  /** Whether the session needs user input */
  needsInputPrompt?: boolean;
  /** Whether session was launched with skip-permissions mode */
  skipPermissions?: boolean;
  /** Terminal session ID if launched */
  terminalSessionId?: number;
  /** Timestamp of last terminal output (for health checks) */
  lastOutputAt?: Date;
}

/**
 * Result of launching a session
 */
export interface LaunchSessionResult {
  success: boolean;
  terminalSessionId?: number;
  error?: string;
}

/**
 * Session status update payload
 */
export interface SessionStatusUpdate {
  sessionId: string;
  status: SessionStatus;
  message?: string;
  needsInputPrompt?: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = createLogger('SessionService');
  private sessions = new Map<string, ExtendedSessionConfig>();
  private sessionCounter = 0;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly terminalService: TerminalService,
    private readonly mcpWriterService: McpWriterService,
    private readonly mcpDiscoveryService: McpDiscoveryService,
    private readonly worktreeService: WorktreeService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService,
    private readonly cliCommandService: CliCommandService
  ) {
    // Listen for terminal close events to update session status
    this.eventEmitter.on('terminal.closed', this.handleTerminalClosed.bind(this));

    // Listen for terminal output to track last output time (for health checks)
    this.eventEmitter.on('terminal.output', (event: { sessionId: number; data: string }) => {
      this.updateLastOutput(event.sessionId);
    });
  }

  /**
   * Handle terminal closed events
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
        session.terminalSessionId = undefined;

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
    options?: Partial<CreateSessionOptions>
  ): ExtendedSessionConfig {
    const id = `session-${++this.sessionCounter}-${Date.now()}`;
    const now = new Date();

    const session: ExtendedSessionConfig = {
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
    };

    this.sessions.set(id, session);
    this.logger.info(`Created session ${id} (mode: ${mode}, project: ${projectPath})`);

    this.eventEmitter.emit('session.created', session);

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
  ): ExtendedSessionConfig | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
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

    this.eventEmitter.emit('session.status', statusUpdate);

    return session;
  }

  /**
   * Update the last output timestamp for a session (identified by terminal session ID).
   * Used by health checks to determine output recency.
   * @param terminalSessionId The terminal PTY session ID
   */
  updateLastOutput(terminalSessionId: number): void {
    // Find the session that owns this terminal
    for (const session of this.sessions.values()) {
      if (session.terminalSessionId === terminalSessionId) {
        session.lastOutputAt = new Date();
        return;
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
  ): ExtendedSessionConfig | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    session.branch = branch;
    session.worktreePath = worktreePath;
    session.lastActiveAt = new Date();

    // Emit status update to notify about branch assignment
    this.eventEmitter.emit('session.status', {
      sessionId,
      status: session.status,
      message: `Branch assigned: ${branch}`,
    });

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
      session.terminalSessionId = undefined;
    }

    // Cleanup worktree if auto-cleanup is enabled
    if (session.worktreePath) {
      const preferences = this.workspaceService.getPreferences();
      const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;

      if (worktreeSettings.autoCleanup) {
        try {
          await this.worktreeService.cleanup(session.projectPath, session.worktreePath);
          this.logger.log(
            `Cleaned up worktree at ${session.worktreePath} for session ${sessionId}`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to cleanup worktree for session ${sessionId}: ${errorMessage}`);
          // Continue with session removal even if worktree cleanup fails
        }
      }
    }

    // Note: We intentionally don't remove the omniscribe MCP entry from .mcp.json
    // because other sessions may still be running and need it, plus it's useful
    // to keep it there for future sessions

    this.sessions.delete(sessionId);

    this.eventEmitter.emit('session.removed', { sessionId });

    return true;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): ExtendedSessionConfig | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAll(): ExtendedSessionConfig[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get all sessions that have an active terminal (running sessions).
   * Done/Error sessions without terminals are NOT counted.
   */
  getRunningSessions(): ExtendedSessionConfig[] {
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
  getIdleSessions(): ExtendedSessionConfig[] {
    return this.getRunningSessions().filter(
      session => session.status === 'idle' || session.status === 'needs_input'
    );
  }

  /**
   * Get sessions for a specific project
   */
  getForProject(projectPath: string): ExtendedSessionConfig[] {
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
   * Launch a session by spawning the appropriate AI CLI in a terminal
   * @param sessionId The session ID to launch
   * @param projectPath The project directory path
   * @param worktreePath The worktree directory (working directory for the CLI)
   * @param aiMode The AI mode determining which CLI to spawn
   * @returns Launch result with terminal session ID or error
   */
  async launchSession(
    sessionId: string,
    projectPath: string,
    worktreePath: string,
    aiMode: AiMode
  ): Promise<LaunchSessionResult> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      };
    }

    // Check if session already has an active terminal
    if (session.terminalSessionId !== undefined) {
      if (this.terminalService.hasSession(session.terminalSessionId)) {
        return {
          success: false,
          error: 'Session already has an active terminal',
        };
      }
      // Terminal no longer exists, clear the reference
      session.terminalSessionId = undefined;
    }

    // Update status to connecting
    this.updateStatus(sessionId, 'connecting', 'Starting AI session...');

    try {
      // Discover all available MCP servers for this project
      const allServers = await this.mcpDiscoveryService.discoverServers(projectPath);
      this.logger.log(`Discovered ${allServers.length} MCP servers for session ${sessionId}`);

      // Write MCP config with all discovered servers
      await this.mcpWriterService.writeConfig(worktreePath, sessionId, projectPath, allServers);

      this.logger.log(`MCP config written to ${worktreePath}/.mcp.json`);

      // Get CLI configuration for the AI mode
      const cliConfig = this.cliCommandService.getCliConfig(aiMode, session);

      // Generate project hash for MCP status file identification
      const projectHash = this.mcpWriterService.generateProjectHash(projectPath);

      // Build environment variables
      // IMPORTANT: OMNISCRIBE_SESSION_ID and OMNISCRIBE_PROJECT_HASH are passed here
      // via shell environment (NOT in .mcp.json) to avoid race conditions when
      // multiple sessions share the same .mcp.json file. The MCP server inherits
      // these from the shell process that launched Claude CLI.
      const env: Record<string, string> = {
        OMNISCRIBE_SESSION_ID: sessionId,
        OMNISCRIBE_PROJECT_HASH: projectHash,
        OMNISCRIBE_PROJECT_PATH: projectPath,
        OMNISCRIBE_WORKTREE_PATH: worktreePath,
        OMNISCRIBE_AI_MODE: aiMode,
      };

      // Add model if specified
      if (session.model) {
        env.OMNISCRIBE_MODEL = session.model;
      }

      this.logger.log(
        `Launching session ${sessionId}: ${cliConfig.command} ${cliConfig.args.join(' ')} in ${worktreePath}`
      );

      // Spawn the terminal with the AI CLI
      const terminalSessionId = this.terminalService.spawnCommand(
        cliConfig.command,
        cliConfig.args,
        worktreePath,
        env,
        sessionId // Link terminal to session
      );

      // Update session with terminal reference
      session.terminalSessionId = terminalSessionId;
      session.worktreePath = worktreePath;
      session.lastActiveAt = new Date();

      // Update status to idle (session is waiting for user input)
      // MCP will report actual status (working/planning) when user sends a prompt
      this.updateStatus(
        sessionId,
        'idle',
        `Running ${this.cliCommandService.getAiModeName(aiMode)}`
      );

      this.logger.log(`Session ${sessionId} launched with terminal ${terminalSessionId}`);

      return {
        success: true,
        terminalSessionId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Failed to launch session ${sessionId}: ${errorMessage}`);

      this.updateStatus(sessionId, 'error', `Launch failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
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
      session.terminalSessionId = undefined;
      return false;
    }

    this.updateStatus(sessionId, 'disconnected', 'Stopping session...');

    await this.terminalService.kill(terminalId);

    session.terminalSessionId = undefined;
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
