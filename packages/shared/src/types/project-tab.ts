/**
 * Project Tab Types - Shared types for project tabs in workspace
 */

import type { Theme, WorktreeSettings } from './settings';
import { DEFAULT_WORKTREE_SETTINGS } from './settings';

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
}

/**
 * Project tab for frontend (uses Date for timestamps and Theme type)
 */
export interface ProjectTab extends ProjectTabBase {
  /** Last accessed timestamp */
  lastAccessedAt: Date;
  /** Per-project theme */
  theme?: Theme;
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
 * User preferences for workspace
 */
export interface UserPreferences {
  /** Theme preference - supports all 40 themes */
  theme: Theme;
  /** Worktree settings */
  worktree?: WorktreeSettings;
  /** Other preferences */
  [key: string]: unknown;
}

// Re-export for convenience
export { DEFAULT_WORKTREE_SETTINGS };

/**
 * Convert a backend ProjectTabDTO to frontend ProjectTab
 */
export function convertDTOToProjectTab(dto: ProjectTabDTO): ProjectTab {
  return {
    ...dto,
    lastAccessedAt: new Date(dto.lastAccessedAt),
    theme: dto.theme as Theme | undefined,
  };
}

/**
 * Convert a frontend ProjectTab to backend ProjectTabDTO
 */
export function convertProjectTabToDTO(tab: ProjectTab): ProjectTabDTO {
  return {
    ...tab,
    lastAccessedAt: tab.lastAccessedAt.toISOString(),
    theme: tab.theme,
  };
}
