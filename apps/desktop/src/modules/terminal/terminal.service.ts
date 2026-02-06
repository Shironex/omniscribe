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
const CHUNKED_WRITE_THRESHOLD = 1000;
const CHUNK_SIZE = 100;

// Environment variable allowlist for spawned terminal processes.
// Only these variables are forwarded from the host process.env to child terminals.
const ENV_ALLOWLIST: string[] = [
  // Shell basics
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'LC_COLLATE',
  'LC_MONETARY',
  'LC_NUMERIC',
  'LC_TIME',
  // Path resolution
  'PATH',
  // Windows platform
  'COMSPEC',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES',
  'USERPROFILE',
  // Temp directories
  'TMPDIR',
  'TMP',
  'TEMP',
  // macOS-specific
  'COMMAND_MODE',
  '__CF_USER_TEXT_ENCODING',
  // Display (Linux/X11/Wayland)
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
  'XDG_SESSION_TYPE',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'DBUS_SESSION_BUS_ADDRESS',
  // SSH
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  // Development tools (version managers, package managers)
  'NVM_DIR',
  'NVM_BIN',
  'NVM_INC',
  'VOLTA_HOME',
  'FNM_DIR',
  'FNM_MULTISHELL_PATH',
  'PNPM_HOME',
  'BUN_INSTALL',
  'GOPATH',
  'GOROOT',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'PYENV_ROOT',
  'RBENV_ROOT',
  'ASDF_DIR',
  'ASDF_DATA_DIR',
  'HOMEBREW_PREFIX',
  'HOMEBREW_CELLAR',
  'HOMEBREW_REPOSITORY',
  // Editor
  'EDITOR',
  'VISUAL',
  'TERM',
  'COLORTERM',
  // Git
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  // Proxy
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
];

// Patterns that must NEVER be passed to spawned processes, even if somehow in the allowlist.
const ENV_BLOCKLIST_PATTERNS: RegExp[] = [
  /^ELECTRON_/i,
  /^NODE_OPTIONS$/i,
  /^NODE_EXTRA_CA_CERTS$/i,
  /SECRET/i,
  /PASSWORD/i,
  /TOKEN/i,
  /CREDENTIAL/i,
  /API_KEY/i,
  /PRIVATE_KEY/i,
];

/**
 * Build a sanitized environment for spawned terminal processes.
 * Only allowlisted variables from process.env are included, and all variables
 * (including caller-provided extras) are filtered through the blocklist.
 */
function buildSafeEnv(extra?: Record<string, string>): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined && !ENV_BLOCKLIST_PATTERNS.some(p => p.test(key))) {
      safeEnv[key] = value;
    }
  }
  if (extra) {
    // Extra env vars from callers (e.g., session-specific vars) are passed through
    // but still filtered by blocklist
    for (const [key, value] of Object.entries(extra)) {
      if (!ENV_BLOCKLIST_PATTERNS.some(p => p.test(key))) {
        safeEnv[key] = value;
      }
    }
  }
  return safeEnv;
}

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

    // Build environment - allowlist approach for security
    const finalEnv: Record<string, string> = {
      ...buildSafeEnv(env),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM,
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
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
      writeChain: Promise.resolve(),
      paused: false,
    };

    this.sessions.set(sessionId, session);
    this.logger.debug(`[spawnCommand] Session ${sessionId} stored in sessions map`);

    // Handle output with batching for performance
    ptyProcess.onData((data: string) => {
      // Shutdown guard: prevent processing during shutdown
      if (this.isShuttingDown) return;

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
      // Resume if paused to prevent deadlock during cleanup
      if (session.paused) {
        try {
          session.pty.resume();
        } catch {
          // Ignore resume errors during cleanup
        }
        session.paused = false;
      }
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
