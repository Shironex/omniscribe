import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useGitStore } from '@/stores/useGitStore';
import { useMcpStore } from '@/stores/useMcpStore';
import type { Branch } from '@/components/shared/BranchSelector';

const logger = createLogger('ProjectGit');

interface UseProjectGitReturn {
  /** Branches formatted for BranchSelector */
  branches: Branch[];
  /** Current branch name */
  currentBranch: string;
  /** Handler for branch button click (refreshes branches) */
  handleBranchClick: () => void;
}

/**
 * Hook for project git operations.
 * Handles git store connections and project change effects.
 */
export function useProjectGit(activeProjectPath: string | null): UseProjectGitReturn {
  // Git store
  const gitBranches = useGitStore(state => state.branches);
  const currentGitBranch = useGitStore(state => state.currentBranch);
  const fetchBranches = useGitStore(state => state.fetchBranches);
  const clearGitState = useGitStore(state => state.clear);

  // MCP store
  const discoverMcpServers = useMcpStore(state => state.discoverServers);

  // Track previous project path for change detection
  const prevProjectPathRef = useRef<string | null>(null);

  // Fetch git data when active project changes
  useEffect(() => {
    const prevProjectPath = prevProjectPathRef.current;
    prevProjectPathRef.current = activeProjectPath;

    // If project path changed, clear old state and fetch new data
    if (activeProjectPath !== prevProjectPath) {
      // Clear old git data first to avoid showing stale branch in top bar
      logger.debug('Clearing stale git state for project change');
      clearGitState();
      if (activeProjectPath) {
        logger.info('Project changed, refreshing git data for', activeProjectPath);
        // Fetch fresh data for the new project
        fetchBranches(activeProjectPath);
        // Also discover MCP servers for the project
        discoverMcpServers(activeProjectPath);
      }
    }
  }, [activeProjectPath, clearGitState, fetchBranches, discoverMcpServers]);

  // Convert git branches to Branch format
  const branches: Branch[] = useMemo(() => {
    return gitBranches.map(b => ({
      name: b.name,
      isRemote: b.isRemote,
      isCurrent: currentGitBranch?.name === b.name,
    }));
  }, [gitBranches, currentGitBranch]);

  // Current branch name
  const currentBranch = currentGitBranch?.name ?? 'main';

  // Branch handler - fetch fresh branches when clicked
  const handleBranchClick = useCallback(() => {
    if (activeProjectPath) {
      fetchBranches(activeProjectPath);
    }
  }, [activeProjectPath, fetchBranches]);

  return {
    branches,
    currentBranch,
    handleBranchClick,
  };
}
