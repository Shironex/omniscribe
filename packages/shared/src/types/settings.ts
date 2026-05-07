/**
 * Settings Types - Shared types for settings storage
 */

import type { AiMode } from './session';

/**
 * Theme - Curated set of built-in color themes.
 *
 * The catalog was simplified from 41 alphabetical themes (21 dark + 20 light)
 * down to 8 hand-tuned palettes. Persisted IDs from the old catalog are
 * remapped via {@link LEGACY_THEME_MIGRATION} on first load.
 */
export type Theme =
  | 'forge'
  | 'carbon'
  | 'ember'
  | 'iceberg'
  | 'paper'
  | 'nord'
  | 'gruvbox'
  | 'dracula';

/**
 * Theme metadata used by both the renderer (gradient swatches) and any
 * surface that needs to look up a theme without parsing CSS at runtime.
 */
export interface ThemeMeta {
  value: Theme;
  label: string;
  isDark: boolean;
  /** Four-tile palette quartet shown in the appearance grid. */
  swatch: { bg: string; surface: string; primary: string; accent: string };
}

/**
 * The single curated catalog. Order is the order shown in the appearance grid.
 */
export const BUILT_IN_THEMES: readonly ThemeMeta[] = [
  {
    value: 'forge',
    label: 'Forge',
    isDark: true,
    swatch: { bg: '#0f0e0d', surface: '#1a1714', primary: '#e89143', accent: '#5b9cf2' },
  },
  {
    value: 'carbon',
    label: 'Carbon',
    isDark: true,
    swatch: { bg: '#0a0a0c', surface: '#15161a', primary: '#3b8df0', accent: '#6e7782' },
  },
  {
    value: 'ember',
    label: 'Ember',
    isDark: true,
    swatch: { bg: '#1a0e0a', surface: '#241410', primary: '#e88a52', accent: '#d96d6d' },
  },
  {
    value: 'iceberg',
    label: 'Iceberg',
    isDark: true,
    swatch: { bg: '#0c1422', surface: '#142036', primary: '#7aa6e8', accent: '#8de0d0' },
  },
  {
    value: 'paper',
    label: 'Paper',
    isDark: false,
    swatch: { bg: '#faf6ee', surface: '#f1ebdf', primary: '#c75a40', accent: '#3f7a4d' },
  },
  {
    value: 'nord',
    label: 'Nord',
    isDark: true,
    swatch: { bg: '#2e3440', surface: '#3b4252', primary: '#88c0d0', accent: '#a3be8c' },
  },
  {
    value: 'gruvbox',
    label: 'Gruvbox',
    isDark: true,
    swatch: { bg: '#282828', surface: '#3c3836', primary: '#d79921', accent: '#fabd2f' },
  },
  {
    value: 'dracula',
    label: 'Dracula',
    isDark: true,
    swatch: { bg: '#282a36', surface: '#383a4a', primary: '#50fa7b', accent: '#ff79c6' },
  },
];

/**
 * The default theme — Omniscribe's flagship "Forge" warm-charcoal × ember palette.
 */
export const DEFAULT_BUILT_IN_THEME: Theme = 'forge';

/**
 * Legacy theme IDs (pre-curation) and the closest match in the new catalog.
 * Used by the renderer's persistence shim to silently migrate users on
 * retired themes without resetting them to the default.
 */
