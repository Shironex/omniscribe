import { useEffect, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RotateCcw, MessageSquare, GitBranch, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger, ClaudeSessionEntry } from '@omniscribe/shared';
import { useSessionHistoryStore, selectSessionHistory } from '@/stores';
import { useWorkspaceStore, selectActiveTab } from '@/stores';
import { useSessionStore } from '@/stores';
import { resumeSession } from '@/lib/session';
import { formatRelativeTime } from '@/lib/date-utils';

const logger = createLogger('SessionHistory');

interface SessionHistorySectionProps {
  className?: string;
}

export function SessionHistorySection({ className }: SessionHistorySectionProps) {
  const activeTab = useWorkspaceStore(selectActiveTab);
  const sessions = useSessionHistoryStore(selectSessionHistory);
  const isLoading = useSessionHistoryStore(state => state.isLoading);
  const error = useSessionHistoryStore(state => state.error);
  const fetchHistory = useSessionHistoryStore(state => state.fetchHistory);

  // Active sessions from the session store -- used to filter out already-active sessions
  const activeSessions = useSessionStore(state => state.sessions);
  const updateSession = useSessionStore(state => state.updateSession);

  // Fetch history on mount and when project path changes
  useEffect(() => {
    if (activeTab?.projectPath) {
      fetchHistory(activeTab.projectPath);
    }
  }, [activeTab?.projectPath, fetchHistory]);

  // Collect claude session IDs that are currently active
  const activeClaudeSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of activeSessions) {
      if (session.claudeSessionId) {
        ids.add(session.claudeSessionId);
      }
    }
    return ids;
  }, [activeSessions]);

  // Sort by modified descending, filter out active sessions, limit to 20
  const displaySessions = useMemo(() => {
    return sessions
      .filter(entry => !activeClaudeSessionIds.has(entry.sessionId))
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      .slice(0, 20);
  }, [sessions, activeClaudeSessionIds]);

  const handleRefresh = useCallback(() => {
    if (activeTab?.projectPath) {
      fetchHistory(activeTab.projectPath);
    }
  }, [activeTab?.projectPath, fetchHistory]);

  const handleResume = useCallback(
    async (entry: ClaudeSessionEntry) => {
      if (!activeTab?.projectPath) return;
      try {
        const session = await resumeSession(
          entry.sessionId,
          activeTab.projectPath,
          entry.gitBranch,
          entry.summary || entry.firstPrompt?.slice(0, 50)
        );
        // Update terminal session ID if returned
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }
        toast.success('Session resumed');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to resume session';
        logger.error('Resume failed:', err);
        toast.error(msg);
      }
    },
    [activeTab?.projectPath, updateSession]
  );

  return (
    <div data-testid="session-history-section" className={twMerge(clsx('space-y-2', className))}>
      {/* Header with count and refresh button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground-secondary">
          {displaySessions.length} past session{displaySessions.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleRefresh}
          className={clsx(
            'p-1 rounded transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground-secondary'
          )}
          title="Refresh history"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-xs text-muted-foreground animate-pulse py-2">Loading history...</div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 py-2">
          <AlertCircle size={12} />
          <span className="text-xs truncate">{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && displaySessions.length === 0 && !error && (
        <div className="text-xs text-muted-foreground py-2">No past sessions</div>
      )}

      {/* Sessions list */}
      {displaySessions.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {displaySessions.map(entry => (
            <div
              key={entry.sessionId}
              className={clsx(
                'w-full flex items-start gap-2 px-2 py-1.5 rounded',
                'text-left transition-colors',
                'hover:bg-muted',
                'group'
              )}
            >
              <div className="min-w-0 flex-1">
                {/* Summary / first prompt */}
                <div className="text-xs text-foreground-secondary truncate">
                  {entry.summary || entry.firstPrompt || 'Untitled session'}
                </div>
                {/* Metadata row */}
                <div className="flex items-center gap-2 mt-0.5">
                  {entry.gitBranch && (
                    <span className="flex items-center gap-0.5 text-2xs text-muted-foreground truncate max-w-[80px]">
                      <GitBranch size={10} className="flex-shrink-0" />
                      <span className="truncate">{entry.gitBranch}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
                    <MessageSquare size={10} className="flex-shrink-0" />
                    {entry.messageCount} msgs
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {formatRelativeTime(new Date(entry.modified))}
                  </span>
                </div>
              </div>
              {/* Resume button - visible on hover */}
              <button
                onClick={() => handleResume(entry)}
                className={clsx(
                  'p-1 rounded transition-all flex-shrink-0',
                  'opacity-0 group-hover:opacity-100',
                  'hover:bg-primary/20 text-muted-foreground hover:text-primary'
                )}
                title="Resume this session"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
