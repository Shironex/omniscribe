import { useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  GitBranch,
  GitCommit,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useGitStore, selectCurrentBranch } from '../../stores';
import { useWorkspaceStore, selectActiveTab } from '../../stores';

interface GitSectionProps {
  className?: string;
}

export function GitSection({ className }: GitSectionProps) {
  const currentBranch = useGitStore(selectCurrentBranch);
  const isLoading = useGitStore((state) => state.isLoading);
  const error = useGitStore((state) => state.error);
  const fetchBranches = useGitStore((state) => state.fetchBranches);
  const clear = useGitStore((state) => state.clear);
  const initListeners = useGitStore((state) => state.initListeners);

  const activeTab = useWorkspaceStore(selectActiveTab);

  // Track the previous project path to detect changes
  const prevProjectPathRef = useRef<string | null>(null);

  // Initialize listeners on mount
  useEffect(() => {
    initListeners();
  }, [initListeners]);

  // Fetch branches when active project changes
  useEffect(() => {
    const currentProjectPath = activeTab?.projectPath ?? null;
    const prevProjectPath = prevProjectPathRef.current;

    // Update ref for next comparison
    prevProjectPathRef.current = currentProjectPath;

    // If project path changed, clear old state and fetch new data
    if (currentProjectPath !== prevProjectPath) {
      // Clear old data first to avoid showing stale data
      clear();
      if (currentProjectPath) {
        // Fetch fresh data for the new project
        fetchBranches(currentProjectPath);
      }
    }
  }, [activeTab?.projectPath, clear, fetchBranches]);

  const handleRefresh = useCallback(() => {
    if (activeTab?.projectPath) {
      console.log('[GitSection] Refresh clicked, fetching branches for:', activeTab.projectPath);
      fetchBranches(activeTab.projectPath);
    }
  }, [activeTab?.projectPath, fetchBranches]);

  const ahead = currentBranch?.ahead ?? 0;
  const behind = currentBranch?.behind ?? 0;

  return (
    <div className={twMerge(clsx('space-y-2', className))}>
      {/* Branch info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GitBranch size={14} className="text-omniscribe-text-muted flex-shrink-0" />
          {isLoading ? (
            <span className="text-xs text-omniscribe-text-muted animate-pulse">
              Loading...
            </span>
          ) : error ? (
            <div className="flex items-center gap-1 text-red-400">
              <AlertCircle size={12} />
              <span className="text-xs truncate">Error</span>
            </div>
          ) : currentBranch ? (
            <span className="text-xs text-omniscribe-text-secondary font-mono truncate">
              {currentBranch.name}
            </span>
          ) : (
            <span className="text-xs text-omniscribe-text-muted">
              No repository
            </span>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading || !activeTab?.projectPath}
          className={clsx(
            'p-1 rounded transition-colors flex-shrink-0',
            'hover:bg-omniscribe-surface',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isLoading && 'animate-spin'
          )}
          title="Refresh"
        >
          <RefreshCw size={12} className="text-omniscribe-text-muted" />
        </button>
      </div>

      {/* Remote status */}
      {currentBranch && (ahead > 0 || behind > 0) && (
        <div className="flex items-center gap-3 pl-5">
          {ahead > 0 && (
            <div className="flex items-center gap-1" title={`${ahead} commit(s) ahead`}>
              <ArrowUp size={12} className="text-green-400" />
              <span className="text-xs text-omniscribe-text-muted">{ahead}</span>
            </div>
          )}
          {behind > 0 && (
            <div className="flex items-center gap-1" title={`${behind} commit(s) behind`}>
              <ArrowDown size={12} className="text-orange-400" />
              <span className="text-xs text-omniscribe-text-muted">{behind}</span>
            </div>
          )}
        </div>
      )}

      {/* Last commit */}
      {currentBranch?.lastCommitMessage && (
        <div className="flex items-start gap-2 pl-5">
          <GitCommit size={12} className="text-omniscribe-text-muted flex-shrink-0 mt-0.5" />
          <span className="text-xs text-omniscribe-text-muted line-clamp-2">
            {currentBranch.lastCommitMessage}
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-xs text-red-400 pl-5 truncate" title={error}>
          {error}
        </div>
      )}
    </div>
  );
}
