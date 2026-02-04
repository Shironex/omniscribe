import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as pty from 'node-pty';
import * as os from 'os';
import { TERM_PROGRAM } from '@omniscribe/shared';

interface PtySession {
  pty: pty.IPty;
  outputBuffer: string;
  flushTimer: NodeJS.Timeout | null;
  /** Session ID for external reference (e.g., Omniscribe session ID) */
  externalId?: string;
}

@Injectable()
export class TerminalService implements OnModuleDestroy {
  private readonly logger = new Logger(TerminalService.name);
  private sessions = new Map<number, PtySession>();
  private nextSessionId = 1;
  private readonly BATCH_INTERVAL_MS = 16; // ~60fps
  private readonly isWindows = os.platform() === 'win32';

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Spawn a new terminal session with a shell
   * @param cwd Working directory for the terminal
   * @param env Environment variables to pass to the terminal
   * @returns Session ID for the new terminal
   */
  spawn(cwd?: string, env?: Record<string, string>): number {
    // Determine shell based on platform - match automaker's approach
    const shell = this.isWindows
      ? process.env.COMSPEC || 'cmd.exe'
      : process.env.SHELL || '/bin/bash';

    // Shell args - cmd.exe and PowerShell don't need --login
    // bash and zsh use --login for login shell behavior
    const shellArgs = this.getShellArgs(shell);

    this.logger.log(`[spawn] Detected shell: "${shell}"`);
    this.logger.log(`[spawn] Shell args: ${JSON.stringify(shellArgs)}`);
    this.logger.log(`[spawn] COMSPEC: ${process.env.COMSPEC}`);
    this.logger.log(`[spawn] SHELL: ${process.env.SHELL}`);

    return this.spawnCommand(shell, shellArgs, cwd, env);
  }

  /**
   * Get appropriate shell arguments based on shell type
   */
  private getShellArgs(shell: string): string[] {
    const shellName = shell.toLowerCase().replace(/\\/g, '/').split('/').pop()?.replace('.exe', '') || '';

    // PowerShell and cmd don't need --login
    if (shellName === 'powershell' || shellName === 'pwsh' || shellName === 'cmd') {
      return [];
    }
    // sh doesn't support --login in all implementations
    if (shellName === 'sh') {
      return [];
    }
    // bash, zsh, and other POSIX shells support --login
    return ['--login'];
  }

