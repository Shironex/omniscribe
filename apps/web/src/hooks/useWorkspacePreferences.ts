import { useEffect, useRef } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { persistTheme } from '@/lib/theme-persistence';
import type { Theme } from '@omniscribe/shared';

const logger = createLogger('Preferences');

/**
 * Hook for workspace theme synchronization.
 *
 * Uses a unidirectional sync pattern with two effects:
 * 1. Tab → Settings: On workspace restore and tab switches, apply tab's theme to settings.
 * 2. Settings → Tab: On user-initiated theme changes, persist to the active tab.
 *
 * A single ref (`lastAppliedByHookRef`) prevents the settings→tab effect from
 * firing when the theme change was caused by a tab switch (not a user action).
 */
export function useWorkspacePreferences(): void {
  const activeWorkspaceTabId = useWorkspaceStore(state => state.activeTabId);
  const isWorkspaceRestored = useWorkspaceStore(state => state.isRestored);
  const settingsTheme = useSettingsStore(state => state.theme);
  const updateTabTheme = useWorkspaceStore(state => state.updateTabTheme);

  // Distinguishes hook-initiated theme changes from user-initiated ones.
  // When the hook applies a tab's theme to settings, it stores the theme here.
  // The settings→tab effect checks this ref to avoid writing back.
  const lastAppliedByHookRef = useRef<Theme | null>(null);

  // Tab → Settings: Apply the active tab's theme on initial restore and tab switches.
  // Reads tab/preference data via getState() since those aren't trigger conditions.
  useEffect(() => {
    if (!isWorkspaceRestored) return;

    const { tabs, preferences } = useWorkspaceStore.getState();
    const activeTab = tabs.find(tab => tab.id === activeWorkspaceTabId);
    const themeToApply = (activeTab?.theme ?? preferences.theme ?? 'dark') as Theme;
    const currentTheme = useSettingsStore.getState().theme;

    if (themeToApply !== currentTheme) {
      logger.debug('Applying tab theme:', themeToApply);
      lastAppliedByHookRef.current = themeToApply;
      useSettingsStore.getState().setTheme(themeToApply);
    }
    // Persist to localStorage so next startup uses this theme immediately
    persistTheme(themeToApply);
  }, [isWorkspaceRestored, activeWorkspaceTabId]);

  // Settings → Tab: When user changes theme in settings, persist to the active tab.
  useEffect(() => {
    if (!isWorkspaceRestored) return;

    // Skip if this change was triggered by our tab-switch effect above
    if (lastAppliedByHookRef.current === settingsTheme) {
      lastAppliedByHookRef.current = null;
      return;
    }

    const { tabs, activeTabId } = useWorkspaceStore.getState();
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab && settingsTheme !== activeTab.theme) {
      updateTabTheme(activeTab.id, settingsTheme);
    }
  }, [settingsTheme, isWorkspaceRestored, updateTabTheme]);
}
