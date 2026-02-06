import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as pty from 'node-pty';
import * as os from 'os';
import { TERM_PROGRAM, createLogger } from '@omniscribe/shared';

// Performance constants
const OUTPUT_THROTTLE_MS = 4;
const OUTPUT_BATCH_SIZE = 4096; // 4KB chunks
const MAX_SCROLLBACK_SIZE = 50_000; // 50KB per terminal
const MAX_OUTPUT_BUFFER_SIZE = 100_000; // 100KB cap
const RESIZE_DEBOUNCE_MS = 150;
const CHUNKED_WRITE_THRESHOLD = 1000;
const CHUNK_SIZE = 100;

interface PtySession {
  pty: pty.IPty;
  outputBuffer: string;
  flushTimer: NodeJS.Timeout | null;
  /** Session ID for external reference (e.g., Omniscribe session ID) */
  externalId?: string;
  /** Accumulated scrollback for session restore */
  scrollbackBuffer: string;
  /** Whether a resize is currently being debounced */
  resizeInProgress: boolean;
  /** Timeout handle for resize debounce */
  resizeDebounceTimeout: NodeJS.Timeout | null;
  /** Promise chain for serialized writes */
  writeChain: Promise<void>;
  /** Whether this session has received its first resize */
  hasReceivedFirstResize: boolean;
}

@Injectable()
export class TerminalService implements OnModuleDestroy {
  private readonly logger = createLogger('TerminalService');
  private sessions = new Map<number, PtySession>();
  private nextSessionId = 1;
  private readonly isWindows = os.platform() === 'win32';
  private isShuttingDown = false;

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

    this.logger.debug(`[spawn] Detected shell: "${shell}"`);
    this.logger.debug(`[spawn] Shell args: ${JSON.stringify(shellArgs)}`);
    this.logger.debug(`[spawn] COMSPEC: ${process.env.COMSPEC}`);
    this.logger.debug(`[spawn] SHELL: ${process.env.SHELL}`);

