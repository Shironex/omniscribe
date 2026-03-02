import { useEffect } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useTerminalStore } from '@/stores/useTerminalStore';

/**
 * Keeps the terminal session order in sync with the session store.
 * Adds new session IDs to the order array and removes stale ones.
 * Runs as a Zustand subscription (not a React re-render dependency).
 */
export function useSessionOrderSync() {
  useEffect(() => {
    const reconcile = (state: ReturnType<typeof useSessionStore.getState>) => {
      const currentOrder = useTerminalStore.getState().sessionOrder;
      const allIds = state.sessions.map(session => session.id);
      const allIdSet = new Set(allIds);
      const currentOrderSet = new Set(currentOrder);
      const validOrder = currentOrder.filter(id => allIdSet.has(id));
      const newIds = allIds.filter(id => !currentOrderSet.has(id));

      if (newIds.length > 0 || validOrder.length !== currentOrder.length) {
        useTerminalStore.getState().setSessionOrder([...validOrder, ...newIds]);
      }
    };

    // Initial sync for pre-existing sessions
    reconcile(useSessionStore.getState());

    let prevSessions = useSessionStore.getState().sessions;
    const unsub = useSessionStore.subscribe(state => {
      if (state.sessions === prevSessions) return;
      prevSessions = state.sessions;
      reconcile(state);
    });
    return unsub;
  }, []);
}
