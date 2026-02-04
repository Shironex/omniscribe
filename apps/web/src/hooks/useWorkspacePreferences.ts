import { useEffect, useRef, useMemo } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Theme } from '@omniscribe/shared';

const logger = createLogger('Preferences');

/**
 * Hook for workspace theme synchronization.
 * Syncs theme between project tabs and settings store.
 */
export function useWorkspacePreferences(): void {
  // Workspace store - use stable selectors
  const workspaceTabs = useWorkspaceStore((state) => state.tabs);
  const activeWorkspaceTabId = useWorkspaceStore((state) => state.activeTabId);
  const workspacePreferences = useWorkspaceStore((state) => state.preferences);
  const updateTabTheme = useWorkspaceStore((state) => state.updateTabTheme);
  const isWorkspaceRestored = useWorkspaceStore((state) => state.isRestored);

  // Settings store
  const settingsTheme = useSettingsStore((state) => state.theme);
  const setSettingsTheme = useSettingsStore((state) => state.setTheme);

  // Compute active tab using useMemo (stable reference)
  const activeTab = useMemo(() => {
    if (!activeWorkspaceTabId) return undefined;
    return workspaceTabs.find((tab) => tab.id === activeWorkspaceTabId);
  }, [workspaceTabs, activeWorkspaceTabId]);

  // Track if initial theme sync has happened
  const hasInitialThemeSyncRef = useRef(false);

  // Track the previous active tab ID for detecting tab switches
  const prevActiveTabIdRef = useRef<string | null>(null);

  // Track the previous settings theme to detect user changes
  const prevSettingsThemeRef = useRef<Theme | null>(null);

  // Track if a tab switch is in progress to prevent race conditions
  // This prevents the settings-to-tab effect from firing during programmatic theme changes
  const isTabSwitchInProgressRef = useRef(false);

  // Initial theme sync: Apply the active tab's theme on first load
  useEffect(() => {
    // Only sync once after workspace state is restored from backend
    if (hasInitialThemeSyncRef.current || !isWorkspaceRestored) {
      return;
    }

    // Use tab theme if available, otherwise fall back to workspace preference or default
    const themeToApply = activeTab?.theme ?? workspacePreferences.theme ?? 'dark';
    hasInitialThemeSyncRef.current = true;
    prevSettingsThemeRef.current = themeToApply as Theme;

    if (themeToApply !== settingsTheme) {
      logger.debug('Initial theme sync:', themeToApply);
      setSettingsTheme(themeToApply as Theme);
    }
  }, [isWorkspaceRestored, activeTab?.theme, workspacePreferences.theme, settingsTheme, setSettingsTheme]);

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

    // Guard: Only apply theme if we have valid tab data
    // This prevents race conditions where activeTabId updates before tabs array
    if (!activeTab) {
      return;
    }

    if (activeTab.theme && activeTab.theme !== settingsTheme) {
      logger.debug('Tab switch theme:', activeTab.theme);
      // Set flag to prevent the settings-to-tab effect from firing
      isTabSwitchInProgressRef.current = true;
      prevSettingsThemeRef.current = activeTab.theme;
      setSettingsTheme(activeTab.theme);

      // Clear flag after microtask queue flushes to allow state to settle
      queueMicrotask(() => {
        isTabSwitchInProgressRef.current = false;
      });
    }
  }, [activeWorkspaceTabId, activeTab, settingsTheme, setSettingsTheme]);

  // Settings change: When user changes theme in settings, update the active tab's theme
  useEffect(() => {
    // Skip initial sync - only persist user-initiated changes
    if (!hasInitialThemeSyncRef.current) {
      return;
    }

    // Skip if a tab switch is in progress - prevents race condition where
    // changing settingsTheme during tab switch would write to wrong tab
    if (isTabSwitchInProgressRef.current) {
      return;
    }

    // Skip if this is a programmatic change (from tab switch)
    if (prevSettingsThemeRef.current === settingsTheme) {
      return;
    }
    prevSettingsThemeRef.current = settingsTheme;

    if (activeTab && settingsTheme !== activeTab.theme) {
      updateTabTheme(activeTab.id, settingsTheme);
    }
  }, [settingsTheme, activeTab, updateTabTheme]);
}
