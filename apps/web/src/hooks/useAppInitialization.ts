import { useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useGitStore } from '@/stores/useGitStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { connectSocket } from '@/lib/socket';

const logger = createLogger('AppInit');

/**
 * Hook for app initialization - socket connection and all store listener setup/cleanup.
 * Contains the init effect and runs side effects only.
 */
export function useAppInitialization(): void {
  // Session store
  const initSessionListeners = useSessionStore(state => state.initListeners);
  const cleanupSessionListeners = useSessionStore(state => state.cleanupListeners);

  // Workspace store
  const initWorkspaceListeners = useWorkspaceStore(state => state.initListeners);
  const cleanupWorkspaceListeners = useWorkspaceStore(state => state.cleanupListeners);

  // Git store
  const initGitListeners = useGitStore(state => state.initListeners);
  const cleanupGitListeners = useGitStore(state => state.cleanupListeners);

  // MCP store
  const initMcpListeners = useMcpStore(state => state.initListeners);
  const cleanupMcpListeners = useMcpStore(state => state.cleanupListeners);
  const fetchInternalMcpStatus = useMcpStore(state => state.fetchInternalMcpStatus);

  // Update store (uses IPC, not socket — init separately)
  const initUpdateListeners = useUpdateStore(state => state.initListeners);

  // Initialize stores and socket on mount
  useEffect(() => {
    let cleanupUpdateListeners: (() => void) | undefined;
    const init = async () => {
      try {
        logger.info('Initializing app...');
        await connectSocket();
        logger.info('Socket connected');
        initSessionListeners();
        initGitListeners();
        initWorkspaceListeners();
        initMcpListeners();
        logger.info('All listeners initialized');
        // Fetch internal MCP status on app start
        fetchInternalMcpStatus();
        // Init updater listeners (IPC-based, not socket)
        cleanupUpdateListeners = initUpdateListeners();
      } catch (error) {
        logger.error('Failed to initialize:', error);
      }
    };

    init();

    return () => {
      logger.debug('Cleaning up listeners');
      cleanupSessionListeners();
      cleanupGitListeners();
      cleanupWorkspaceListeners();
      cleanupMcpListeners();
      cleanupUpdateListeners?.();
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
    initUpdateListeners,
  ]);
}
