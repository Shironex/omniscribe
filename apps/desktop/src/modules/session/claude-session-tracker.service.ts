import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SessionHistoryEntry, createLogger, extractErrorMessage } from '@omniscribe/shared';
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
 */
@Injectable()
export class ClaudeSessionTrackerService {
  private readonly logger = createLogger('ClaudeSessionTracker');

  constructor(
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {}

  /**
   * Handle terminal closed events that have session data.
   * Persists session history.
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
