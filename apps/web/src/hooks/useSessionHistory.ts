import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { createLogger, extractErrorMessage, type ClaudeSessionEntry } from '@omniscribe/shared';
import { useSessionHistoryStore, selectSessionHistory } from '@/stores/useSessionHistoryStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { resumeSession, forkSession, continueLastSession } from '@/lib/session';

const logger = createLogger('SessionHistory');

const MAX_HISTORY_ITEMS = 30;

interface UseSessionHistoryOptions {
  isOpen: boolean;
  projectPath: string | null;
  currentBranch?: string;
}

export function useSessionHistory({
  isOpen,
  projectPath,
  currentBranch,
}: UseSessionHistoryOptions) {
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

  // Filter out sessions that are currently active.
  const activeClaudeIdList = useSessionStore(
    useShallow(state => state.sessions.map(s => s.claudeSessionId).filter(Boolean))
  );
  const activeClaudeIds = useMemo(() => new Set(activeClaudeIdList), [activeClaudeIdList]);

  // Unique branches for filter dropdown
  const uniqueBranches = useMemo(
    () => Array.from(new Set(sessions.map(s => s.gitBranch).filter(Boolean))).sort(),
    [sessions]
  );

  // Filter + sort + limit
  const filteredSessions = useMemo(() => {
    let result = sessions.filter(s => !activeClaudeIds.has(s.sessionId));

    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(
        s =>
          (s.customTitle && s.customTitle.toLowerCase().includes(lower)) ||
          (s.summary && s.summary.toLowerCase().includes(lower)) ||
          (s.firstPrompt && s.firstPrompt.toLowerCase().includes(lower))
      );
    }

    if (selectedBranch) {
      result = result.filter(s => s.gitBranch === selectedBranch);
    }

    result = [...result].sort((a, b) => {
      const timeA = new Date(a.modified).getTime();
      const timeB = new Date(b.modified).getTime();
      return sortNewestFirst ? timeB - timeA : timeA - timeB;
    });

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
          entry.customTitle || entry.summary || entry.firstPrompt?.slice(0, 50)
        );
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }
        toast.success('Session resumed successfully');
      } catch (err) {
        const msg = extractErrorMessage(err, 'Failed to resume session');
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
          `Fork: ${(entry.customTitle || entry.summary || entry.firstPrompt || 'session').slice(0, 40)}`
        );
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }
        toast.success('Session forked successfully');
      } catch (err) {
        const msg = extractErrorMessage(err, 'Failed to fork session');
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
      const msg = extractErrorMessage(err, 'Failed to continue last session');
      logger.error('Continue last failed:', err);
      toast.error(msg);
    }
  }, [projectPath, currentBranch, updateSession]);

  const handleRefresh = useCallback(() => {
    if (projectPath) fetchHistory(projectPath);
  }, [projectPath, fetchHistory]);

  const handleToggleSort = useCallback(() => {
    setSortNewestFirst(prev => !prev);
  }, []);

  return {
    // Data
    filteredSessions,
    isLoading,
    error,
    // Search & filter
    searchText,
    setSearchText,
    selectedBranch,
    setSelectedBranch,
    uniqueBranches,
    sortNewestFirst,
    handleToggleSort,
    // Actions
    handleResume,
    handleFork,
    handleContinueLast,
    handleRefresh,
  };
}
