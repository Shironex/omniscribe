import { useEffect } from 'react';
import { createLogger, type RestoreSnapshotResponse } from '@omniscribe/shared';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useGitStore } from '@/stores/useGitStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useSessionHistoryStore } from '@/stores/useSessionHistoryStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { connectSocket, socket } from '@/lib/socket';
import { resumeSession } from '@/lib/session';

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
      socket.emit('session:get-restore-snapshot', {}, (res: RestoreSnapshotResponse) => {
        clearTimeout(timeout);
        resolve(res);
      });
    });

    if (!response.autoResumeEnabled || response.sessions.length === 0) {
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
        const msg = err instanceof Error ? err.message : String(err);
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

  // Task store
  const initTaskListeners = useTaskStore(state => state.initListeners);
  const cleanupTaskListeners = useTaskStore(state => state.cleanupListeners);

  // Session history store
  const initSessionHistoryListeners = useSessionHistoryStore(state => state.initListeners);
  const cleanupSessionHistoryListeners = useSessionHistoryStore(state => state.cleanupListeners);

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
        initTaskListeners();
        initSessionHistoryListeners();
        logger.info('All listeners registered');
        await connectSocket();
        if (!mounted) return;
        logger.info('Socket connected');
        // Fetch internal MCP status on app start (requires active connection)
        fetchInternalMcpStatus();
        // Detect Claude CLI status early so pre-launch slots use the correct default AI mode
        detectClaudeCliStatus();
        // Auto-resume sessions from previous run if enabled
        autoResumeOnRestart();
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
      cleanupTaskListeners();
      cleanupSessionHistoryListeners();
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
    initTaskListeners,
    cleanupTaskListeners,
    initSessionHistoryListeners,
    cleanupSessionHistoryListeners,
    fetchInternalMcpStatus,
    initUpdateListeners,
  ]);
}
