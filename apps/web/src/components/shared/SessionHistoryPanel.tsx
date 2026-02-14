import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { X, RefreshCw, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger, type ClaudeSessionEntry } from '@omniscribe/shared';
import { useSessionHistoryStore, selectSessionHistory } from '@/stores';
import { useSessionStore } from '@/stores';
import { resumeSession, forkSession, continueLastSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { SessionHistoryFilters } from './SessionHistoryFilters';
import { SessionHistoryItem } from './SessionHistoryItem';

const logger = createLogger('SessionHistoryPanel');

const MAX_HISTORY_ITEMS = 30;

interface SessionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  /** Current git branch — passed to continueLastSession */
  currentBranch?: string;
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
  currentBranch,
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
    return result.slice(0, MAX_HISTORY_ITEMS);
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
      const session = await continueLastSession(projectPath, currentBranch);
      if (session.terminalSessionId !== undefined) {
        updateSession(session.id, { terminalSessionId: session.terminalSessionId });
      }
      toast.success('Continuing last session');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to continue last session';
      logger.error('Continue last failed:', err);
      toast.error(msg);
    }
  }, [projectPath, currentBranch, updateSession]);

  return (
    <div
      className={cn(
        'h-full border-l border-border bg-muted flex flex-col',
        'transition-all duration-200 ease-in-out overflow-hidden',
        isOpen ? 'w-80' : 'w-0',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
          Session History
        </span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => projectPath && fetchHistory(projectPath)}
                className="h-auto w-auto p-1"
                aria-label="Refresh session history"
              >
                <RefreshCw size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-auto w-auto p-1"
                aria-label="Close session history panel"
              >
                <X size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Continue Last Button */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <Button
          onClick={handleContinueLast}
          disabled={!projectPath}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 h-auto text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-400"
        >
          <PlayCircle size={13} />
          Continue Last Conversation
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <SessionHistoryFilters
        searchText={searchText}
        onSearchChange={setSearchText}
        selectedBranch={selectedBranch}
        onBranchChange={setSelectedBranch}
        uniqueBranches={uniqueBranches}
        sortNewestFirst={sortNewestFirst}
        onToggleSort={() => setSortNewestFirst(prev => !prev)}
      />

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
          <SessionHistoryItem
            key={entry.sessionId}
            entry={entry}
            onResume={handleResume}
            onFork={handleFork}
          />
        ))}
      </div>
    </div>
  );
}
