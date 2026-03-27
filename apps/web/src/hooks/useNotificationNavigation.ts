import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { normalizePath } from '@omniscribe/shared';

/**
 * Listen for notification:navigate IPC events from the main process
 * and switch to the correct project tab when a notification is clicked.
 *
 * Handles both tabId (direct tab switch) and sessionId (resolve the
 * session's project path to find the matching tab). This ensures
 * zombie-cleanup notifications (which only have sessionId) still navigate.
 */
export function useNotificationNavigation(): void {
  const selectTab = useWorkspaceStore(state => state.selectTab);

  useEffect(() => {
    if (!window.electronAPI?.notification) return;

    const cleanup = window.electronAPI.notification.onNavigate(data => {
      if (data.tabId) {
        selectTab(data.tabId);
        return;
      }

      // Resolve tab from sessionId by looking up the session's projectPath
      if (data.sessionId) {
        const session = useSessionStore.getState().sessions.find(s => s.id === data.sessionId);
        if (session) {
          const normalizedPath = normalizePath(session.projectPath);
          const tab = useWorkspaceStore
            .getState()
            .tabs.find(t => normalizePath(t.projectPath) === normalizedPath);
          if (tab) {
            selectTab(tab.id);
          }
        }
      }
    });

    return cleanup;
  }, [selectTab]);
}
