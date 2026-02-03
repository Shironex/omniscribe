import type { LucideIcon } from 'lucide-react';
import { Palette, Bot, Server, Settings, GitBranch } from 'lucide-react';
import type { SettingsSectionId } from '@omniscribe/shared';

export interface NavigationItem {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

/**
 * Navigation groups for the settings sidebar
 */
export const NAV_GROUPS: NavigationGroup[] = [
  {
    label: 'Integrations',
    items: [
      { id: 'integrations', label: 'Claude CLI', icon: Bot },
      { id: 'mcp', label: 'MCP Servers', icon: Server },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
    ],
  },
  {
    label: 'Interface',
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'general', label: 'General', icon: Settings },
    ],
  },
];

/**
 * Flat list of all nav items
 */
export const NAV_ITEMS: NavigationItem[] = NAV_GROUPS.flatMap((group) => group.items);
