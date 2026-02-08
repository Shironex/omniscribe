/**
 * Settings Types - Shared types for settings storage
 */

import type { AiMode } from './session';

/**
 * Theme - All available color themes
 * 21 dark themes + 20 light themes = 41 total
 */
export type Theme =
  // Dark themes (21)
  | 'dark'
  | 'ayu-dark'
  | 'ayu-mirage'
  | 'catppuccin'
  | 'dracula'
  | 'ember'
  | 'forest'
  | 'gray'
  | 'gruvbox'
  | 'matcha'
  | 'midnight'
  | 'monokai'
  | 'nord'
  | 'ocean'
  | 'onedark'
  | 'red'
  | 'retro'
  | 'solarized'
  | 'sunset'
  | 'synthwave'
  | 'tokyonight'
  // Light themes (20)
  | 'light'
  | 'ayu-light'
  | 'blossom'
  | 'bluloco'
  | 'cream'
  | 'feather'
  | 'github'
  | 'gruvboxlight'
  | 'lavender'
  | 'mint'
  | 'nordlight'
  | 'onelight'
  | 'paper'
  | 'peach'
  | 'rose'
  | 'sand'
  | 'sepia'
  | 'sky'
  | 'snow'
  | 'solarizedlight';

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  description?: string;
  type?: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

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
 * Global Settings - User preferences stored globally
 */
export interface GlobalSettings {
  /** Settings schema version */
  version: number;
  /** Selected theme */
  theme: Theme;
  /** Sans-serif font family */
  fontFamilySans?: string;
  /** Monospace font family */
  fontFamilyMono?: string;
  /** Terminal font family */
  terminalFontFamily?: string;
  /** MCP server configurations */
  mcpServers: MCPServerConfig[];
  /** Custom Claude CLI spawn command */
  claudeSpawnCommand?: string;
  /** Custom Claude CLI path */
  claudeCliPath?: string;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: GlobalSettings = {
  version: 1,
  theme: 'dark',
  mcpServers: [],
};

/**
 * Settings section IDs for navigation
 */
export type SettingsSectionId =
  | 'appearance'
  | 'integrations'
  | 'github'
  | 'mcp'
  | 'general'
  | 'worktrees'
  | 'sessions'
  | 'terminal'
  | 'quickActions';

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
  /** Whether to auto-resume active sessions when Omniscribe restarts */
  autoResumeOnRestart?: boolean;
}

/**
 * Default session settings
 */
export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  defaultMode: 'claude',
  skipPermissions: false,
  quickActionMode: 'paste-only',
  autoResumeOnRestart: false,
};

/**
 * Dark themes list
 */
export const DARK_THEMES: Theme[] = [
  'dark',
  'ayu-dark',
  'ayu-mirage',
  'catppuccin',
  'dracula',
  'ember',
  'forest',
  'gray',
  'gruvbox',
  'matcha',
  'midnight',
  'monokai',
  'nord',
  'ocean',
  'onedark',
  'red',
  'retro',
  'solarized',
  'sunset',
  'synthwave',
  'tokyonight',
];

/**
 * Light themes list
 */
export const LIGHT_THEMES: Theme[] = [
  'light',
  'ayu-light',
  'blossom',
  'bluloco',
  'cream',
  'feather',
  'github',
  'gruvboxlight',
  'lavender',
  'mint',
  'nordlight',
  'onelight',
  'paper',
  'peach',
  'rose',
  'sand',
  'sepia',
  'sky',
  'snow',
  'solarizedlight',
];

/**
 * All themes list
 */
export const ALL_THEMES: Theme[] = [...DARK_THEMES, ...LIGHT_THEMES];

/**
 * Check if a theme is dark
 */
export function isDarkTheme(theme: Theme): boolean {
  return DARK_THEMES.includes(theme);
}
