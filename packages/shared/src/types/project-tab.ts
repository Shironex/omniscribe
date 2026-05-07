/**
 * Project Tab Types - Shared types for project tabs in workspace
 */

import type { Theme, WorktreeSettings, SessionSettings, NotificationSettings } from './settings';
import {
  DEFAULT_WORKTREE_SETTINGS,
  DEFAULT_SESSION_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
} from './settings';

/**
 * Base project tab fields shared between frontend and backend
 */
interface ProjectTabBase {
  /** Unique tab identifier */
  id: string;
  /** Project path */
  projectPath: string;
  /** Project name (directory name) */
  name: string;
  /** Session IDs associated with this project */
  sessionIds: string[];
  /** Whether this tab is selected */
  isActive: boolean;
  /** Thumbnail file name stored in {userData}/thumbnails/ */
  thumbnailFileName?: string;
}

/**
 * Project tab for frontend (uses Date for timestamps and Theme type).
 *
 * `theme` is typed as `Theme | string` rather than just `Theme` because
 * plugins can register their own theme IDs at runtime (the renderer
 * applies them as `<themeId>` classes on `:root`), and also to keep
 * legacy persisted IDs from breaking typecheck while they migrate.
 */
export interface ProjectTab extends ProjectTabBase {
  /** Last accessed timestamp */
  lastAccessedAt: Date;
  /** Per-project theme */
  theme?: Theme | string;
}

/**
 * Project tab for backend/serialization (uses string for timestamps)
 */
export interface ProjectTabDTO extends ProjectTabBase {
  /** Last accessed timestamp (ISO string) */
  lastAccessedAt: string;
  /** Per-project theme (string for storage) */
  theme?: string;
}

/**
 * User preferences for workspace.
 *
 * `theme` accepts the curated built-in `Theme` IDs as well as plugin-contributed
 * theme IDs (arbitrary strings registered at runtime) and legacy IDs that the
 * persistence layer migrates lazily on read.
 */
export interface UserPreferences {
  /** Theme preference (built-in or plugin-contributed). */
  theme: Theme | string;
  /** Worktree settings */
  worktree?: WorktreeSettings;
  /** Session settings */
  session?: SessionSettings;
  /** Notification settings */
  notifications?: NotificationSettings;
  /** Other preferences */
  [key: string]: unknown;
}

// Re-export for convenience
export { DEFAULT_WORKTREE_SETTINGS, DEFAULT_SESSION_SETTINGS, DEFAULT_NOTIFICATION_SETTINGS };