    return this.spawnCommand(shell, shellArgs, cwd, env);
  }

  /**
   * Get appropriate shell arguments based on shell type
   */
  private getShellArgs(shell: string): string[] {
    const shellName =
      shell.toLowerCase().replace(/\\/g, '/').split('/').pop()?.replace('.exe', '') || '';

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

    this.logger.log(`[spawnCommand] Starting session ${sessionId}: "${command}"`);
    this.logger.debug(`[spawnCommand] Args: ${JSON.stringify(args)}`);
    this.logger.debug(`[spawnCommand] CWD: "${resolvedCwd}"`);
    this.logger.debug(`[spawnCommand] Platform: ${os.platform()}`);
    this.logger.debug(`[spawnCommand] ExternalId: ${externalId}`);

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
      this.logger.debug(`[spawnCommand] Using winpty (ConPTY disabled for Windows compatibility)`);
    }

    this.logger.debug(
      `[spawnCommand] PTY options: cols=${ptyOptions.cols}, rows=${ptyOptions.rows}, name=${ptyOptions.name}`
    );

    let ptyProcess: pty.IPty;
    try {
      this.logger.debug(`[spawnCommand] Calling pty.spawn()...`);
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
      scrollbackBuffer: '',
      resizeInProgress: false,
      resizeDebounceTimeout: null,
      writeChain: Promise.resolve(),
      hasReceivedFirstResize: false,
    };

    this.sessions.set(sessionId, session);
    this.logger.debug(`[spawnCommand] Session ${sessionId} stored in sessions map`);

    // Handle output with batching for performance
    ptyProcess.onData((data: string) => {
      // Shutdown guard: prevent processing during shutdown
      if (this.isShuttingDown) return;

      try {
        // Suppress output during resize (except first resize)
        if (session.resizeInProgress) return;

        session.outputBuffer += data;

        // Cap output buffer at MAX_OUTPUT_BUFFER_SIZE
        if (session.outputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
          session.outputBuffer = session.outputBuffer.slice(-MAX_OUTPUT_BUFFER_SIZE);
        }

        // Accumulate scrollback buffer
        session.scrollbackBuffer += data;
        if (session.scrollbackBuffer.length > MAX_SCROLLBACK_SIZE) {
          session.scrollbackBuffer = session.scrollbackBuffer.slice(-MAX_SCROLLBACK_SIZE);
        }

        if (!session.flushTimer) {
          session.flushTimer = setTimeout(() => {
            this.flushOutput(sessionId);
          }, OUTPUT_THROTTLE_MS);
        }
      } catch (dataError) {
        const errorMessage = dataError instanceof Error ? dataError.message : String(dataError);
        this.logger.error(`[onData] Error handling data for session ${sessionId}: ${errorMessage}`);
      }
    });

    // Handle terminal exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      // Shutdown guard: prevent processing during shutdown
      if (this.isShuttingDown) return;

      this.logger.log(`[onExit] Session ${sessionId} exited (code=${exitCode}, signal=${signal})`);

      this.cleanup(sessionId);
      this.eventEmitter.emit('terminal.closed', {
        sessionId,
        externalId: session.externalId,
        exitCode,
        signal,
      });
    });

    this.logger.debug(`[spawnCommand] Session ${sessionId} fully initialized, returning`);
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
   * Write data to a terminal session with serialized queue
   * @param sessionId The session to write to
   * @param data The data to write
   */
  write(sessionId: number, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Chain writes to prevent interleaving
    session.writeChain = session.writeChain.then(() => this.performWrite(session, data));
  }

  /**
   * Perform the actual write, chunking large data
   */
  private async performWrite(session: PtySession, data: string): Promise<void> {
    if (data.length <= CHUNKED_WRITE_THRESHOLD) {
      session.pty.write(data);
      return;
    }

    // Chunk large writes to prevent blocking
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      session.pty.write(chunk);
      // Yield to event loop between chunks
      if (i + CHUNK_SIZE < data.length) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }
  }

  /**
   * Resize a terminal session with deduplication
   * @param sessionId The session to resize
   * @param cols Number of columns
   * @param rows Number of rows
   */
  resize(sessionId: number, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Validate dimensions
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
      this.logger.warn(`[resize] Invalid dimensions for session ${sessionId}: ${cols}x${rows}`);
      return;
    }

    // Round to integers
    const roundedCols = Math.round(cols);
    const roundedRows = Math.round(rows);

    // Clear any pending resize debounce
    if (session.resizeDebounceTimeout) {
      clearTimeout(session.resizeDebounceTimeout);
      session.resizeDebounceTimeout = null;
    }

    // First resize should not suppress output (preserves initial prompt)
    const isFirstResize = !session.hasReceivedFirstResize;
    session.hasReceivedFirstResize = true;

    // Set resize in progress to suppress output noise (except first resize)
    if (!isFirstResize) {
      session.resizeInProgress = true;
    }

    session.pty.resize(roundedCols, roundedRows);

    // Clear resize-in-progress after debounce period
    if (!isFirstResize) {
      session.resizeDebounceTimeout = setTimeout(() => {
        session.resizeInProgress = false;
        session.resizeDebounceTimeout = null;
      }, RESIZE_DEBOUNCE_MS);
    }
  }

  /**
   * Kill a terminal session with graceful shutdown
   * @param sessionId The session to kill
   */
  async kill(sessionId: number): Promise<void> {
    this.logger.debug(`[kill] Called for session ${sessionId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[kill] Session ${sessionId} not found`);
      return;
    }

    this.logger.debug(`[kill] Killing session ${sessionId}, PID: ${session.pty.pid}`);

    // Try graceful termination first (SIGTERM)
    if (!this.isWindows) {
      this.logger.debug(`[kill] Sending SIGTERM to session ${sessionId}`);
      session.pty.kill('SIGTERM');

      // Wait for graceful shutdown, then force kill if needed
      const gracefulTimeout = new Promise<boolean>(resolve => {
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
        this.logger.debug(`[kill] Sending SIGKILL to session ${sessionId}`);
        session.pty.kill('SIGKILL');
      }
    } else {
      // On Windows, just kill the process
      this.logger.debug(`[kill] Windows kill for session ${sessionId}`);
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
   * Get scrollback buffer for a session
   * @param sessionId The session ID
   * @returns Scrollback data or null if session not found
   */
  getScrollback(sessionId: number): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.scrollbackBuffer || null;
  }

  /**
   * Flush buffered output for a session (chunk-based approach)
   */
  private flushOutput(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.outputBuffer.length > 0) {
      if (session.outputBuffer.length > OUTPUT_BATCH_SIZE) {
        // Send first chunk, reschedule for remainder
        const chunk = session.outputBuffer.slice(0, OUTPUT_BATCH_SIZE);
        session.outputBuffer = session.outputBuffer.slice(OUTPUT_BATCH_SIZE);

        this.eventEmitter.emit('terminal.output', {
          sessionId,
          data: chunk,
        });

        // Reschedule for remaining data
        session.flushTimer = setTimeout(() => {
          this.flushOutput(sessionId);
        }, OUTPUT_THROTTLE_MS);
        return;
      }

      // Small enough to send all at once
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
        if (session.outputBuffer.length > 0) {
          this.eventEmitter.emit('terminal.output', {
            sessionId,
            data: session.outputBuffer,
          });
          session.outputBuffer = '';
        }
        session.flushTimer = null;
      }
      if (session.resizeDebounceTimeout) {
        clearTimeout(session.resizeDebounceTimeout);
        session.resizeDebounceTimeout = null;
      }
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clean up all sessions on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    // Set shutdown guard BEFORE killing terminals
    this.isShuttingDown = true;

    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.kill(id)));
  }
}
