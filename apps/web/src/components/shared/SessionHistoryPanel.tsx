import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  X,
  RotateCcw,
  MessageSquare,
  GitBranch,
  RefreshCw,
  Search,
  ArrowUpDown,
  PlayCircle,
  GitFork,
} from 'lucide-react';
import { toast } from 'sonner';
import { createLogger, type ClaudeSessionEntry } from '@omniscribe/shared';
import { useSessionHistoryStore, selectSessionHistory } from '@/stores';
import { useSessionStore } from '@/stores';
import { resumeSession, forkSession, continueLastSession } from '@/lib/session';
import { formatRelativeTime } from '@/lib/date-utils';

const logger = createLogger('SessionHistoryPanel');

interface SessionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  className?: string;
}

/**
 * Collapsible right sidebar panel that shows Claude Code session history
 * and allows resuming, forking, and searching past sessions.
 */
export function SessionHistoryPanel({
  isOpen,
  onClose,
  projectPath,
  className,
}: SessionHistoryPanelProps) {
  const sessions = useSessionHistoryStore(selectSessionHistory);
  const isLoading = useSessionHistoryStore(state => state.isLoading);
  const error = useSessionHistoryStore(state => state.error);
  const fetchHistory = useSessionHistoryStore(state => state.fetchHistory);
  const updateSession = useSessionStore(state => state.updateSession);

  // Search & filter state
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input (300ms)
  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchText]);

  // Fetch history when panel opens or project changes
  useEffect(() => {
    if (isOpen && projectPath) {
      fetchHistory(projectPath);
    }
  }, [isOpen, projectPath, fetchHistory]);

  // Reset filters when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchText('');
      setDebouncedSearch('');
      setSelectedBranch('');
    }
  }, [isOpen]);

  // Filter out sessions that are currently active
  const activeSessions = useSessionStore(state => state.sessions);
  const activeClaudeIds = useMemo(
    () => new Set(activeSessions.map(s => s.claudeSessionId).filter(Boolean)),
    [activeSessions]
  );

  // Unique branches for filter dropdown
  const uniqueBranches = useMemo(
    () => Array.from(new Set(sessions.map(s => s.gitBranch).filter(Boolean))).sort(),
    [sessions]
  );

  // Filter + sort + limit
  const filteredSessions = useMemo(() => {
    let result = sessions.filter(s => !activeClaudeIds.has(s.sessionId));

    // Text search (case-insensitive, matches summary or firstPrompt)
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(
        s =>
          (s.summary && s.summary.toLowerCase().includes(lower)) ||
          (s.firstPrompt && s.firstPrompt.toLowerCase().includes(lower))
      );
    }

    // Branch filter
    if (selectedBranch) {
      result = result.filter(s => s.gitBranch === selectedBranch);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const timeA = new Date(a.modified).getTime();
      const timeB = new Date(b.modified).getTime();
      return sortNewestFirst ? timeB - timeA : timeA - timeB;
    });

    // Limit
    return result.slice(0, 30);
  }, [sessions, activeClaudeIds, debouncedSearch, selectedBranch, sortNewestFirst]);

  const handleResume = useCallback(
    async (entry: ClaudeSessionEntry) => {
      if (!projectPath) return;
      try {
        const session = await resumeSession(
          entry.sessionId,
          projectPath,
          entry.gitBranch,
          entry.summary || entry.firstPrompt?.slice(0, 50)
        );
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }
        toast.success('Session resumed successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to resume session';
        logger.error('Resume failed:', err);
        toast.error(msg);
      }
    },
    [projectPath, updateSession]
  );

  const handleFork = useCallback(
    async (entry: ClaudeSessionEntry) => {
      if (!projectPath) return;
      try {
        const session = await forkSession(
          entry.sessionId,
          projectPath,
          entry.gitBranch,
          `Fork: ${(entry.summary || entry.firstPrompt || 'session').slice(0, 40)}`
        );
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }
        toast.success('Session forked successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fork session';
        logger.error('Fork failed:', err);
        toast.error(msg);
      }
    },
    [projectPath, updateSession]
  );

  const handleContinueLast = useCallback(async () => {
    if (!projectPath) return;
    try {
      const session = await continueLastSession(projectPath);
      if (session.terminalSessionId !== undefined) {
        updateSession(session.id, { terminalSessionId: session.terminalSessionId });
      }
      toast.success('Continuing last session');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to continue last session';
      logger.error('Continue last failed:', err);
      toast.error(msg);
    }
  }, [projectPath, updateSession]);

  return (
    <div
      className={twMerge(
        clsx(
          'h-full border-l border-border bg-muted flex flex-col',
          'transition-all duration-200 ease-in-out overflow-hidden',
          isOpen ? 'w-80' : 'w-0'
        ),
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
          Session History
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => projectPath && fetchHistory(projectPath)}
            className="p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground-secondary transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Continue Last Button */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <button
          onClick={handleContinueLast}
          disabled={!projectPath}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <PlayCircle size={13} />
          Continue Last Conversation
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="px-3 py-2 border-b border-border shrink-0 space-y-1.5">
        {/* Search input */}
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full pl-6 pr-2 py-1 text-xs bg-card border border-border rounded text-foreground-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Branch filter + sort toggle */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="flex-1 text-2xs bg-card border border-border rounded px-1.5 py-0.5 text-foreground-secondary focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All branches</option>
            {uniqueBranches.map(b => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSortNewestFirst(prev => !prev)}
            className="p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground-secondary transition-colors"
            title={sortNewestFirst ? 'Showing newest first' : 'Showing oldest first'}
          >
            <ArrowUpDown size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && (
          <div className="text-xs text-muted-foreground animate-pulse py-4 text-center">
            Loading history...
          </div>
        )}

        {error && <div className="text-xs text-red-400 py-2 px-2">{error}</div>}

        {!isLoading && filteredSessions.length === 0 && !error && (
          <div className="text-xs text-muted-foreground py-8 text-center">
            {debouncedSearch || selectedBranch ? 'No matching sessions' : 'No past sessions'}
          </div>
        )}

        {filteredSessions.map(entry => (
          <div
            key={entry.sessionId}
            className="group px-2 py-2 rounded hover:bg-card transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground-secondary truncate">
                  {entry.summary || entry.firstPrompt || 'Untitled session'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {entry.gitBranch && (
                    <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
                      <GitBranch size={10} />
                      <span className="truncate max-w-16">{entry.gitBranch}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
                    <MessageSquare size={10} />
                    {entry.messageCount}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {formatRelativeTime(new Date(entry.modified))}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleFork(entry)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-blue-400 hover:bg-blue-500/10 transition-all"
                  title="Fork this session"
                >
                  <GitFork size={13} />
                </button>
                <button
                  onClick={() => handleResume(entry)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-emerald-400 hover:bg-emerald-500/10 transition-all"
                  title="Resume this session"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
