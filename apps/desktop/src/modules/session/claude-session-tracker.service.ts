import { Injectable, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SessionHistoryEntry,
  ActiveSessionSnapshot,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { WorkspaceService } from '../workspace';
import { SessionService } from './session.service';
import { InternalSessionEvents } from '../shared/events';
import { BackendSessionConfig } from './types';

/**
 * Thin NestJS adapter for Claude session tracking event handling.
 *
 * This service retains the @OnEvent handlers and persistence logic that
 * cannot move to the plugin (which is outside NestJS DI). The actual
 * session discovery/polling logic lives in the plugin's SessionTrackerService
 * and is orchestrated by SessionLauncherService.
 *
 * Responsibilities:
 * - Persist session history on terminal close (@OnEvent TERMINAL_CLOSED_WITH_SESSION)
 * - Refresh active sessions snapshot on session remove (@OnEvent REMOVED)
 * - Provide refreshActiveSessionsSnapshot() for external callers (SessionLauncherService)
 * - Save final snapshot on module destroy
 */
@Injectable()
export class ClaudeSessionTrackerService implements OnModuleDestroy {
  private readonly logger = createLogger('ClaudeSessionTracker');

  constructor(
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {}

  onModuleDestroy(): void {
    this.refreshActiveSessionsSnapshot('shutdown');
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
      this.persistSessionHistory(session, event.claudeSessionId, event.exitCode);
    }

    // Session is no longer running -- update snapshot
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
   * Called by event handlers and by SessionLauncherService after ID capture.
   * Public so SessionLauncherService can call it directly.
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
   */
  private persistSessionHistory(
    session: BackendSessionConfig,
    claudeSessionId: string,
    exitCode: number
  ): void {
    try {
      const entry: SessionHistoryEntry = {
        omniscribeSessionId: session.id,
        claudeSessionId,
        projectPath: session.projectPath,
        name: session.name,
        lastStatus: session.status,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
        branch: session.branch,
        exitCode,
      };

      this.workspaceService.addSessionHistory(entry);
      this.logger.info(`Persisted session history for ${session.id} (claude: ${claudeSessionId})`);
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.warn(`Failed to persist session history for ${session.id}: ${errorMessage}`);
    }
  }
}
