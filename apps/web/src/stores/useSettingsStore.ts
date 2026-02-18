import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  Theme,
  SettingsSectionId,
  ClaudeCliStatus,
  GhCliStatus,
  ClaudeVersionCheckResult,
} from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import { themeOptions } from '@/lib/theme';
import { persistTheme, getPersistedTheme } from '@/lib/theme-persistence';

const logger = createLogger('Settings');

/**
 * Settings modal state
 */
interface SettingsModalState {
  /** Whether the settings modal is open */
  isOpen: boolean;
  /** Active section in settings */
  activeSection: SettingsSectionId;
}

/**
 * Settings state
 */
interface SettingsState extends SettingsModalState {
  /** Current theme */
  theme: Theme;
  /** Claude CLI status */
  claudeCliStatus: ClaudeCliStatus | null;
  /** Whether Claude CLI status is loading */
  isClaudeCliLoading: boolean;
  /** Claude CLI version check result */
  claudeVersionCheck: ClaudeVersionCheckResult | null;
  /** Whether version check is loading */
  isVersionCheckLoading: boolean;
  /** Available Claude CLI versions */
  availableVersions: string[];
  /** Whether versions list is loading */
  isVersionsLoading: boolean;
  /** GitHub CLI status */
  githubCliStatus: GhCliStatus | null;
  /** Whether GitHub CLI status is loading */
  isGithubCliLoading: boolean;
  /** Preview theme (for hover preview) */
  previewTheme: Theme | null;
}

/**
 * Settings actions
 */
interface SettingsActions {
  /** Open settings modal */
  openSettings: (section?: SettingsSectionId) => void;
  /** Close settings modal */
  closeSettings: () => void;
  /** Navigate to a section */
  navigateToSection: (section: SettingsSectionId) => void;
  /** Set theme */
  setTheme: (theme: Theme) => void;
  /** Set preview theme (for hover) */
  setPreviewTheme: (theme: Theme | null) => void;
  /** Apply theme to DOM */
  applyTheme: (theme: Theme) => void;
  /** Set Claude CLI status */
  setClaudeCliStatus: (status: ClaudeCliStatus | null) => void;
  /** Set Claude CLI loading state */
  setClaudeCliLoading: (loading: boolean) => void;
  /** Set Claude CLI version check result */
  setClaudeVersionCheck: (result: ClaudeVersionCheckResult | null) => void;
  /** Set version check loading state */
  setVersionCheckLoading: (loading: boolean) => void;
  /** Set available versions */
  setAvailableVersions: (versions: string[]) => void;
  /** Set versions loading state */
  setVersionsLoading: (loading: boolean) => void;
  /** Set GitHub CLI status */
  setGithubCliStatus: (status: GhCliStatus | null) => void;
  /** Set GitHub CLI loading state */
  setGithubCliLoading: (loading: boolean) => void;
}

/**
 * Combined store type
 */
type SettingsStore = SettingsState & SettingsActions;

/**
 * Track the currently-applied theme class so we can always remove it,
 * even for plugin themes not in the built-in themeOptions list.
 */
let currentThemeClass: string | null = null;

/**
 * Apply theme class to document element.
 * Handles both built-in and plugin theme classes.
 */
function applyThemeToDOM(theme: Theme) {
  logger.debug('applyThemeToDOM:', theme);
  const root = document.documentElement;

  // Remove the previously tracked theme class (covers plugin themes)
  if (currentThemeClass) {
    root.classList.remove(currentThemeClass);
  }

  // Also remove all known built-in theme classes (safety net for initial load)
  const allThemeClasses = themeOptions.map(t => t.value);
  root.classList.remove(...allThemeClasses);

  // Add new theme class and track it
  root.classList.add(theme);
  currentThemeClass = theme;
}

// Default theme
const DEFAULT_THEME: Theme = 'dark';

