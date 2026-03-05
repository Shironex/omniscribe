import { useCallback } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useGitStore } from '@/stores/useGitStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useSessionHistoryStore } from '@/stores/useSessionHistoryStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { useSwarmStore } from '@/stores/useSwarmStore';

export interface UseStoreListenersReturn {
  initAllListeners: () => void;
  cleanupAllListeners: () => void;
  fetchInternalMcpStatus: () => void;
}

/**
 * Hook that subscribes to all store init/cleanup listener pairs.
 * Returns functions to synchronously register and cleanup all socket-based store listeners.
 *
 * IMPORTANT: `initAllListeners()` must be called BEFORE `connectSocket()` so that
 * onConnect callbacks fire on the initial connection, not just on reconnect.
 */
export function useStoreListeners(): UseStoreListenersReturn {
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

  // Terminal store (backpressure events)
  const initTerminalListeners = useTerminalStore(state => state.initListeners);
  const cleanupTerminalListeners = useTerminalStore(state => state.cleanupListeners);

  // Plugin store (provider status, enabled, error events)
  const initPluginListeners = usePluginStore(state => state.initListeners);
  const cleanupPluginListeners = usePluginStore(state => state.cleanupListeners);

  // Swarm store (swarm lifecycle, agents, tasks, messages)
  const initSwarmListeners = useSwarmStore(state => state.initListeners);
  const cleanupSwarmListeners = useSwarmStore(state => state.cleanupListeners);

  const initAllListeners = useCallback(() => {
    initConnectionListeners();
    initSessionListeners();
    initGitListeners();
    initWorkspaceListeners();
    initMcpListeners();
    initTaskListeners();
    initSessionHistoryListeners();
    initTerminalListeners();
    initPluginListeners();
    initSwarmListeners();
  }, [
    initConnectionListeners,
    initSessionListeners,
    initGitListeners,
    initWorkspaceListeners,
    initMcpListeners,
    initTaskListeners,
    initSessionHistoryListeners,
    initTerminalListeners,
    initPluginListeners,
    initSwarmListeners,
  ]);

  const cleanupAllListeners = useCallback(() => {
    cleanupConnectionListeners();
    cleanupSessionListeners();
    cleanupGitListeners();
    cleanupWorkspaceListeners();
    cleanupMcpListeners();
    cleanupTaskListeners();
    cleanupSessionHistoryListeners();
    cleanupTerminalListeners();
    cleanupPluginListeners();
    cleanupSwarmListeners();
  }, [
    cleanupConnectionListeners,
    cleanupSessionListeners,
    cleanupGitListeners,
    cleanupWorkspaceListeners,
    cleanupMcpListeners,
    cleanupTaskListeners,
    cleanupSessionHistoryListeners,
    cleanupTerminalListeners,
    cleanupPluginListeners,
    cleanupSwarmListeners,
  ]);

  return {
    initAllListeners,
    cleanupAllListeners,
    fetchInternalMcpStatus,
  };
}
