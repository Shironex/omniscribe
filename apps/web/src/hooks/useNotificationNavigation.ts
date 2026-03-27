import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

/**
 * Listen for notification:navigate IPC events from the main process
 * and switch to the correct project tab when a notification is clicked.
 */
export function useNotificationNavigation(): void {
  const selectTab = useWorkspaceStore(state => state.selectTab);

  useEffect(() => {
    if (!window.electronAPI?.notification) return;

    const cleanup = window.electronAPI.notification.onNavigate(data => {
      // Switch to the correct project tab if we have a tabId
      if (data.tabId) {
        selectTab(data.tabId);
      }
    });

    return cleanup;
  }, [selectTab]);
}
