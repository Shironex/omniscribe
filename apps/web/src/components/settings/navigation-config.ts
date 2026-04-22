import type { ComponentType } from 'react';
import {
  Palette,
  Server,
  Info,
  GitBranch,
  GitPullRequest,
  Monitor,
  TerminalSquare,
  Zap,
  Puzzle,
  Bell,
  Sparkles,
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
 * Plugin-registered categories are merged dynamically in SettingsNavigation.
 */
export const CORE_NAV_GROUPS: NavigationGroup[] = [
  {
    label: 'Integrations',
    items: [
      { id: 'github', label: 'GitHub CLI', icon: GitPullRequest },
      { id: 'mcp', label: 'MCP Servers', icon: Server },
      { id: 'ai-capabilities', label: 'AI Capabilities', icon: Sparkles },
      { id: 'marketplace', label: 'Extensions', icon: Puzzle },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { id: 'sessions', label: 'Sessions', icon: Monitor },
      { id: 'quickActions', label: 'Quick Actions', icon: Zap },
      { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Interface',
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
      { id: 'general', label: 'About', icon: Info },
    ],
  },
];

/** @deprecated Use CORE_NAV_GROUPS instead */
export const NAV_GROUPS = CORE_NAV_GROUPS;

/**
 * Flat list of all core nav items
 */
export const NAV_ITEMS: NavigationItem[] = CORE_NAV_GROUPS.flatMap(group => group.items);
