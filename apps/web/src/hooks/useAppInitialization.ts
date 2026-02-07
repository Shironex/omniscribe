import { useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useGitStore } from '@/stores/useGitStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { connectSocket } from '@/lib/socket';

const logger = createLogger('AppInit');

/**
 * Detect Claude CLI installation status via IPC and store the result.
 * Called early at startup so pre-launch slots default to the correct AI mode.
 */
async function detectClaudeCliStatus(): Promise<void> {
  try {
    if (window.electronAPI?.claude?.getStatus) {
      const status = await window.electronAPI.claude.getStatus();
      useSettingsStore.getState().setClaudeCliStatus(status);
      logger.info('Claude CLI detected:', status.installed ? 'installed' : 'not installed');
    }
  } catch (error) {
    logger.warn('Failed to detect Claude CLI status:', error);
  }
}

/**
 * Initialize app-level socket connection and register store and updater listeners on mount.
 *
 * Registers socket listeners for session, workspace, git, and MCP stores BEFORE establishing the
 * socket connection, ensuring that onConnect callbacks fire on the initial connection (not just on
 * reconnect). After connecting, triggers fetching of internal MCP status and initializes IPC-based
 * update listeners. Cleans up all registered listeners when the component using this hook unmounts.
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

  // Connection store (global socket connection state)
  const initConnectionListeners = useConnectionStore(state => state.initListeners);
  const cleanupConnectionListeners = useConnectionStore(state => state.cleanupListeners);

  // Update store (uses IPC, not socket — init separately)
  const initUpdateListeners = useUpdateStore(state => state.initListeners);

  // Initialize stores and socket on mount
  useEffect(() => {
    let mounted = true;
    let cleanupUpdateListeners: (() => void) | undefined;
    const init = async () => {
      try {
        logger.info('Initializing app...');
        // Register all socket listeners BEFORE connecting so that onConnect
        // callbacks fire on the initial connection, not just on reconnect
        initConnectionListeners();
        initSessionListeners();
        initGitListeners();
        initWorkspaceListeners();
        initMcpListeners();
        logger.info('All listeners registered');
        await connectSocket();
        if (!mounted) return;
        logger.info('Socket connected');
        // Fetch internal MCP status on app start (requires active connection)
        fetchInternalMcpStatus();
        // Detect Claude CLI status early so pre-launch slots use the correct default AI mode
        detectClaudeCliStatus();
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
      cleanupConnectionListeners();
      cleanupSessionListeners();
      cleanupGitListeners();
      cleanupWorkspaceListeners();
      cleanupMcpListeners();
      cleanupUpdateListeners?.();
    };
  }, [
    initConnectionListeners,
    cleanupConnectionListeners,
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
