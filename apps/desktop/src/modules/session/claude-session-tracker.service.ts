import { Injectable, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  SessionHistoryEntry,
  ActiveSessionSnapshot,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { WorkspaceService } from '../workspace';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { SessionService } from './session.service';
import { InternalSessionEvents } from '../shared/events';
import { BackendSessionConfig } from './types';

@Injectable()
export class ClaudeSessionTrackerService implements OnModuleDestroy {
  private readonly logger = createLogger('ClaudeSessionTracker');

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionService: SessionService,
    private readonly claudeSessionReader: ClaudeSessionReaderService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {}

  /**
   * On module destroy, save a final snapshot as a fallback.
   */
  onModuleDestroy(): void {
    this.refreshActiveSessionsSnapshot('shutdown');
  }

  /**
   * Poll for a newly created Claude session ID after launching a CLI process.
   * Polls every 2 seconds for up to 30 seconds. When found, updates the session
   * and emits an event so the frontend can track it.
   *
   * This is fire-and-forget — it does not block session launch.
   */
  async startTracking(
    sessionId: string,
    projectPath: string,
    previousSessionIds: Set<string>
  ): Promise<void> {
    const POLL_INTERVAL_MS = 2000;
    const MAX_POLLS = 15; // 15 * 2s = 30s total

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      // Check if session still exists (might have been removed during polling)
      const session = this.sessionService.get(sessionId);
      if (!session) {
        this.logger.debug(`Session ${sessionId} removed during Claude session ID polling`);
        return;
      }

      // Check if session already has a Claude session ID (e.g., set by resume)
      if (session.claudeSessionId) {
        this.logger.debug(`Session ${sessionId} already has Claude session ID, stopping poll`);
        return;
      }

      try {
        const newSession = await this.claudeSessionReader.findNewSession(
          projectPath,
          previousSessionIds
        );

        if (newSession) {
          this.sessionService.setClaudeSessionId(sessionId, newSession.sessionId);
          this.logger.info(`Captured Claude session ID for ${sessionId}: ${newSession.sessionId}`);

          // Emit event so the gateway can broadcast to frontend
          this.eventEmitter.emit(InternalSessionEvents.CLAUDE_ID_CAPTURED, {
            sessionId,
            claudeSessionId: newSession.sessionId,
          });

          // Session is now resumable — eagerly update the snapshot
          this.refreshActiveSessionsSnapshot('claude-id-captured');

          return;
        }
      } catch (error) {
        const msg = extractErrorMessage(error);
        this.logger.warn(`Poll error for Claude session ID (${sessionId}): ${msg}`);
        // Continue polling despite errors
      }
    }

    this.logger.debug(
      `Claude session ID polling timed out for ${sessionId} after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`
    );
  }

  /**
   * Handle terminal closed events that have session data.
   * Persists session history and refreshes the active sessions snapshot.
   */
  @OnEvent(InternalSessionEvents.TERMINAL_CLOSED_WITH_SESSION)
  onTerminalClosedWithSession(event: {
    sessionId: string;
    claudeSessionId?: string;
    exitCode: number;
  }): void {
    const session = this.sessionService.get(event.sessionId);
    if (!session) return;

    // Persist session history if we captured a Claude session ID
    if (event.claudeSessionId) {
      this.persistSessionHistory(session, event.exitCode);
    }

    // Session is no longer running — update snapshot
    this.refreshActiveSessionsSnapshot('terminal-closed');
  }

  /**
   * Handle session removed events to update snapshot.
   */
  @OnEvent(InternalSessionEvents.REMOVED)
  onSessionRemoved(): void {
    this.refreshActiveSessionsSnapshot('session-removed');
  }

  /**
   * Eagerly refresh the active sessions snapshot whenever sessions change.
   * This ensures the snapshot is always up-to-date regardless of how the process exits.
   */
  refreshActiveSessionsSnapshot(reason: string): void {
    try {
      const activeSessions = this.sessionService.getRunningSessions();
      const snapshots: ActiveSessionSnapshot[] = activeSessions
        .filter(s => s.claudeSessionId)
        .map(s => ({
          claudeSessionId: s.claudeSessionId!,
          projectPath: s.projectPath,
          branch: s.branch,
          name: s.name,
        }));

      this.workspaceService.saveActiveSessionsSnapshot(snapshots);
      this.logger.debug(
        `Refreshed active sessions snapshot (${snapshots.length} sessions, reason: ${reason})`
      );
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to save active sessions snapshot: ${msg}`);
    }
  }

  /**
   * Persist a session's history entry to the workspace store.
   * Called when a terminal closes and a Claude session ID was captured.
   */
  private persistSessionHistory(session: BackendSessionConfig, exitCode: number): void {
    try {
      const entry: SessionHistoryEntry = {
        omniscribeSessionId: session.id,
        claudeSessionId: session.claudeSessionId!,
        projectPath: session.projectPath,
        name: session.name,
        lastStatus: session.status,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        branch: session.branch,
        exitCode,
      };

      this.workspaceService.addSessionHistory(entry);
      this.logger.info(
        `Persisted session history for ${session.id} (claude: ${session.claudeSessionId})`
      );
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.warn(`Failed to persist session history for ${session.id}: ${errorMessage}`);
    }
  }
}
