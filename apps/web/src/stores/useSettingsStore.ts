import { create } from 'zustand';
import { devtools } from './utils/devtools';
import type {
  Theme,
  SettingsSectionId,
  ClaudeCliStatus,
  GhCliStatus,
  ClaudeVersionCheckResult,
  ChromeSettings,
} from '@omniscribe/shared';
import {
  createLogger,
  DEFAULT_BUILT_IN_THEME,
  DEFAULT_CHROME_SETTINGS,
  migrateSettingsSectionId,
} from '@omniscribe/shared';
import { themeOptions } from '@/lib/theme';
import { persistTheme, getPersistedTheme } from '@/lib/theme-persistence';
import { usePluginStore, getPluginTheme } from '@/stores/usePluginStore';

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
  /** Chrome (window decoration & layout) toggles. */
  chrome: ChromeSettings;
  /** Timestamp (ms) of last persisted setting mutation, for the status bar. */
  lastSavedAt: number | null;
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
  /** Set theme. Accepts curated `Theme` or arbitrary plugin/legacy id string. */
  setTheme: (theme: Theme | string) => void;
  /** Set preview theme (for hover) */
  setPreviewTheme: (theme: Theme | null) => void;
  /** Apply theme to DOM */
  applyTheme: (theme: Theme | string) => void;
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
  /** Set a single chrome toggle */
  setChromeToggle: <K extends keyof ChromeSettings>(key: K, value: ChromeSettings[K]) => void;
}

/**
 * Combined store type
 */
type SettingsStore = SettingsState & SettingsActions;

/**
 * Track the currently-applied theme class and base class so we can
 * always remove them, even for plugin themes not in themeOptions.
 */
let currentThemeClass: string | null = null;
let currentBaseClass: string | null = null;

/**
 * Apply theme class to document element.
 * For plugin themes, also adds a base 'dark' or 'light' class so the
 * plugin only needs to override brand-specific CSS variables while
 * inheriting the full set from the base theme.
 */
function applyThemeToDOM(theme: Theme) {
  logger.debug('applyThemeToDOM:', theme);
  const root = document.documentElement;

  // Remove the previously tracked theme + base classes
  if (currentThemeClass) {
    root.classList.remove(currentThemeClass);
  }
  if (currentBaseClass) {
    root.classList.remove(currentBaseClass);
  }

  // Also remove all known built-in theme classes (safety net for initial load)
  const allThemeClasses = themeOptions.map(t => t.value);
  root.classList.remove(...allThemeClasses);

  // Check if this is a plugin theme that needs a base class
  const pluginTheme = getPluginTheme(theme);
  if (pluginTheme) {
    // Plugin themes cascade on top of the base dark/light theme
    const baseClass = pluginTheme.isDark ? 'dark' : 'light';
    root.classList.add(baseClass);
    currentBaseClass = baseClass;
  } else {
    currentBaseClass = null;
  }

  // Add the theme class
  root.classList.add(theme);
  currentThemeClass = theme;
}

// Default theme — Omniscribe's flagship Forge palette
const DEFAULT_THEME: Theme = DEFAULT_BUILT_IN_THEME;

const CHROME_STORAGE_KEY = 'omniscribe-chrome';

function readChrome(): ChromeSettings {
  try {
    const raw = localStorage.getItem(CHROME_STORAGE_KEY);
    if (!raw) return DEFAULT_CHROME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChromeSettings>;
    return { ...DEFAULT_CHROME_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_CHROME_SETTINGS;
  }
}

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

      // Resolve initial chrome from localStorage
      const initialChrome = readChrome();

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
        chrome: initialChrome,
        lastSavedAt: null,

        // Actions
        openSettings: (section?: SettingsSectionId) => {
          logger.debug('openSettings', section ?? '(default)');
          // Migrate retired section IDs (e.g. 'claude-changelog' →
          // 'changelog:claude') so external `openSettings()` callers and
          // any persisted activeSection still resolve.
          const resolved = section ? migrateSettingsSectionId(section) : get().activeSection;
          set(
            {
              isOpen: true,
              activeSection: resolved,
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
          const resolved = migrateSettingsSectionId(section);
          logger.debug('navigateToSection', resolved);
          set({ activeSection: resolved }, undefined, 'settings/navigateToSection');
        },

        setTheme: (theme: Theme | string) => {
          logger.debug('setTheme', theme);
          set(
            { theme: theme as Theme, previewTheme: null, lastSavedAt: Date.now() },
            undefined,
            'settings/setTheme'
          );
          applyThemeToDOM(theme as Theme);
          persistTheme(theme as Theme);
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

        applyTheme: (theme: Theme | string) => {
          applyThemeToDOM(theme as Theme);
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

        setChromeToggle: (key, value) => {
          logger.debug('setChromeToggle', key, value);
          const current = get().chrome;
          const next = { ...current, [key]: value };
          let persisted = false;
          try {
            localStorage.setItem(CHROME_STORAGE_KEY, JSON.stringify(next));
            persisted = true;
          } catch {
            logger.warn('setChromeToggle: failed to persist chrome settings');
          }
          // Only stamp lastSavedAt when persistence actually succeeded — otherwise
          // the status bar would falsely report "Saved Ns ago" for state that
          // won't survive a reload.
          set(
            { chrome: next, ...(persisted ? { lastSavedAt: Date.now() } : {}) },
            undefined,
            'settings/setChromeToggle'
          );
        },
      };
    },
    { name: 'settings' }
  )
);

// Re-apply theme when plugin themes change (handles race condition on initial
// load where applyThemeToDOM runs before plugins have registered their themes).
usePluginStore.subscribe((state, prevState) => {
  if (state.themes !== prevState.themes) {
    const { theme, previewTheme } = useSettingsStore.getState();
    applyThemeToDOM(previewTheme ?? theme);
  }
});

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