  /**
   * Spawn a new terminal session with a specific command
   * @param command The command/executable to run
   * @param args Arguments for the command
   * @param cwd Working directory for the terminal
   * @param env Environment variables to pass to the terminal
   * @param externalId Optional external session ID for reference
   * @returns Session ID for the new terminal
   */
  spawnCommand(
    command: string,
    args: string[] = [],
    cwd?: string,
    env?: Record<string, string>,
    externalId?: string
  ): number {
    const sessionId = this.nextSessionId++;
    const resolvedCwd = cwd || process.cwd();

    this.logger.log(`[spawnCommand] Starting session ${sessionId}`);
    this.logger.log(`[spawnCommand] Command: "${command}"`);
    this.logger.log(`[spawnCommand] Args: ${JSON.stringify(args)}`);
    this.logger.log(`[spawnCommand] CWD: "${resolvedCwd}"`);
    this.logger.log(`[spawnCommand] Platform: ${os.platform()}`);
    this.logger.log(`[spawnCommand] ExternalId: ${externalId}`);

    // Build environment - match automaker's approach
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    const finalEnv: Record<string, string> = {
      ...cleanEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM,
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
      ...env,
    };

    // Build pty options with Windows-specific settings
    const ptyOptions: pty.IPtyForkOptions = {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env: finalEnv,
    };

    // On Windows, always use winpty instead of ConPTY
    // ConPTY requires AttachConsole which fails in many contexts:
    // - Electron apps without a console
    // - VS Code integrated terminal
    // - Spawned from other applications
    // The error happens in a subprocess so we can't catch it - must proactively disable
    if (this.isWindows) {
      (ptyOptions as pty.IWindowsPtyForkOptions).useConpty = false;
      this.logger.log(`[spawnCommand] Using winpty (ConPTY disabled for Windows compatibility)`);
    }

    this.logger.log(`[spawnCommand] PTY options: cols=${ptyOptions.cols}, rows=${ptyOptions.rows}, name=${ptyOptions.name}`);

    let ptyProcess: pty.IPty;
    try {
      this.logger.log(`[spawnCommand] Calling pty.spawn()...`);
      ptyProcess = pty.spawn(command, args, ptyOptions);
      this.logger.log(`[spawnCommand] pty.spawn() succeeded, PID: ${ptyProcess.pid}`);
    } catch (spawnError) {
      const errorMessage = spawnError instanceof Error ? spawnError.message : String(spawnError);
      this.logger.error(`[spawnCommand] pty.spawn() FAILED: ${errorMessage}`);
      throw spawnError;
    }

    const session: PtySession = {
      pty: ptyProcess,
      outputBuffer: '',
      flushTimer: null,
      externalId,
    };

    this.sessions.set(sessionId, session);
    this.logger.log(`[spawnCommand] Session ${sessionId} stored in sessions map`);

    // Handle output with batching for performance
    ptyProcess.onData((data: string) => {
      // Log first few data events to debug
      if (session.outputBuffer.length < 500) {
        // this.logger.debug(`[onData] Session ${sessionId}: received ${data.length} bytes`);
      }

      try {
        session.outputBuffer += data;

        if (!session.flushTimer) {
          session.flushTimer = setTimeout(() => {
            this.flushOutput(sessionId);
          }, this.BATCH_INTERVAL_MS);
        }
      } catch (dataError) {
        const errorMessage = dataError instanceof Error ? dataError.message : String(dataError);
        this.logger.error(`[onData] Error handling data for session ${sessionId}: ${errorMessage}`);
      }
    });

    // Handle terminal exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.logger.log(`[onExit] Session ${sessionId} exited (code=${exitCode}, signal=${signal})`);

      this.cleanup(sessionId);
      this.eventEmitter.emit('terminal.closed', {
        sessionId,
        externalId: session.externalId,
        exitCode,
        signal,
      });
    });

    this.logger.log(`[spawnCommand] Session ${sessionId} fully initialized, returning`);
    return sessionId;
  }

  /**
   * Get the external ID associated with a terminal session
   * @param sessionId The terminal session ID
   * @returns The external ID if set, undefined otherwise
   */
  getExternalId(sessionId: number): string | undefined {
    return this.sessions.get(sessionId)?.externalId;
  }

  /**
   * Find a terminal session by its external ID
   * @param externalId The external session ID to search for
   * @returns The terminal session ID if found, undefined otherwise
   */
  findByExternalId(externalId: string): number | undefined {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.externalId === externalId) {
        return sessionId;
      }
    }
    return undefined;
  }

  /**
   * Write data to a terminal session
   * @param sessionId The session to write to
   * @param data The data to write
   */
  write(sessionId: number, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.write(data);
    }
  }

  /**
   * Resize a terminal session
   * @param sessionId The session to resize
   * @param cols Number of columns
   * @param rows Number of rows
   */
  resize(sessionId: number, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  /**
   * Kill a terminal session with graceful shutdown
   * @param sessionId The session to kill
   */
  async kill(sessionId: number): Promise<void> {
    this.logger.log(`[kill] Called for session ${sessionId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[kill] Session ${sessionId} not found`);
      return;
    }

    this.logger.log(`[kill] Killing session ${sessionId}, PID: ${session.pty.pid}`);

    // Try graceful termination first (SIGTERM)
    if (!this.isWindows) {
      this.logger.log(`[kill] Sending SIGTERM to session ${sessionId}`);
      session.pty.kill('SIGTERM');

      // Wait for graceful shutdown, then force kill if needed
      const gracefulTimeout = new Promise<boolean>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.sessions.has(sessionId)) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(false);
        }, 3000);
      });

      const gracefullyTerminated = await gracefulTimeout;

      if (!gracefullyTerminated && this.sessions.has(sessionId)) {
        // Force kill with SIGKILL
        this.logger.log(`[kill] Sending SIGKILL to session ${sessionId}`);
        session.pty.kill('SIGKILL');
      }
    } else {
      // On Windows, just kill the process
      this.logger.log(`[kill] Windows kill for session ${sessionId}`);
      session.pty.kill();
    }

    this.cleanup(sessionId);
  }

  /**
   * Check if a session exists
   * @param sessionId The session ID to check
   */
  hasSession(sessionId: number): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getSessionIds(): number[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Flush buffered output for a session
   */
  private flushOutput(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.outputBuffer.length > 0) {
      this.eventEmitter.emit('terminal.output', {
        sessionId,
        data: session.outputBuffer,
      });
      session.outputBuffer = '';
    }

    session.flushTimer = null;
  }

  /**
   * Clean up a session's resources
   */
  private cleanup(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.flushTimer) {
        clearTimeout(session.flushTimer);
        // Flush any remaining output before cleanup
        this.flushOutput(sessionId);
      }
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clean up all sessions on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.kill(id)));
  }
}
