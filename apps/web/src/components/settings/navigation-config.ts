import type { ComponentType } from 'react';
import { Palette, Server, Info, GitBranch, Github } from 'lucide-react';
import type { SettingsSectionId } from '@omniscribe/shared';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';

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
 * Navigation groups for the settings sidebar
 */
export const NAV_GROUPS: NavigationGroup[] = [
  {
    label: 'Integrations',
    items: [
      { id: 'integrations', label: 'Claude CLI', icon: ClaudeIcon },
      { id: 'github', label: 'GitHub CLI', icon: Github },
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
      { id: 'general', label: 'About', icon: Info },
    ],
  },
];

/**
 * Flat list of all nav items
 */
export const NAV_ITEMS: NavigationItem[] = NAV_GROUPS.flatMap((group) => group.items);
