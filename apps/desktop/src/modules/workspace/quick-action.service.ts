import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QuickAction } from '@omniscribe/shared';
import { TerminalService } from '../terminal/terminal.service';
import { GitService } from '../git/git.service';
import { SessionService } from '../session/session.service';

/**
 * Result of a quick action execution
 */
export interface QuickActionResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Payload for AI-related quick actions
 */
interface AiActionContext {
  sessionId: string;
  prompt: string;
  projectPath?: string;
}


/**
 * Service for executing quick actions
 */
@Injectable()
export class QuickActionService {
  private readonly logger = new Logger(QuickActionService.name);

  constructor(
    private readonly terminalService: TerminalService,
    private readonly gitService: GitService,
    private readonly sessionService: SessionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Execute a quick action
   * @param sessionId The session ID context (can be terminal session or AI session)
   * @param action The quick action to execute
   * @param context Additional context for the action (e.g., projectPath)
   */
  async executeAction(
    sessionId: string,
    action: QuickAction,
    context?: { projectPath?: string; terminalSessionId?: number },
  ): Promise<QuickActionResult> {
    this.logger.log(`Executing quick action: ${action.handler} (${action.id})`);

    try {
      switch (action.handler) {
        case 'terminal:execute':
          return await this.handleTerminalExecute(
            action.params as { command: string },
            context,
          );

        case 'git:commit-push':
          return await this.handleGitCommitPush(
            action.params as { message?: string },
            context,
          );

        case 'git:pull':
          return await this.handleGitPull(context);

        case 'ai:fix-errors':
          return await this.handleAiFixErrors(sessionId, context);

        case 'ai:explain':
          return await this.handleAiExplain(
            sessionId,
            action.params as { target?: string },
            context,
          );

        default:
          return {
            success: false,
            error: `Unknown handler: ${action.handler}`,
          };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Quick action failed: ${errorMessage}`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle terminal:execute action
   * Runs a command in a terminal session
   */
  private async handleTerminalExecute(
    params: { command: string },
    context?: { projectPath?: string; terminalSessionId?: number },
  ): Promise<QuickActionResult> {
    if (!params.command) {
      return {
        success: false,
        error: 'No command specified for terminal:execute',
      };
    }

    let terminalId = context?.terminalSessionId;

    // If no terminal session exists, spawn a new one
    if (!terminalId || !this.terminalService.hasSession(terminalId)) {
      terminalId = this.terminalService.spawn(context?.projectPath);
      this.logger.log(`Spawned new terminal session: ${terminalId}`);
    }

    // Write the command to the terminal (with newline to execute)
    this.terminalService.write(terminalId, `${params.command}\n`);

    // Emit event for tracking
    this.eventEmitter.emit('quickaction.executed', {
      handler: 'terminal:execute',
      terminalId,
      command: params.command,
    });

    return {
      success: true,
      message: `Executing command: ${params.command}`,
      data: {
        terminalId,
        command: params.command,
      },
    };
  }

  /**
   * Handle git:commit-push action
   * Stages all changes, commits, and pushes to remote
   */
  private async handleGitCommitPush(
    params: { message?: string },
    context?: { projectPath?: string },
  ): Promise<QuickActionResult> {
    const repoPath = context?.projectPath;

    if (!repoPath) {
      return {
        success: false,
        error: 'No project path specified for git:commit-push',
      };
    }

    // Check if it's a git repository
    const isRepo = await this.gitService.isGitRepository(repoPath);
    if (!isRepo) {
      return {
        success: false,
        error: 'Not a git repository',
      };
    }

    // Use terminal to execute git commands for interactive feedback
    const terminalId = this.terminalService.spawn(repoPath);

    // Generate commit message if not provided
    const commitMessage =
      params.message || `Auto-commit: ${new Date().toISOString()}`;

    // Stage all, commit, and push
    const commands = [
      'git add -A',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      'git push',
    ].join(' && ');

    this.terminalService.write(terminalId, `${commands}\n`);

    // Emit event for tracking
    this.eventEmitter.emit('quickaction.executed', {
      handler: 'git:commit-push',
      terminalId,
      repoPath,
      commitMessage,
    });

    return {
      success: true,
      message: 'Staging, committing, and pushing changes',
      data: {
        terminalId,
        repoPath,
        commitMessage,
      },
    };
  }

  /**
   * Handle git:pull action
   * Pulls latest changes from remote
   */
  private async handleGitPull(context?: {
    projectPath?: string;
  }): Promise<QuickActionResult> {
    const repoPath = context?.projectPath;

    if (!repoPath) {
      return {
        success: false,
        error: 'No project path specified for git:pull',
      };
    }

    // Check if it's a git repository
    const isRepo = await this.gitService.isGitRepository(repoPath);
    if (!isRepo) {
      return {
        success: false,
        error: 'Not a git repository',
      };
    }

    // Use terminal for interactive feedback
    const terminalId = this.terminalService.spawn(repoPath);

    this.terminalService.write(terminalId, 'git pull\n');

    // Emit event for tracking
    this.eventEmitter.emit('quickaction.executed', {
      handler: 'git:pull',
      terminalId,
      repoPath,
    });

    return {
      success: true,
      message: 'Pulling latest changes',
      data: {
        terminalId,
        repoPath,
      },
    };
  }

  /**
   * Handle ai:fix-errors action
   * Sends a prompt to the AI session to analyze and fix errors
   */
  private async handleAiFixErrors(
    sessionId: string,
    context?: { projectPath?: string },
  ): Promise<QuickActionResult> {
    const session = this.sessionService.get(sessionId);

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      };
    }

    const prompt =
      'Please analyze and fix any compilation errors, type errors, or linting issues in the current codebase. ' +
      'Focus on:\n' +
      '1. TypeScript/JavaScript type errors\n' +
      '2. ESLint warnings and errors\n' +
      '3. Build failures\n' +
      '4. Runtime errors if visible\n\n' +
      'Provide the fixes with clear explanations.';

    // Emit event to send prompt to AI session
    this.eventEmitter.emit('quickaction.ai.prompt', {
      sessionId,
      prompt,
      action: 'fix-errors',
      projectPath: context?.projectPath || session.projectPath,
    } as AiActionContext & { action: string });

    // Update session status
    this.sessionService.updateStatus(sessionId, 'thinking', 'Analyzing errors...');

    return {
      success: true,
      message: 'Sent fix-errors prompt to AI session',
      data: {
        sessionId,
        action: 'fix-errors',
      },
    };
  }

  /**
   * Handle ai:explain action
   * Sends a prompt to the AI session to explain selected code or concept
   */
  private async handleAiExplain(
    sessionId: string,
    params: { target?: string },
    context?: { projectPath?: string },
  ): Promise<QuickActionResult> {
    const session = this.sessionService.get(sessionId);

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      };
    }

    let prompt: string;

    if (params.target) {
      prompt =
        `Please explain the following code or concept in detail:\n\n${params.target}\n\n` +
        'Include:\n' +
        '1. What it does\n' +
        '2. How it works\n' +
        '3. Any important patterns or best practices used\n' +
        '4. Potential improvements or considerations';
    } else {
      prompt =
        'Please explain the current file or selected code. ' +
        'Provide a comprehensive overview including:\n' +
        '1. Purpose and functionality\n' +
        '2. Key components and their roles\n' +
        '3. Data flow and interactions\n' +
        '4. Any notable patterns or techniques used';
    }

    // Emit event to send prompt to AI session
    this.eventEmitter.emit('quickaction.ai.prompt', {
      sessionId,
      prompt,
      action: 'explain',
      projectPath: context?.projectPath || session.projectPath,
    } as AiActionContext & { action: string });

    // Update session status
    this.sessionService.updateStatus(sessionId, 'thinking', 'Generating explanation...');

    return {
      success: true,
      message: 'Sent explain prompt to AI session',
      data: {
        sessionId,
        action: 'explain',
        target: params.target,
      },
    };
  }
}
