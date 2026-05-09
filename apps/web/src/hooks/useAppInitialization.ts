import { useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { connectSocket, initializeSocket } from '@/lib/socket';
import { useStoreListeners } from './useStoreListeners';
import { usePluginInitialization } from './usePluginInitialization';

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
  const { initAllListeners, cleanupAllListeners, fetchInternalMcpStatus } = useStoreListeners();

  // Initialize plugin system (socket listeners + frontend activation)
  usePluginInitialization();

  // Update store (uses IPC, not socket — init separately)
  const initUpdateListeners = useUpdateStore(state => state.initListeners);

  // Initialize stores and socket on mount
  useEffect(() => {
    let mounted = true;
    let cleanupUpdateListeners: (() => void) | undefined;
    const init = async () => {
      try {
        logger.info('Initializing app...');
        // Fetch backend port via IPC and initialize socket
        const port = await window.electronAPI?.app?.getBackendPort?.();
        if (port === undefined || port === null) {
          throw new Error('Failed to get backend port — electronAPI not available');
        }
        if (port <= 0 || port > 65535) {
          throw new Error(`Invalid backend port: ${port}`);
        }
        const wsAuthToken = await window.electronAPI?.app?.getWsAuthToken?.();
        if (typeof wsAuthToken !== 'string' || wsAuthToken.length === 0) {
          throw new Error('Failed to get WS auth token — electronAPI not available');
        }
        initializeSocket(port, wsAuthToken);
        // Register all socket listeners BEFORE connecting so that onConnect
        // callbacks fire on the initial connection, not just on reconnect
        initAllListeners();
        logger.info('All listeners registered');
        await connectSocket();
        if (!mounted) return;
        logger.info('Socket connected');
        // Fetch internal MCP status on app start (requires active connection)
        fetchInternalMcpStatus();
        // Detect Claude CLI status early so pre-launch slots use the correct default AI mode
        detectClaudeCliStatus().catch(() => {}); // internal try/catch handles logging
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
      cleanupAllListeners();
      cleanupUpdateListeners?.();
    };
  }, [initAllListeners, cleanupAllListeners, fetchInternalMcpStatus, initUpdateListeners]);
}
