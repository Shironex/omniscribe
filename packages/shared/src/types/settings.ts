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
  | 'dracula'
  | 'plum'
  | 'abyss';

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
  {
    value: 'plum',
    label: 'Plum',
    isDark: true,
    swatch: { bg: '#1a161f', surface: '#241d2b', primary: '#d46cb1', accent: '#5b9cf2' },
  },
  {
    value: 'abyss',
    label: 'Abyss',
    isDark: true,
    swatch: { bg: '#0a1d1f', surface: '#0f292c', primary: '#5fc7bf', accent: '#e89143' },
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
 * Background surface kind for the appearance "blend" layer.
 * - 'none': plain theme background (default)
 * - 'image': user-supplied image rendered as a translucent overlay
 */
export type BackgroundKind = 'none' | 'image';

/**
 * Appearance background ("blend") settings. The image itself is stored
 * in IndexedDB and referenced by `imageId`; only this small config blob
 * is persisted to localStorage so the surface can paint on first frame.
 */
export interface AppearanceBackgroundSettings {
  kind: BackgroundKind;
  /** IndexedDB record id of the active background image, if any. */
  imageId: string | null;
  /** User-facing opacity 0..1. Rendered opacity is capped via {@link BG_OPACITY_RENDER_FACTOR}. */
  opacity: number;
  /** Blur radius in px applied to the background image (0 = off). */
  blur: number;
}

/**
 * Hard cap factor between the user's opacity slider and the rendered
 * overlay opacity, so the background can never fully obscure the UI
 * (rendered = opacity × factor, i.e. max 50%).
 */
export const BG_OPACITY_RENDER_FACTOR = 0.5;

export const DEFAULT_APPEARANCE_BACKGROUND: AppearanceBackgroundSettings = {
  kind: 'none',
  imageId: null,
  opacity: 0.5,
  blur: 0,
};

/**
 * Native window background effect.
 * - 'none': opaque themed window (default)
 * - 'vibrancy': macOS NSVisualEffectView blur of the desktop behind the window
 * - 'acrylic': Windows 11 acrylic material
 * Linux has no native effect; the renderer must treat unsupported
 * effects as 'none'.
 */
export type WindowEffect = 'none' | 'vibrancy' | 'acrylic';

export const DEFAULT_WINDOW_EFFECT: WindowEffect = 'none';

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
 *
 * Plugin-contributed section IDs follow `<plugin-shorthand>:<short-name>`
 * (e.g. `'changelog:claude'`, `'changelog:codex'`) — those typecheck via
 * the `(string & {})` fallback below. Retired section IDs (e.g. the old
 * `'claude-changelog'`) live in {@link LEGACY_SETTINGS_SECTION_MIGRATION}.
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
  | 'general'
  | (string & {});

/**
 * Retired settings section IDs (mapped to their replacement IDs). Used
 * by the renderer's persistence shim to silently migrate users whose
 * persisted `activeSection` (or any external `openSettings(legacy)` call
 * site) still references an old name.
 *
 * Pattern matches {@link LEGACY_THEME_MIGRATION}.
 */
export const LEGACY_SETTINGS_SECTION_MIGRATION: Record<string, string> = {
  // 2026-05 — claude-changelog moved under the generic registerChangelogSource
  'claude-changelog': 'changelog:claude',
};

/**
 * Resolve a settings section ID through {@link LEGACY_SETTINGS_SECTION_MIGRATION}.
 * Returns the input verbatim when no migration applies.
 */
export function migrateSettingsSectionId(id: SettingsSectionId): SettingsSectionId {
  return (LEGACY_SETTINGS_SECTION_MIGRATION[id as string] ?? id) as SettingsSectionId;
}

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
