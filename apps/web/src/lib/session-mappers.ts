import { mapSessionStatus } from '@omniscribe/shared';
import type { FrontendSessionConfig } from '@/stores/useSessionStore';
import type { TerminalSession } from '@/components/terminal/TerminalGrid';

/**
 * Maps raw FrontendSessionConfig entries to TerminalSession format for TerminalGrid.
 * Shared between useProjectSessions and PersistentProjectGrid to avoid duplication.
 */
export function mapToTerminalSessions(
  sessions: FrontendSessionConfig[],
  customTitles: Record<string, string>
): TerminalSession[] {
  return sessions.map((session, index) => ({
    id: session.id,
    sessionNumber: index + 1,
    aiMode: session.aiMode,
    status: mapSessionStatus(session.status),
    branch: session.branch,
    statusMessage: session.statusMessage,
    terminalSessionId: session.terminalSessionId,
    worktreePath: session.worktreePath,
    skipPermissions: session.skipPermissions,
    claudeSessionId: session.claudeSessionId,
    isResumed: session.isResumed,
    customTitle: customTitles[session.id],
  }));
}
