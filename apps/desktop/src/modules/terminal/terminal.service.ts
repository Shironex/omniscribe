import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as pty from 'node-pty';
import * as os from 'os';
import { TERM_PROGRAM, createLogger, normalizePath } from '@omniscribe/shared';
import { InternalTerminalEvents } from '../shared/events';
import { buildSafeEnv } from '../shared/env-utils';
import { OscAgentDetector, OscTransition } from './osc-agent-detector';
import { ShellIntegrationService } from './shell-integration.service';

// Performance constants
const OUTPUT_THROTTLE_MS = 32; // ~30fps — frontend RAF batches at 60fps anyway
const OUTPUT_BATCH_SIZE = 65_536; // 64KB chunks — fewer, larger packets reduce backpressure noise
const MAX_SCROLLBACK_SIZE = 500_000; // 500KB per terminal — retained for session restore (join)
const MAX_OUTPUT_BUFFER_SIZE = 524_288; // 512KB cap — transient burst buffer for throttled output
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
  /** Promise chain for serialized writes */
  writeChain: Promise<void>;
  /** Whether the PTY stream is paused (backpressure) */
  paused: boolean;
  /** Per-PTY OSC agent-status detector, fed the raw data stream pre-batching */
  oscDetector: OscAgentDetector;
}

@Injectable()
export class TerminalService implements OnModuleDestroy {
  private readonly logger = createLogger('TerminalService');
  private sessions = new Map<number, PtySession>();
  private nextSessionId = 1;
  private readonly isWindows = os.platform() === 'win32';
  private isShuttingDown = false;
  /** Timestamp of the last OSC-detector error warning (for rate limiting) */
  private lastOscWarnAt = 0;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly shellIntegration: ShellIntegrationService
  ) {}

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
   * Get appropriate shell arguments based on shell type.
   *
   * Use `-i` (interactive) rather than `--login`. Both VS Code and iTerm
   * default to interactive shells, which source `~/.bashrc` / `~/.zshrc`
   * — the files where most users put their PATH and aliases. `--login`
   * sources `~/.bash_profile` / `~/.zprofile` instead, which is the
   * convention for true terminal sessions but surprises users who
   * configured their dev env in the rc-file.
   *
   * Release note: users who only put PATH or aliases in `~/.bash_profile`
   * or `~/.zprofile` will need to add a sourcing line in `~/.bashrc` /
   * `~/.zshrc` (or move their config), matching VS Code / iTerm behavior.
   */
  private getShellArgs(shell: string): string[] {
    const shellName =
      normalizePath(shell.toLowerCase()).split('/').pop()?.replace('.exe', '') || '';

    // PowerShell and cmd don't take POSIX shell flags.
    if (shellName === 'powershell' || shellName === 'pwsh' || shellName === 'cmd') {
      return [];
    }
    // sh doesn't honor -i in all implementations and breaks if forced.
    if (shellName === 'sh') {
      return [];
    }
    // bash, zsh, and other POSIX shells.
    return ['-i'];
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

    // Build environment - allowlist approach for security
    const finalEnv: Record<string, string> = {
      ...buildSafeEnv(env),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM,
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
    };

    // App-owned shell integration for PLAIN shells (zsh/bash). Runs AFTER
    // buildSafeEnv so our trusted ZDOTDIR / OMNISCRIBE_* survive the env filter
    // (buildSafeEnv blocks ZDOTDIR from untrusted callers; the app setting its
    // own is the intended trust boundary). For non-zsh/bash commands — including
    // AI provider CLIs (claude/codex) — decorate() returns the spawn unchanged,
    // so AI sessions keep their hook-based arming. Failure-safe: any error
    // inside decorate() falls back to the original command/args/env.
    const decorated = this.shellIntegration.decorate(command, args, finalEnv);

    // Build pty options with Windows-specific settings
    const ptyOptions: pty.IPtyForkOptions = {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env: decorated.env,
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
      ptyProcess = pty.spawn(decorated.command, decorated.args, ptyOptions);
      this.logger.log(`[spawnCommand] pty.spawn() succeeded, PID: ${ptyProcess.pid}`);
    } catch (spawnError) {
      this.logger.error('[spawnCommand] pty.spawn() FAILED', spawnError);
      throw spawnError;
    }

    const session: PtySession = {
      pty: ptyProcess,
      outputBuffer: '',
      flushTimer: null,
      externalId,
      scrollbackBuffer: '',
      writeChain: Promise.resolve(),
      paused: false,
      oscDetector: new OscAgentDetector(),
    };

    this.sessions.set(sessionId, session);
    this.logger.debug(`[spawnCommand] Session ${sessionId} stored in sessions map`);

    // Handle output with batching for performance
    ptyProcess.onData((data: string) => {
      // Shutdown guard: prevent processing during shutdown
      if (this.isShuttingDown) return;

      // Feed the OSC agent detector the RAW data stream BEFORE batching, so
      // OSC sequences are never split or dropped by the output coalescer.
      // Isolated from the output path: a detector fault must never break
      // terminal output.
      this.feedOscDetector(sessionId, session, data);

      try {
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
        this.logger.error(`[onData] Error handling data for session ${sessionId}`, dataError);
      }
    });

    // Handle terminal exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      // Shutdown guard: prevent processing during shutdown
      if (this.isShuttingDown) return;

      this.logger.log(`[onExit] Session ${sessionId} exited (code=${exitCode}, signal=${signal})`);

      // Report `exited` from the detector if an agent was still armed, so the
      // session doesn't leave a stale working/needs_input state behind.
      this.finishOscDetector(sessionId, session);

      this.cleanup(sessionId);
      this.eventEmitter.emit(InternalTerminalEvents.CLOSED, {
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
   * Feed a raw PTY data chunk to the session's OSC agent detector and emit an
   * internal `terminal.oscSignal` event for each detected transition.
   *
   * Runs on the hot data path before batching. Must never throw — a detector
   * fault is swallowed (rate-limited warn) so terminal output keeps flowing.
   */
  private feedOscDetector(sessionId: number, session: PtySession, data: string): void {
    try {
      session.oscDetector.process(data, (signal: OscTransition) => {
        this.eventEmitter.emit(InternalTerminalEvents.OSC_SIGNAL, {
          terminalId: sessionId,
          signal,
        });
      });
    } catch (err) {
      this.warnOscDetector(sessionId, err);
    }
  }

  /**
   * Flush a final `exited` transition from the detector when the PTY closes.
   * Isolated and fault-tolerant like {@link feedOscDetector}.
   */
  private finishOscDetector(sessionId: number, session: PtySession): void {
    try {
      session.oscDetector.finish((signal: OscTransition) => {
        this.eventEmitter.emit(InternalTerminalEvents.OSC_SIGNAL, {
          terminalId: sessionId,
          signal,
        });
      });
    } catch (err) {
      this.warnOscDetector(sessionId, err);
    }
  }

  /** Rate-limited warning for OSC-detector faults (at most once per 5s). */
  private warnOscDetector(sessionId: number, err: unknown): void {
    const now = Date.now();
    if (now - this.lastOscWarnAt > 5000) {
      this.lastOscWarnAt = now;
      this.logger.warn(`[osc] Detector error for session ${sessionId}`, err);
    }
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

    // Chain writes to prevent interleaving; catch to keep the chain alive on error
    session.writeChain = session.writeChain
      .then(() => this.performWrite(session, data))
      .catch(err => {
        this.logger.error(`[write] Failed for session ${sessionId}:`, err);
      });
  }

  /**
   * Perform the actual write, chunking large data
   */
  private async performWrite(session: PtySession, data: string): Promise<void> {
    if (this.isShuttingDown) return;

    if (data.length <= CHUNKED_WRITE_THRESHOLD) {
      session.pty.write(data);
      return;
    }

    // Chunk large writes to prevent blocking
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      if (this.isShuttingDown) return;
      const chunk = data.slice(i, i + CHUNK_SIZE);
      session.pty.write(chunk);
      // Yield to event loop between chunks
      if (i + CHUNK_SIZE < data.length) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
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
    if (!session) return;

    // Validate dimensions
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
      this.logger.warn(`[resize] Invalid dimensions for session ${sessionId}: ${cols}x${rows}`);
      return;
    }

    // Round to integers
    const roundedCols = Math.round(cols);
    const roundedRows = Math.round(rows);

    session.pty.resize(roundedCols, roundedRows);
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
   * Pause PTY output stream for backpressure management.
   * When paused, the PTY buffers output internally (kernel-level flow control).
   * @param sessionId The session to pause
   */
  pause(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.paused) return;

    session.pty.pause();
    session.paused = true;
    this.logger.debug(`[pause] Paused PTY for session ${sessionId}`);
  }

  /**
   * Resume PTY output stream after backpressure clears.
   * @param sessionId The session to resume
   */
  resume(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.paused) return;

    session.pty.resume();
    session.paused = false;
    this.logger.debug(`[resume] Resumed PTY for session ${sessionId}`);

    // Restart flush if data accumulated during pause
    if (session.outputBuffer.length > 0 && !session.flushTimer) {
      session.flushTimer = setTimeout(() => {
        this.flushOutput(sessionId);
      }, OUTPUT_THROTTLE_MS);
    }
  }

  /**
   * Check if a terminal is currently paused due to backpressure.
   * @param sessionId The session to check
   */
  isPaused(sessionId: number): boolean {
    return this.sessions.get(sessionId)?.paused ?? false;
  }

  /**
   * Get the PID of a terminal process.
   * @param sessionId The session to query
   * @returns The PID if session exists, undefined otherwise
   */
  getPid(sessionId: number): number | undefined {
    return this.sessions.get(sessionId)?.pty.pid;
  }

  /**
   * Flush buffered output for a session (chunk-based approach)
   */
  private flushOutput(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Stop flushing while paused — data stays in buffer until resume
    if (session.paused) {
      session.flushTimer = null;
      return;
    }

    if (session.outputBuffer.length > 0) {
      if (session.outputBuffer.length > OUTPUT_BATCH_SIZE) {
        // Send first chunk, reschedule for remainder
        const chunk = session.outputBuffer.slice(0, OUTPUT_BATCH_SIZE);
        session.outputBuffer = session.outputBuffer.slice(OUTPUT_BATCH_SIZE);

        this.eventEmitter.emit(InternalTerminalEvents.OUTPUT, {
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
      this.eventEmitter.emit(InternalTerminalEvents.OUTPUT, {
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
      // Resume if paused to prevent deadlock during cleanup
      if (session.paused) {
        try {
          session.pty.resume();
        } catch {
          this.logger.debug('Resume error during cleanup (expected)');
        }
        session.paused = false;
      }
      if (session.flushTimer) {
        clearTimeout(session.flushTimer);
        // Flush any remaining output before cleanup
        if (session.outputBuffer.length > 0) {
          this.eventEmitter.emit(InternalTerminalEvents.OUTPUT, {
            sessionId,
            data: session.outputBuffer,
          });
          session.outputBuffer = '';
        }
        session.flushTimer = null;
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
