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
import { useCustomCommandStore } from '@/stores/useCustomCommandStore';
import { useFsStore } from '@/stores/useFsStore';

export interface UseStoreListenersReturn {
  initAllListeners: () => void;
  cleanupAllListeners: () => void;
  fetchInternalMcpStatus: () => void;
}

/**
 * Hook that provides functions to register and cleanup all socket-based store listeners.
 *
 * Uses getState() to read listener functions directly from each store rather than
 * subscribing to them via selectors. These function references are stable (they never
 * change after store creation), so subscribing would only add unnecessary hook overhead.
 *
 * IMPORTANT: `initAllListeners()` must be called BEFORE `connectSocket()` so that
 * onConnect callbacks fire on the initial connection, not just on reconnect.
 */
export function useStoreListeners(): UseStoreListenersReturn {
  const initAllListeners = useCallback(() => {
    useConnectionStore.getState().initListeners();
    useSessionStore.getState().initListeners();
    useGitStore.getState().initListeners();
    useWorkspaceStore.getState().initListeners();
    useMcpStore.getState().initListeners();
    useTaskStore.getState().initListeners();
    useSessionHistoryStore.getState().initListeners();
    useTerminalStore.getState().initListeners();
    usePluginStore.getState().initListeners();
    useCustomCommandStore.getState().initListeners();
    useFsStore.getState().initListeners();
  }, []);

  const cleanupAllListeners = useCallback(() => {
    useConnectionStore.getState().cleanupListeners();
    useSessionStore.getState().cleanupListeners();
    useGitStore.getState().cleanupListeners();
    useWorkspaceStore.getState().cleanupListeners();
    useMcpStore.getState().cleanupListeners();
    useTaskStore.getState().cleanupListeners();
    useSessionHistoryStore.getState().cleanupListeners();
    useTerminalStore.getState().cleanupListeners();
    usePluginStore.getState().cleanupListeners();
    useCustomCommandStore.getState().cleanupListeners();
    useFsStore.getState().cleanupListeners();
  }, []);

  const fetchInternalMcpStatus = useCallback(() => {
    useMcpStore.getState().fetchInternalMcpStatus();
  }, []);

  return {
    initAllListeners,
    cleanupAllListeners,
    fetchInternalMcpStatus,
  };
}