export const LEGACY_THEME_MIGRATION = {
  // ── Dark legacy → Forge family ────────────────────────────────────
  dark: 'forge',
  midnight: 'forge',
  retro: 'forge',
  // ── Carbon-ish neutrals ───────────────────────────────────────────
  gray: 'carbon',
  onedark: 'carbon',
  tokyonight: 'iceberg',
  // ── Warm / red palettes → Ember ───────────────────────────────────
  red: 'ember',
  sunset: 'ember',
  monokai: 'dracula',
  synthwave: 'dracula',
  // ── Cool / blue palettes → Iceberg ────────────────────────────────
  ocean: 'iceberg',
  'ayu-mirage': 'iceberg',
  catppuccin: 'iceberg',
  solarized: 'iceberg',
  // ── Greens → Nord ─────────────────────────────────────────────────
  forest: 'nord',
  matcha: 'nord',
  // ── Yellow/orange dark → Gruvbox ──────────────────────────────────
  'ayu-dark': 'gruvbox',
  // ── Light themes → Paper ──────────────────────────────────────────
  light: 'paper',
  'ayu-light': 'paper',
  blossom: 'paper',
  bluloco: 'paper',
  cream: 'paper',
  feather: 'paper',
  github: 'paper',
  gruvboxlight: 'paper',
  lavender: 'paper',
  mint: 'paper',
  nordlight: 'paper',
  onelight: 'paper',
  peach: 'paper',
  rose: 'paper',
  sand: 'paper',
  sepia: 'paper',
  sky: 'paper',
  snow: 'paper',
  solarizedlight: 'paper',
} as const satisfies Record<string, Theme>;

/**
 * Union of every retired legacy theme ID handled by {@link LEGACY_THEME_MIGRATION}.
 */
export type LegacyThemeId = keyof typeof LEGACY_THEME_MIGRATION;

/**
 * Chrome (window decoration & layout) toggles.
 */
export interface ChromeSettings {
  showStatusBar: boolean;
}

export const DEFAULT_CHROME_SETTINGS: ChromeSettings = {
  showStatusBar: true,
};

/**
 * Claude CLI Status
 */
export interface ClaudeCliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  method?: 'path' | 'local';
  platform: string;
  arch: string;
  auth: {
    authenticated: boolean;
  };
  /** Latest available version from npm registry */
  latestVersion?: string;
  /** Whether the installed version is outdated */
  isOutdated?: boolean;
  /** ISO date string of last version check */
  lastVersionCheck?: string;
}

/**
 * Claude CLI Version Check Result
 */
export interface ClaudeVersionCheckResult {
  installedVersion?: string;
  latestVersion: string;
  isOutdated: boolean;
  lastChecked: string;
}

/**
 * Claude CLI Available Versions List
 */
export interface ClaudeVersionList {
  versions: string[];
}

/**
 * Install command options
 */
export interface ClaudeInstallCommandOptions {
  isUpdate: boolean;
  version?: string;
}

/**
 * Install command result
 */
export interface ClaudeInstallCommand {
  command: string;
  description: string;
}

/**
 * Settings section IDs for navigation.
 *
 * Includes new IA introduced by the v2 redesign (Agents bucket, Keymap)
 * and legacy IDs retained for backwards compatibility with persisted
 * `activeSection` values, plugin SDKs, and external `openSettings()`
 * call sites that pin to the old names.
 */
export type SettingsSectionId =
  // ── Integrations ──────────────────────────────────────────────────
  | 'integrations'
  | 'github'
  | 'mcp'
  | 'ai-capabilities'
  | 'marketplace'
  // ── Workflow ──────────────────────────────────────────────────────
  | 'sessions'
  | 'quickActions'
  | 'worktrees'
  | 'notifications'
  // ── Interface ─────────────────────────────────────────────────────
  | 'appearance'
  | 'terminal'
  // ── Retained for backwards compatibility ─────────────────────────
  /** @deprecated Routed to 'appearance'. Retained for one minor version. */
  | 'general'
  | (string & {});

/**
 * Worktree creation mode
 * - 'branch': Create worktree only when selecting a non-current branch (default)
 * - 'always': Always create a new worktree with random suffix for full isolation
 * - 'never': Never use worktrees, always work in main project directory
 */
export type WorktreeMode = 'branch' | 'always' | 'never';

/**
 * Worktree storage location
 * - 'project': Store in project's .worktrees/ directory (portable, visible)
 * - 'central': Store in ~/.omniscribe/worktrees/ (hidden, shared across projects)
 */
export type WorktreeLocation = 'project' | 'central';

/**
 * Worktree-related settings
 */
