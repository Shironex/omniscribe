import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SessionConfig,
  SessionStatus,
  AiMode,
  CreateSessionOptions,
} from '@omniscribe/shared';

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
  private sessions = new Map<string, ExtendedSessionConfig>();
  private sessionCounter = 0;

  constructor(private readonly eventEmitter: EventEmitter2) {}

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
}
