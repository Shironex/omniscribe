import type { ComponentType } from 'react';
import {
  Server,
  GitBranch,
  GitPullRequest,
  Monitor,
  TerminalSquare,
  Zap,
  Puzzle,
  Bell,
  Sparkles,
  Palette,
} from 'lucide-react';
import type { SettingsSectionId } from '@omniscribe/shared';

export interface NavigationItem {
  id: SettingsSectionId;
  label: string;
  icon: ComponentType<{ className?: string; size?: string | number }>;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

/**
 * Core navigation groups for the settings sidebar.
 * Order and labels match the redesign screenshots (Agents / Integrations /
 * Workflow / Interface). Plugin-registered categories are merged dynamically
 * in `SettingsNavigation`.
 */
export const CORE_NAV_GROUPS: NavigationGroup[] = [
  {
    label: 'Integrations',
    items: [
      { id: 'github', label: 'GitHub CLI', icon: GitPullRequest },
      { id: 'mcp', label: 'MCP servers', icon: Server },
      { id: 'ai-capabilities', label: 'AI capabilities', icon: Sparkles },
      { id: 'marketplace', label: 'Extensions', icon: Puzzle },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { id: 'sessions', label: 'Sessions', icon: Monitor },
      { id: 'quickActions', label: 'Quick actions', icon: Zap },
      { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Interface',
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
    ],
  },
];

/** @deprecated Use CORE_NAV_GROUPS instead */
export const NAV_GROUPS = CORE_NAV_GROUPS;

/**
 * Flat list of all core nav items
 */
export const NAV_ITEMS: NavigationItem[] = CORE_NAV_GROUPS.flatMap(group => group.items);
