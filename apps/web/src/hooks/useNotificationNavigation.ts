import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { normalizePath } from '@omniscribe/shared';

/**
 * Listen for notification:navigate IPC events from the main process
 * (sent when an omniscribe://session/<id> deep link is opened) and switch
 * to the correct project tab.
 *
 * Handles both tabId (direct tab switch) and sessionId (resolve the
 * session's project path to find the matching tab), since the `tab`
 * query parameter is optional.
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
