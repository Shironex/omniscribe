import { useEffect } from 'react';
import {
  createLogger,
  extractErrorMessage,
  SessionEvents,
  type RestoreSnapshotResponse,
} from '@omniscribe/shared';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { connectSocket, getSocket, initializeSocket } from '@/lib/socket';
import { resumeSession } from '@/lib/session';
import { useStoreListeners } from './useStoreListeners';

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
 * Check if auto-resume is enabled and resume any sessions that were active when Omniscribe last closed.
 * Called once on startup after the socket connection is established.
 */
async function autoResumeOnRestart(): Promise<void> {
  try {
    const response = await new Promise<RestoreSnapshotResponse>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      getSocket().emit(SessionEvents.GET_RESTORE_SNAPSHOT, {}, (res: RestoreSnapshotResponse) => {
        clearTimeout(timeout);
        resolve(res);
      });
    });

    if (!response.autoResumeEnabled) {
      logger.debug('Auto-resume disabled in preferences, skipping');
      return;
    }
    if (response.sessions.length === 0) {
      logger.debug('No sessions in restore snapshot, skipping auto-resume');
      return;
    }

    logger.info(`Auto-resuming ${response.sessions.length} sessions from previous run`);

    for (const snapshot of response.sessions) {
      try {
        await resumeSession(
          snapshot.claudeSessionId,
          snapshot.projectPath,
          snapshot.branch,
          snapshot.name
        );
        logger.info(`Auto-resumed session: ${snapshot.name}`);
      } catch (err) {
        const msg = extractErrorMessage(err);
        logger.warn(`Failed to auto-resume session ${snapshot.name}: ${msg}`);
      }
    }
  } catch (error) {
    logger.warn('Failed to check auto-resume snapshot:', error);
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
        initializeSocket(port);
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
        // Auto-resume sessions from previous run if enabled
        autoResumeOnRestart().catch(() => {}); // internal try/catch handles logging
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
