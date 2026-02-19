/**
 * Claude Provider Plugin - Frontend Barrel
 *
 * Exports the frontendActivate function that registers all Claude UI
 * contributions (settings category, usage panel, status renderer) with
 * the Omniscribe plugin system via FrontendPluginContext.
 *
 * This barrel is imported by the web app's plugin initialization code,
 * NOT by the plugin's backend index.ts.
 */

import type { FrontendPluginContext } from '@omniscribe/plugin-api';
import { ClaudeIcon } from './ClaudeIcon';
import { ClaudeSettingsSection } from './ClaudeSettingsSection';
import { ClaudeUsagePanel } from './ClaudeUsagePanel';
import { ClaudeStatusRenderer } from './ClaudeStatusRenderer';

/**
 * Activate the Claude provider plugin's frontend contributions.
 *
 * Registers:
 * 1. Settings category - "Claude Code" top-level nav entry with settings section
 * 2. Usage panel - Full usage popover with rate limit windows
 * 3. Status renderer - ClaudeIcon for session status display
 *
 * @param context - FrontendPluginContext providing registration methods
 */
export function frontendActivate(context: FrontendPluginContext): void {
  // Register settings category (top-level "Claude Code" nav entry)
  context.subscriptions.push(
    context.registerSettingsCategory({
      categoryId: 'claude',
      label: 'Claude Code',
      sections: [
        {
          categoryId: 'claude',
          sectionId: 'claude-settings',
          label: 'Claude Code',
          icon: ClaudeIcon as any,
          component: ClaudeSettingsSection as any,
          order: 10,
        },
      ],
      order: 5, // Before core groups
    })
  );

  // Register usage panel for Claude sessions
  context.subscriptions.push(
    context.registerUsagePanel({
      id: 'claude-usage',
      aiMode: 'claude',
      component: ClaudeUsagePanel as any,
      label: 'Claude',
      icon: ClaudeIcon as any,
    })
  );

  // Register status renderer (provides icon for session status display)
  context.subscriptions.push(
    context.registerSessionStatusRenderer({
      id: 'claude-status',
      aiMode: 'claude',
      component: ClaudeStatusRenderer as any,
    })
  );
}

// Re-export components for direct use if needed
export { ClaudeIcon } from './ClaudeIcon';
export { ClaudeSettingsSection } from './ClaudeSettingsSection';
export { ClaudeUsagePanel } from './ClaudeUsagePanel';
export { ClaudeStatusRenderer } from './ClaudeStatusRenderer';
