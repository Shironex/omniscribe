/**
 * Claude Session Tracker Service
 *
 * Provides pure session ID discovery logic by polling the filesystem for
 * newly created Claude sessions. The core adapter handles NestJS event
 * emission, persistence, and session service integration.
 *
 * Extracted discovery logic from apps/desktop/src/modules/session/claude-session-tracker.service.ts.
 * Pure TypeScript class with no NestJS dependencies.
 */

import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { ClaudeSessionEntry } from '@omniscribe/shared';
import { ClaudeSessionReaderService } from './session-reader.service';

/**
 * Claude Session Tracker Service.
 *
 * Provides the discovery-only part of session tracking: polling the filesystem
 * to find a newly created Claude session ID. The NestJS-specific concerns
 * (event emission, session persistence, workspace snapshots) remain in the
 * core adapter.
 */
export class ClaudeSessionTrackerService {
  private readonly logger = createLogger('ClaudeSessionTracker');

  constructor(private readonly sessionReader: ClaudeSessionReaderService) {}

  /**
   * Poll for a newly created Claude session by comparing current sessions
   * against a set of previously known session IDs.
   *
   * Polls every `intervalMs` milliseconds for up to `maxPolls` iterations.
   * Returns the new session ID if found, or null if polling timed out.
   *
   * @param projectPath - Project path to look for sessions
   * @param previousSessionIds - Set of session IDs known before the CLI was launched
   * @param maxPolls - Maximum number of poll iterations (default: 15)
   * @param intervalMs - Milliseconds between polls (default: 2000)
   * @returns New session entry if found, or null if timed out
   */
  async pollForNewSession(
    projectPath: string,
    previousSessionIds: Set<string>,
    maxPolls = 15,
    intervalMs = 2000
  ): Promise<ClaudeSessionEntry | null> {
    for (let i = 0; i < maxPolls; i++) {
      await this.delay(intervalMs);

      try {
        const newSession = await this.sessionReader.findNewSession(projectPath, previousSessionIds);

        if (newSession) {
          this.logger.info(
            `Discovered new Claude session ID: ${newSession.sessionId} (poll ${i + 1}/${maxPolls})`
          );
          return newSession;
        }
      } catch (error) {
        const msg = extractErrorMessage(error);
        this.logger.warn(`Poll error for Claude session ID: ${msg}`);
        // Continue polling despite errors
      }
    }

    this.logger.debug(
      `Claude session ID polling timed out after ${(maxPolls * intervalMs) / 1000}s`
    );
    return null;
  }

  /**
   * Promise-based delay utility.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
