import { Injectable } from '@nestjs/common';
import * as os from 'os';
import {
  CustomCommand,
  CustomCommandInput,
  CustomCommandUpdate,
  MAX_CONCURRENT_SESSIONS,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { TerminalService } from '../terminal';
import { SessionService, SessionLauncherService } from '../session';
import { WorkspaceService } from './workspace.service';

/**
 * Outcome of a successful execute call. Carries the new session id so the
 * gateway can return it to the caller and the renderer can focus the tile.
 */
export interface CustomCommandExecuteResult {
  sessionId: string;
  terminalSessionId: number;
}

/**
 * Per-project user-defined custom commands.
 *
 * Persistence is delegated to WorkspaceService (see projectCustomCommands).
 * Execution spawns a fresh plain-mode Omniscribe session in the project's
 * directory and writes the command into its PTY — the new session shows up
 * as a normal tile with full lifecycle support.
 */
@Injectable()
export class CustomCommandService {
  private readonly logger = createLogger('CustomCommandService');
  private readonly isWindows = os.platform() === 'win32';
  /**
   * Delay before writing the command into a freshly-spawned PTY. Gives the
   * shell time to print its prompt so the first characters of the command
   * are not swallowed.
   */
  private static readonly POST_LAUNCH_WRITE_DELAY_MS = 500;

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly sessionService: SessionService,
    private readonly sessionLauncher: SessionLauncherService,
    private readonly terminalService: TerminalService
  ) {}

  list(projectPath: string): CustomCommand[] {
    return this.workspaceService.getProjectCustomCommands(projectPath);
  }

  create(projectPath: string, input: CustomCommandInput): CustomCommand {
    const validation = validateInput(input);
    if (validation) throw new Error(validation);
    const command = this.workspaceService.addProjectCustomCommand(projectPath, {
      label: input.label.trim(),
      icon: input.icon.trim() || 'Terminal',
      command: input.command,
    });
    this.logger.debug(`Created custom command ${command.id} for ${projectPath}`);
    return command;
  }

  update(projectPath: string, id: string, updates: CustomCommandUpdate): CustomCommand | null {
    const sanitized: CustomCommandUpdate = {};
    if (updates.label !== undefined) {
      const label = updates.label.trim();
      if (!label) throw new Error('Label cannot be empty');
      sanitized.label = label;
    }
    if (updates.icon !== undefined) {
      sanitized.icon = updates.icon.trim() || 'Terminal';
    }
    if (updates.command !== undefined) {
      if (!updates.command.trim()) throw new Error('Command cannot be empty');
      sanitized.command = updates.command;
    }
    const result = this.workspaceService.updateProjectCustomCommand(projectPath, id, sanitized);
    if (result) this.logger.debug(`Updated custom command ${id} for ${projectPath}`);
    return result;
  }

  remove(projectPath: string, id: string): boolean {
    const removed = this.workspaceService.removeProjectCustomCommand(projectPath, id);
    if (removed) this.logger.debug(`Removed custom command ${id} for ${projectPath}`);
    return removed;
  }

  /**
   * Spawn a fresh plain-mode session in the project's directory and write the
   * stored command into the new PTY. The session shows up as a normal tile so
   * the user can interact with it after the command completes.
   */
  async execute(projectPath: string, id: string): Promise<CustomCommandExecuteResult> {
    const command = this.workspaceService.getProjectCustomCommand(projectPath, id);
    if (!command) {
      throw new Error(`Custom command not found: ${id}`);
    }

    // Guard against blowing past the global session limit — same check the
    // session gateway applies for `session:create`.
    const running = this.sessionService.getRunningSessions();
    if (running.length >= MAX_CONCURRENT_SESSIONS) {
      throw new Error(
        `Session limit reached (${running.length}/${MAX_CONCURRENT_SESSIONS}). ` +
          'Close a session to start a new one.'
      );
    }

    const session = this.sessionService.create('plain', projectPath, {
      name: command.label,
      workingDirectory: projectPath,
    });

    let launchResult;
    try {
      launchResult = await this.sessionLauncher.launchSession(
        session.id,
        projectPath,
        projectPath,
        'plain'
      );
    } catch (error) {
      // Best effort cleanup so we don't leave a phantom session behind.
      await this.safeRemove(session.id);
      throw error;
    }

    if (!launchResult.success || launchResult.terminalSessionId === undefined) {
      await this.safeRemove(session.id);
      throw new Error(launchResult.error ?? 'Failed to launch custom command session');
    }

    const terminalSessionId = launchResult.terminalSessionId;
    const newline = this.isWindows ? '\r\n' : '\n';
    const payload = `${command.command}${newline}`;

    // Wait briefly so the shell has a chance to print its prompt before we
    // inject input. Without this, cmd.exe and some POSIX shells can swallow
    // the first characters of the command.
    setTimeout(() => {
      try {
        if (this.terminalService.hasSession(terminalSessionId)) {
          this.terminalService.write(terminalSessionId, payload);
        } else {
          this.logger.warn(`Terminal ${terminalSessionId} closed before command could be written`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to write custom command into terminal ${terminalSessionId}: ${extractErrorMessage(error)}`
        );
      }
    }, CustomCommandService.POST_LAUNCH_WRITE_DELAY_MS);

    this.logger.info(
      `Executed custom command ${id} (${command.label}) in session ${session.id} (terminal ${terminalSessionId})`
    );

    return { sessionId: session.id, terminalSessionId };
  }

  private async safeRemove(sessionId: string): Promise<void> {
    try {
      await this.sessionService.remove(sessionId);
    } catch (error) {
      this.logger.warn(
        `Failed to clean up session ${sessionId} after launch failure: ${extractErrorMessage(error)}`
      );
    }
  }
}

/**
 * Validate a user-supplied custom command. Returns an error message when
 * invalid, or null when OK. Trimming is applied separately by the caller.
 */
function validateInput(input: CustomCommandInput): string | null {
  if (!input || typeof input !== 'object') return 'Invalid command payload';
  if (typeof input.label !== 'string' || !input.label.trim()) return 'Label is required';
  if (typeof input.icon !== 'string') return 'Icon is required';
  if (typeof input.command !== 'string' || !input.command.trim()) return 'Command is required';
  if (input.label.length > 120) return 'Label is too long (max 120 characters)';
  if (input.command.length > 8000) return 'Command is too long (max 8000 characters)';
  return null;
}
