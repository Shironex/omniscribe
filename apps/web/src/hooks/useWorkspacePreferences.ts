import { useCallback, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { Theme } from '@omniscribe/shared';

interface UseWorkspacePreferencesReturn {
  /** Whether sidebar is open */
  sidebarOpen: boolean;
  /** Sidebar width in pixels */
  sidebarWidth: number;
  /** Handler to toggle sidebar */
  handleToggleSidebar: () => void;
  /** Handler to change sidebar width */
  handleSidebarWidthChange: (width: number) => void;
}

/**
 * Hook for workspace preferences including sidebar state and theme synchronization.
 * Handles theme sync between tabs and settings.
 */
export function useWorkspacePreferences(): UseWorkspacePreferencesReturn {
  // Workspace store
  const workspacePreferences = useWorkspaceStore((state) => state.preferences);
  const activeWorkspaceTabId = useWorkspaceStore((state) => state.activeTabId);
  const getActiveTab = useWorkspaceStore((state) => state.getActiveTab);
  const updateTabTheme = useWorkspaceStore((state) => state.updateTabTheme);
  const updatePreference = useWorkspaceStore((state) => state.updatePreference);
  const isWorkspaceRestored = useWorkspaceStore((state) => state.isRestored);

  // Settings store
  const settingsTheme = useSettingsStore((state) => state.theme);
  const setSettingsTheme = useSettingsStore((state) => state.setTheme);

  // Derive sidebar from workspace preferences
  const sidebarOpen = workspacePreferences.sidebarOpen ?? true;
  const sidebarWidth = workspacePreferences.sidebarWidth ?? 240;

  // Track if initial theme sync from workspace has happened
  const hasInitialThemeSyncRef = useRef(false);

  // Track the previous active tab ID for detecting tab switches
  const prevActiveTabIdRef = useRef<string | null>(null);

  // Initial theme sync: Apply the active tab's theme on first load
  useEffect(() => {
    // Only sync once after workspace state is restored from backend
    if (hasInitialThemeSyncRef.current || !isWorkspaceRestored) {
      return;
    }

    const activeTab = getActiveTab();
    // Use tab theme if available, otherwise fall back to workspace preference or default
    const themeToApply = activeTab?.theme ?? workspacePreferences.theme ?? 'dark';
    hasInitialThemeSyncRef.current = true;
    if (themeToApply !== settingsTheme) {
      setSettingsTheme(themeToApply as Theme);
    }
  }, [isWorkspaceRestored, getActiveTab, workspacePreferences.theme, settingsTheme, setSettingsTheme]);

  // Tab switch: Apply the active tab's theme when switching projects
  useEffect(() => {
    // Skip if not yet initialized
    if (!hasInitialThemeSyncRef.current) {
      return;
    }

    // Only trigger on actual tab switches
    if (prevActiveTabIdRef.current === activeWorkspaceTabId) {
      return;
    }
    prevActiveTabIdRef.current = activeWorkspaceTabId;

    const activeTab = getActiveTab();
    if (activeTab?.theme && activeTab.theme !== settingsTheme) {
      setSettingsTheme(activeTab.theme);
    }
  }, [activeWorkspaceTabId, getActiveTab, settingsTheme, setSettingsTheme]);

  // Settings change: When user changes theme in settings, update the active tab's theme
  useEffect(() => {
    // Skip initial sync - only persist user-initiated changes
    if (!hasInitialThemeSyncRef.current) {
      return;
    }

    const activeTab = getActiveTab();
    if (activeTab && settingsTheme !== activeTab.theme) {
      updateTabTheme(activeTab.id, settingsTheme);
    }
  }, [settingsTheme, getActiveTab, updateTabTheme]);

  // Sidebar handlers
  const handleToggleSidebar = useCallback(() => {
    updatePreference('sidebarOpen', !sidebarOpen);
  }, [sidebarOpen, updatePreference]);

  const handleSidebarWidthChange = useCallback(
    (width: number) => {
      updatePreference('sidebarWidth', width);
    },
    [updatePreference]
  );

  return {
    sidebarOpen,
    sidebarWidth,
    handleToggleSidebar,
    handleSidebarWidthChange,
  };
}
