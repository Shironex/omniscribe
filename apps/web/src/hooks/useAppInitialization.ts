import { useEffect } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useGitStore } from '../stores/useGitStore';
import { useMcpStore } from '../stores/useMcpStore';
import { connectSocket } from '../lib/socket';

/**
 * Hook for app initialization - socket connection and all store listener setup/cleanup.
 * Contains the init effect and runs side effects only.
 */
export function useAppInitialization(): void {
  // Session store
  const initSessionListeners = useSessionStore((state) => state.initListeners);
  const cleanupSessionListeners = useSessionStore((state) => state.cleanupListeners);

  // Workspace store
  const initWorkspaceListeners = useWorkspaceStore((state) => state.initListeners);
  const cleanupWorkspaceListeners = useWorkspaceStore((state) => state.cleanupListeners);

  // Git store
  const initGitListeners = useGitStore((state) => state.initListeners);
  const cleanupGitListeners = useGitStore((state) => state.cleanupListeners);

  // MCP store
  const initMcpListeners = useMcpStore((state) => state.initListeners);
  const cleanupMcpListeners = useMcpStore((state) => state.cleanupListeners);
  const fetchInternalMcpStatus = useMcpStore((state) => state.fetchInternalMcpStatus);

  // Initialize stores and socket on mount
  useEffect(() => {
    const init = async () => {
      try {
        await connectSocket();
        initSessionListeners();
        initGitListeners();
        initWorkspaceListeners();
        initMcpListeners();
        // Fetch internal MCP status on app start
        fetchInternalMcpStatus();
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    init();

    return () => {
      cleanupSessionListeners();
      cleanupGitListeners();
      cleanupWorkspaceListeners();
      cleanupMcpListeners();
    };
  }, [
    initSessionListeners,
    cleanupSessionListeners,
    initGitListeners,
    cleanupGitListeners,
    initWorkspaceListeners,
    cleanupWorkspaceListeners,
    initMcpListeners,
    cleanupMcpListeners,
    fetchInternalMcpStatus,
  ]);
}
