import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HealthLevel, createLogger } from '@omniscribe/shared';
import { TerminalService } from '../terminal/terminal.service';
import { SessionService, ExtendedSessionConfig } from '../session/session.service';

/** How often to run health checks (2 minutes) */
const HEALTH_CHECK_INTERVAL_MS = 120_000;

/** Threshold for "no output" degraded status when session is actively working */
const OUTPUT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Threshold for error state before marking as zombie */
const ERROR_STATE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/** Statuses that indicate the session should be producing output */
const WORKING_STATUSES = new Set(['working', 'executing', 'active', 'thinking']);

/** Statuses that indicate the session is idle/waiting (no output expected) */
const IDLE_STATUSES = new Set(['idle', 'needs_input', 'paused']);

@Injectable()
export class HealthService {
  private readonly logger = createLogger('HealthService');

  constructor(
    private readonly terminalService: TerminalService,
    private readonly sessionService: SessionService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /**
   * Periodic health check sweep.
   * Runs every 2 minutes, checks each session with a terminal for liveness.
   */
  @Interval(HEALTH_CHECK_INTERVAL_MS)
  checkHealth(): void {
    const sessions = this.sessionService.getAll();

    for (const session of sessions) {
      if (session.terminalSessionId === undefined) continue;

      try {
        const health = this.determineHealth(session);

        this.eventEmitter.emit('session.health', {
          sessionId: session.id,
          health: health.level,
          reason: health.reason,
        });

        if (health.level === 'failed') {
          this.cleanupZombie(session);
        }
      } catch (error) {
        this.logger.error(`Health check failed for session ${session.id}: ${error}`);
      }
    }
  }

  /**
   * Determine the health level of a session based on:
   * - PID liveness (signal 0)
   * - Output recency (5-minute threshold)
   * - Session status
   * - Backpressure state
   */
  private determineHealth(session: ExtendedSessionConfig): { level: HealthLevel; reason?: string } {
    const terminalSessionId = session.terminalSessionId!;

    // Check if terminal session still exists in the TerminalService map
    if (!this.terminalService.hasSession(terminalSessionId)) {
      return { level: 'failed', reason: 'Terminal session no longer exists' };
    }

    // Check if the PID is still alive
    const pid = this.terminalService.getPid(terminalSessionId);
    if (pid === undefined || !this.isProcessAlive(pid)) {
      return { level: 'failed', reason: 'Terminal process is not alive' };
    }

    // Check for persistent error state (> 2 minutes in error)
    if (session.status === 'error' && session.lastActiveAt) {
      const errorDuration = Date.now() - new Date(session.lastActiveAt).getTime();
      if (errorDuration > ERROR_STATE_THRESHOLD_MS) {
        return { level: 'failed', reason: 'Session in error state for over 2 minutes' };
      }
    }

    // Check for backpressure (degraded but not failed)
    if (this.terminalService.isPaused(terminalSessionId)) {
      return { level: 'degraded', reason: 'Terminal is under backpressure' };
    }

    // Check output recency for working sessions
    if (WORKING_STATUSES.has(session.status)) {
      const lastOutput = session.lastOutputAt ? new Date(session.lastOutputAt).getTime() : 0;
      const timeSinceOutput = Date.now() - lastOutput;

      if (lastOutput > 0 && timeSinceOutput > OUTPUT_STALE_THRESHOLD_MS) {
        return {
          level: 'degraded',
          reason: 'No output for 5+ minutes while in working state',
        };
      }
    }

    // Idle/waiting statuses or recent output = healthy
    if (IDLE_STATUSES.has(session.status) || session.lastOutputAt) {
      return { level: 'healthy' };
    }

    return { level: 'healthy' };
  }

  /**
   * Check if a process is alive by sending signal 0.
   * Signal 0 doesn't actually send a signal but checks if the process exists.
   * EPERM means the process exists but we lack permission -- still alive.
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      return error.code === 'EPERM';
    }
  }

  /**
   * Clean up a zombie session: kill terminal, mark as error, notify frontend.
   */
  private cleanupZombie(session: ExtendedSessionConfig): void {
    this.logger.warn(`Cleaning up zombie session ${session.id} (${session.name})`);

    // Kill the terminal if it still exists in the map
    if (
      session.terminalSessionId !== undefined &&
      this.terminalService.hasSession(session.terminalSessionId)
    ) {
      this.terminalService.kill(session.terminalSessionId).catch(err => {
        this.logger.error(`Failed to kill zombie terminal for session ${session.id}: ${err}`);
      });
    }

    // Mark session as error (do NOT auto-restart per design decision)
    this.sessionService.updateStatus(
      session.id,
      'error',
      'Terminal process terminated unexpectedly'
    );

    // Emit zombie cleanup event for frontend notification
    this.eventEmitter.emit('zombie.cleanup', {
      sessionId: session.id,
      sessionName: session.name,
      reason: 'Terminal process terminated unexpectedly',
    });
  }
}
