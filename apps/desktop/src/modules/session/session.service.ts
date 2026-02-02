import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as os from 'os';
import {
  SessionConfig,
  SessionStatus,
  AiMode,
  CreateSessionOptions,
} from '@omniscribe/shared';
import { TerminalService } from '../terminal/terminal.service';

/**
 * AI CLI command configuration for each mode
 */
interface AiCliConfig {
  command: string;
  args: string[];
}

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
  /** Terminal session ID if launched */
  terminalSessionId?: number;
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
  private readonly logger = new Logger(SessionService.name);
  private sessions = new Map<string, ExtendedSessionConfig>();
  private sessionCounter = 0;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly terminalService: TerminalService
  ) {
    // Listen for terminal close events to update session status
    this.eventEmitter.on(
      'terminal.closed',
      this.handleTerminalClosed.bind(this)
    );
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

        this.logger.log(
          `Session ${event.externalId} terminal closed (exit=${event.exitCode})`
        );
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
   * Remove a session
   */
  remove(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

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
   * Get sessions for a specific project
   */
  getForProject(projectPath: string): ExtendedSessionConfig[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.projectPath === projectPath
    );
  }

  /**
   * Remove all sessions for a project
   */
  removeForProject(projectPath: string): number {
    const sessionsToRemove = this.getForProject(projectPath);

    for (const session of sessionsToRemove) {
      this.remove(session.id);
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
  launchSession(
    sessionId: string,
    projectPath: string,
    worktreePath: string,
    aiMode: AiMode
  ): LaunchSessionResult {
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
      // Get CLI configuration for the AI mode
      const cliConfig = this.getAiCliConfig(aiMode, session);

      // Build environment variables
      const env: Record<string, string> = {
        OMNISCRIBE_SESSION_ID: sessionId,
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

      // Update status to active
      this.updateStatus(
        sessionId,
        'active',
        `Running ${this.getAiModeName(aiMode)}`
      );

      this.logger.log(
        `Session ${sessionId} launched with terminal ${terminalSessionId}`
      );

      return {
        success: true,
        terminalSessionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to launch session ${sessionId}: ${errorMessage}`
      );

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
      return false;
    }

    if (session.terminalSessionId === undefined) {
      return false;
    }

    const terminalId = session.terminalSessionId;

    if (!this.terminalService.hasSession(terminalId)) {
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

  /**
   * Get the CLI configuration for a given AI mode
   */
  private getAiCliConfig(
    aiMode: AiMode,
    session: ExtendedSessionConfig
  ): AiCliConfig {
    switch (aiMode) {
      case 'claude':
        return this.getClaudeCliConfig(session);

      case 'gemini':
        return this.getGeminiCliConfig(session);

      case 'openai':
        return this.getOpenAiCliConfig(session);

      case 'local':
      case 'custom':
      default:
        return this.getShellConfig();
    }
  }

  /**
   * Get Claude CLI configuration
   */
  private getClaudeCliConfig(session: ExtendedSessionConfig): AiCliConfig {
    const args: string[] = [];

    // Add model flag if specified
    if (session.model) {
      args.push('--model', session.model);
    }

    // Add system prompt if specified
    if (session.systemPrompt) {
      args.push('--system-prompt', session.systemPrompt);
    }

    return {
      command: 'claude',
      args,
    };
  }

  /**
   * Get Gemini CLI configuration
   */
  private getGeminiCliConfig(session: ExtendedSessionConfig): AiCliConfig {
    const args: string[] = [];

    // Add model flag if specified
    if (session.model) {
      args.push('--model', session.model);
    }

    return {
      command: 'gemini',
      args,
    };
  }

  /**
   * Get OpenAI/Codex CLI configuration
   */
  private getOpenAiCliConfig(session: ExtendedSessionConfig): AiCliConfig {
    const args: string[] = [];

    // Add model flag if specified
    if (session.model) {
      args.push('--model', session.model);
    }

    return {
      command: 'codex',
      args,
    };
  }

  /**
   * Get shell configuration for local/plain mode
   */
  private getShellConfig(): AiCliConfig {
    if (os.platform() === 'win32') {
      return {
        command: process.env.COMSPEC || 'cmd.exe',
        args: [],
      };
    }

    return {
      command: process.env.SHELL || '/bin/bash',
      args: ['-l'], // Login shell
    };
  }

  /**
   * Get human-readable name for AI mode
   */
  private getAiModeName(aiMode: AiMode): string {
    switch (aiMode) {
      case 'claude':
        return 'Claude';
      case 'gemini':
        return 'Gemini';
      case 'openai':
        return 'OpenAI Codex';
      case 'local':
        return 'Local Shell';
      case 'custom':
        return 'Custom';
      default:
        return 'Unknown';
    }
  }
}
