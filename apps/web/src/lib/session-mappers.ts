import { mapSessionStatus } from '@omniscribe/shared';
import type { FrontendSessionConfig } from '@/stores/useSessionStore';
import type { TerminalSession } from '@/components/terminal/TerminalGrid';

/**
 * Per-session memoization for {@link mapToTerminalSessions}. Keyed on the
 * source `FrontendSessionConfig` reference (which the store rotates only
 * when something actually changed for that session), then validated against
 * the inputs that affect the projected output (sessionNumber and customTitle).
 *
 * `WeakMap` so cached entries are GC'd alongside their session config when
 * the store drops them from `state.sessions`.
 *
 * Note: `mapSessionStatus(session.status)` and the spread of static fields
 * (`aiMode`, `branch`, `worktreePath`, …) are derived from the same session
 * reference, so cache validity collapses to:
 *   same session ref AND same sessionNumber AND same customTitle
 */
interface CacheEntry {
  sessionNumber: number;
  customTitle: string | undefined;
  out: TerminalSession;
}

const mapCache = new WeakMap<FrontendSessionConfig, CacheEntry>();

/**
 * Maps raw FrontendSessionConfig entries to TerminalSession format for TerminalGrid.
 * Shared between useProjectSessions and PersistentProjectGrid to avoid duplication.
 *
 * Returns referentially-stable per-session output objects when the source
 * session reference, its slot number, and its custom title are all
 * unchanged. Lets `React.memo`-wrapped TerminalCard skip re-renders during
 * status-tick fan-outs that don't actually change the rendered fields.
 */
export function mapToTerminalSessions(
  sessions: FrontendSessionConfig[],
  customTitles: Record<string, string>
): TerminalSession[] {
  return sessions.map((session, index) => {
    const sessionNumber = index + 1;
    const customTitle = customTitles[session.id];
    const cached = mapCache.get(session);
    if (cached && cached.sessionNumber === sessionNumber && cached.customTitle === customTitle) {
      return cached.out;
    }
    const out: TerminalSession = {
      id: session.id,
      sessionNumber,
      aiMode: session.aiMode,
      status: mapSessionStatus(session.status),
      branch: session.branch,
      statusMessage: session.statusMessage,
      terminalSessionId: session.terminalSessionId,
      worktreePath: session.worktreePath,
      skipPermissions: session.skipPermissions,
      claudeSessionId: session.claudeSessionId,
      isResumed: session.isResumed,
      customTitle,
    };
    mapCache.set(session, { sessionNumber, customTitle, out });
    return out;
  });
}