export interface WorktreeSettings {
  /** Worktree creation mode */
  mode: WorktreeMode;
  /** Where to store worktrees */
  location: WorktreeLocation;
  /** Whether to auto-cleanup worktrees when session ends */
  autoCleanup: boolean;
}

/**
 * Default worktree settings
 */
export const DEFAULT_WORKTREE_SETTINGS: WorktreeSettings = {
  mode: 'branch',
  location: 'project',
  autoCleanup: false, // Disabled by default - feature is experimental
};

/**
 * Quick action execution mode
 * - 'paste-only': Paste command text into terminal without executing (safe default)
 * - 'execute': Paste and auto-execute command in terminal
 */
export type QuickActionMode = 'paste-only' | 'execute';

/**
 * Session-related settings
 */
export interface SessionSettings {
  /** Default AI mode for new pre-launch slots */
  defaultMode: AiMode;
  /** Whether to launch Claude sessions with --dangerously-skip-permissions */
  skipPermissions?: boolean;
  /** Quick action execution mode */
  quickActionMode?: QuickActionMode;
}

/**
 * Default session settings
 */
export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  defaultMode: 'claude',
  skipPermissions: false,
  quickActionMode: 'paste-only',
};

/**
 * Notification event toggles
 */
export interface NotificationEventSettings {
  /** Notify when a session completes */
  sessionCompleted: boolean;
  /** Notify when a session needs user input */
  sessionNeedsInput: boolean;
  /** Notify when a session encounters an error */
  sessionError: boolean;
  /** Notify when a zombie session is cleaned up */
  zombieDetected: boolean;
  /** Notify when an app update is available */
  updateAvailable: boolean;
  /** Notify when an app update is downloaded and ready */
  updateDownloaded: boolean;
}

/**
 * Desktop notification settings
 */
export interface NotificationSettings {
  /** Master toggle for all OS notifications */
  enabled: boolean;
  /** Play system sound with notifications */
  sound: boolean;
  /** Only show OS notifications when app window is unfocused */
  onlyWhenUnfocused: boolean;
  /** Individual event type toggles */
  events: NotificationEventSettings;
}

/**
 * Default notification settings
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  sound: true,
  onlyWhenUnfocused: true,
  events: {
    sessionCompleted: true,
    sessionNeedsInput: true,
    sessionError: true,
    zombieDetected: true,
    updateAvailable: true,
    updateDownloaded: true,
  },
};

/**
 * Dark themes list — derived from the curated catalog.
 */
export const DARK_THEMES: readonly Theme[] = BUILT_IN_THEMES.filter(t => t.isDark).map(
  t => t.value
);

/**
 * Light themes list — derived from the curated catalog.
 */
export const LIGHT_THEMES: readonly Theme[] = BUILT_IN_THEMES.filter(t => !t.isDark).map(
  t => t.value
);

/**
 * All themes list — every built-in theme value, in catalog order.
 */
export const ALL_THEMES: readonly Theme[] = BUILT_IN_THEMES.map(t => t.value);

/**
 * Editor protocol identifier for file path links
 */
export type EditorProtocol = 'vscode' | 'vscode-insiders' | 'cursor';

/**
 * Editor option with display info and protocol mapping
 */
export interface EditorOption {
  /** Protocol identifier */
  id: EditorProtocol;
  /** Human-readable display name */
  name: string;
  /** CLI command used for detection (e.g., 'code', 'cursor') */
  cliCommand: string;
}

/**
 * Supported editors with their protocol and CLI command mappings
 */
export const EDITOR_OPTIONS: readonly EditorOption[] = [
  { id: 'vscode', name: 'VS Code', cliCommand: 'code' },
  { id: 'vscode-insiders', name: 'VS Code Insiders', cliCommand: 'code-insiders' },
  { id: 'cursor', name: 'Cursor', cliCommand: 'cursor' },
];

/**
 * Default editor protocol when no preference is set
 */
export const DEFAULT_EDITOR_PROTOCOL: EditorProtocol = 'vscode';
