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
 * Initialize app-level socket connection and register store and updater listeners on mount.
 *
 * Establishes the socket connection, initializes listeners for session, workspace, git, and MCP stores,
 * triggers fetching of internal MCP status, and initializes IPC-based update listeners. Cleans up all
 * registered listeners when the component using this hook unmounts.
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
    let mounted = true;
    let cleanupUpdateListeners: (() => void) | undefined;
    const init = async () => {
      try {
        logger.info('Initializing app...');
        await connectSocket();
        if (!mounted) return;
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
      mounted = false;
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