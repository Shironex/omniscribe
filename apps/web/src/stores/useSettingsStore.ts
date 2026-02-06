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
 * Apply theme class to document element
 */
function applyThemeToDOM(theme: Theme) {
  logger.debug('applyThemeToDOM:', theme);
  const root = document.documentElement;
  const allThemeClasses = themeOptions.map(t => t.value);

  // Remove all theme classes
  root.classList.remove(...allThemeClasses);

  // Add new theme class
  root.classList.add(theme);
}

// Default theme
const DEFAULT_THEME: Theme = 'dark';

/**
 * Settings store using Zustand
 */
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    (set, get) => {
      // Apply default theme on store initialization
      if (typeof document !== 'undefined') {
        applyThemeToDOM(DEFAULT_THEME);
      }

      return {
        // Initial state
        isOpen: false,
        activeSection: 'appearance',
        theme: DEFAULT_THEME,
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
          set({ activeSection: section }, undefined, 'settings/navigateToSection');
        },

        setTheme: (theme: Theme) => {
          set({ theme, previewTheme: null }, undefined, 'settings/setTheme');
          applyThemeToDOM(theme);
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
