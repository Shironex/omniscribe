import { create } from 'zustand';
import type { Theme, SettingsSectionId, ClaudeCliStatus, GhCliStatus } from '@omniscribe/shared';
import { themeOptions } from '../config/theme-options';

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
  const root = document.documentElement;
  const allThemeClasses = themeOptions.map((t) => t.value);

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
export const useSettingsStore = create<SettingsStore>((set, get) => {
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
  githubCliStatus: null,
  isGithubCliLoading: false,
  previewTheme: null,

  // Actions
  openSettings: (section?: SettingsSectionId) => {
    set({
      isOpen: true,
      activeSection: section ?? get().activeSection,
    });
  },

  closeSettings: () => {
    const state = get();
    // Clear preview theme when closing
    if (state.previewTheme) {
      applyThemeToDOM(state.theme);
    }
    set({
      isOpen: false,
      previewTheme: null,
    });
  },

  navigateToSection: (section: SettingsSectionId) => {
    set({ activeSection: section });
  },

  setTheme: (theme: Theme) => {
    set({ theme, previewTheme: null });
    applyThemeToDOM(theme);
  },

  setPreviewTheme: (theme: Theme | null) => {
    const state = get();
    set({ previewTheme: theme });

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
    set({ claudeCliStatus: status, isClaudeCliLoading: false });
  },

  setClaudeCliLoading: (loading: boolean) => {
    set({ isClaudeCliLoading: loading });
  },

  setGithubCliStatus: (status: GhCliStatus | null) => {
    set({ githubCliStatus: status, isGithubCliLoading: false });
  },

  setGithubCliLoading: (loading: boolean) => {
    set({ isGithubCliLoading: loading });
  },
}});

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
export const selectEffectiveTheme = (state: SettingsStore) =>
  state.previewTheme ?? state.theme;

/**
 * Select Claude CLI status
 */
export const selectClaudeCliStatus = (state: SettingsStore) => state.claudeCliStatus;

/**
 * Select Claude CLI loading state
 */
export const selectClaudeCliLoading = (state: SettingsStore) => state.isClaudeCliLoading;

/**
 * Select GitHub CLI status
 */
export const selectGithubCliStatus = (state: SettingsStore) => state.githubCliStatus;

/**
 * Select GitHub CLI loading state
 */
export const selectGithubCliLoading = (state: SettingsStore) => state.isGithubCliLoading;
