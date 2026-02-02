import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as pty from 'node-pty';
import * as os from 'os';

interface PtySession {
  pty: pty.IPty;
  outputBuffer: string;
  flushTimer: NodeJS.Timeout | null;
  /** Session ID for external reference (e.g., Omniscribe session ID) */
  externalId?: string;
}

@Injectable()
export class TerminalService implements OnModuleDestroy {
  private sessions = new Map<number, PtySession>();
  private nextSessionId = 1;
  private readonly BATCH_INTERVAL_MS = 16; // ~60fps

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Spawn a new terminal session with a shell
   * @param cwd Working directory for the terminal
   * @param env Environment variables to pass to the terminal
   * @returns Session ID for the new terminal
   */
  spawn(cwd?: string, env?: Record<string, string>): number {
    // Determine shell based on platform
    const shell =
      os.platform() === 'win32'
        ? process.env.COMSPEC || 'cmd.exe'
        : process.env.SHELL || '/bin/bash';

    const shellArgs = os.platform() === 'win32' ? [] : [];

    return this.spawnCommand(shell, shellArgs, cwd, env);
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

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        ...env,
        TERM: 'xterm-256color',
      } as Record<string, string>,
    });

    const session: PtySession = {
      pty: ptyProcess,
      outputBuffer: '',
      flushTimer: null,
      externalId,
    };

    this.sessions.set(sessionId, session);

    // Handle output with batching for performance
    ptyProcess.onData((data: string) => {
      session.outputBuffer += data;

      if (!session.flushTimer) {
        session.flushTimer = setTimeout(() => {
          this.flushOutput(sessionId);
        }, this.BATCH_INTERVAL_MS);
      }
    });

    // Handle terminal exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.cleanup(sessionId);
      this.eventEmitter.emit('terminal.closed', {
        sessionId,
        externalId: session.externalId,
        exitCode,
        signal,
      });
    });

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
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Try graceful termination first (SIGTERM)
    if (os.platform() !== 'win32') {
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
        session.pty.kill('SIGKILL');
      }
    } else {
      // On Windows, just kill the process
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