/**
 * Settings store using Zustand
 */
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    (set, get) => {
      // Resolve initial theme from localStorage (instant) or fall back to default
      const initialTheme = (
        typeof document !== 'undefined' ? getPersistedTheme() : DEFAULT_THEME
      ) as Theme;

      // Apply initial theme on store initialization
      if (typeof document !== 'undefined') {
        applyThemeToDOM(initialTheme);
      }

      return {
        // Initial state
        isOpen: false,
        activeSection: 'appearance',
        theme: initialTheme,
        claudeCliStatus: null,
        isClaudeCliLoading: false,
        claudeVersionCheck: null,
        isVersionCheckLoading: false,
        availableVersions: [],
        isVersionsLoading: false,
        githubCliStatus: null,
        isGithubCliLoading: false,
        previewTheme: null,

        // Actions
        openSettings: (section?: SettingsSectionId) => {
          logger.debug('openSettings', section ?? '(default)');
          set(
            {
              isOpen: true,
              activeSection: section ?? get().activeSection,
            },
            undefined,
            'settings/openSettings'
          );
        },

        closeSettings: () => {
          logger.debug('closeSettings');
          const state = get();
          // Clear preview theme when closing
          if (state.previewTheme) {
            applyThemeToDOM(state.theme);
          }
          set(
            {
              isOpen: false,
              previewTheme: null,
            },
            undefined,
            'settings/closeSettings'
          );
        },

        navigateToSection: (section: SettingsSectionId) => {
          logger.debug('navigateToSection', section);
          set({ activeSection: section }, undefined, 'settings/navigateToSection');
        },

        setTheme: (theme: Theme) => {
          logger.debug('setTheme', theme);
          set({ theme, previewTheme: null }, undefined, 'settings/setTheme');
          applyThemeToDOM(theme);
          persistTheme(theme);
        },

        setPreviewTheme: (theme: Theme | null) => {
          const state = get();
          set({ previewTheme: theme }, undefined, 'settings/setPreviewTheme');

          if (theme) {
            applyThemeToDOM(theme);
          } else {
            // Restore actual theme when preview ends
            applyThemeToDOM(state.theme);
          }
        },

        applyTheme: (theme: Theme) => {
          applyThemeToDOM(theme);
        },

        setClaudeCliStatus: (status: ClaudeCliStatus | null) => {
          logger.debug('setClaudeCliStatus', status?.installed, status?.version);
          set(
            { claudeCliStatus: status, isClaudeCliLoading: false },
            undefined,
            'settings/setClaudeCliStatus'
          );
        },

        setClaudeCliLoading: (loading: boolean) => {
          set({ isClaudeCliLoading: loading }, undefined, 'settings/setClaudeCliLoading');
        },

        setClaudeVersionCheck: (result: ClaudeVersionCheckResult | null) => {
          logger.debug('setClaudeVersionCheck', result?.isOutdated);
          set(
            { claudeVersionCheck: result, isVersionCheckLoading: false },
            undefined,
            'settings/setClaudeVersionCheck'
          );
        },

        setVersionCheckLoading: (loading: boolean) => {
          set({ isVersionCheckLoading: loading }, undefined, 'settings/setVersionCheckLoading');
        },

        setAvailableVersions: (versions: string[]) => {
          logger.debug('setAvailableVersions', { versions });
          set(
            { availableVersions: versions, isVersionsLoading: false },
            undefined,
            'settings/setAvailableVersions'
          );
        },

        setVersionsLoading: (loading: boolean) => {
          set({ isVersionsLoading: loading }, undefined, 'settings/setVersionsLoading');
        },

        setGithubCliStatus: (status: GhCliStatus | null) => {
          logger.debug('setGithubCliStatus', status?.installed, status?.version);
          set(
            { githubCliStatus: status, isGithubCliLoading: false },
            undefined,
            'settings/setGithubCliStatus'
          );
        },

        setGithubCliLoading: (loading: boolean) => {
          set({ isGithubCliLoading: loading }, undefined, 'settings/setGithubCliLoading');
        },
      };
    },
    { name: 'settings' }
  )
);

// Selectors

/**
 * Select modal open state
 */
export const selectIsSettingsOpen = (state: SettingsStore) => state.isOpen;

/**
 * Select active section
 */
export const selectActiveSection = (state: SettingsStore) => state.activeSection;

/**
 * Select current theme
 */
export const selectTheme = (state: SettingsStore) => state.theme;

/**
 * Select preview theme
 */
export const selectPreviewTheme = (state: SettingsStore) => state.previewTheme;

/**
 * Select effective theme (preview or actual)
 */
export const selectEffectiveTheme = (state: SettingsStore) => state.previewTheme ?? state.theme;

/**
 * Select Claude CLI status
 */
export const selectClaudeCliStatus = (state: SettingsStore) => state.claudeCliStatus;

/**
 * Select Claude CLI loading state
 */
export const selectClaudeCliLoading = (state: SettingsStore) => state.isClaudeCliLoading;

/**
 * Select Claude version check result
 */
export const selectClaudeVersionCheck = (state: SettingsStore) => state.claudeVersionCheck;

/**
 * Select version check loading state
 */
export const selectVersionCheckLoading = (state: SettingsStore) => state.isVersionCheckLoading;

/**
 * Select available versions
 */
export const selectAvailableVersions = (state: SettingsStore) => state.availableVersions;

/**
 * Select versions loading state
 */
export const selectVersionsLoading = (state: SettingsStore) => state.isVersionsLoading;

/**
 * Select GitHub CLI status
 */
export const selectGithubCliStatus = (state: SettingsStore) => state.githubCliStatus;

/**
 * Select GitHub CLI loading state
 */
export const selectGithubCliLoading = (state: SettingsStore) => state.isGithubCliLoading;
