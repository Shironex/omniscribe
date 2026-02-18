/**
 * Codex Provider Plugin - Frontend Barrel
 *
 * Exports the frontendActivate function that registers all Codex UI
 * contributions (settings category, usage panel, status renderer, theme)
 * with the Omniscribe plugin system via FrontendPluginContext.
 *
 * This barrel is imported by the web app's plugin initialization code,
 * NOT by the plugin's backend index.ts.
 */

import type { FrontendPluginContext } from '@omniscribe/plugin-api';
import { CodexIcon } from './CodexIcon';
import { CodexSettingsSection } from './CodexSettingsSection';
import { CodexUsagePanel } from './CodexUsagePanel';
import { CodexStatusRenderer } from './CodexStatusRenderer';

/**
 * Activate the Codex provider plugin's frontend contributions.
 *
 * Registers:
 * 1. Settings category - "Codex" top-level nav entry with settings section
 * 2. Usage panel - Rate limit metrics popover for Codex sessions
 * 3. Status renderer - OpenAI icon for session status display
 * 4. Theme - Codex Dark with OpenAI green accents
 *
 * @param context - FrontendPluginContext providing registration methods
 */
export function frontendActivate(context: FrontendPluginContext): void {
  // 1. Register settings category (top-level "Codex" nav entry)
  context.subscriptions.push(
    context.registerSettingsCategory({
      categoryId: 'codex',
      label: 'Codex',
      sections: [
        {
          categoryId: 'codex',
          sectionId: 'codex-settings',
          label: 'Codex',
          icon: CodexIcon as any,
          component: CodexSettingsSection as any,
          order: 10,
        },
      ],
      order: 6, // After Claude's 5
    })
  );

  // 2. Register usage panel for Codex sessions
  context.subscriptions.push(
    context.registerUsagePanel({
      id: 'codex-usage',
      aiMode: 'codex',
      component: CodexUsagePanel as any,
    })
  );

  // 3. Register status renderer (provides icon for session status display)
  context.subscriptions.push(
    context.registerSessionStatusRenderer({
      id: 'codex-status',
      aiMode: 'codex',
      component: CodexStatusRenderer as any,
    })
  );

  // 4. Register Codex Dark theme (OpenAI green accents on dark background)
  // Plugin themes cascade on top of the base 'dark' theme, so we only
  // need to override brand-specific variables. Values use oklch to match
  // the built-in theme convention.
  context.subscriptions.push(
    context.registerTheme({
      id: 'codex-dark',
      label: 'Codex Dark',
      isDark: true,
      color: '#10A37F',
      cssProperties: {
        // Brand colors — OpenAI green (#10A37F ≈ oklch 0.63 0.15 165)
        '--primary': 'oklch(0.63 0.15 165)',
        '--primary-foreground': 'oklch(0.98 0 0)',
        '--brand-400': 'oklch(0.68 0.13 165)',
        '--brand-500': 'oklch(0.63 0.15 165)',
        '--brand-600': 'oklch(0.58 0.17 165)',
        '--ring': 'oklch(0.63 0.15 165)',
        // Sidebar accent inherits primary
        '--sidebar-primary': 'oklch(0.63 0.15 165)',
        '--sidebar-primary-foreground': 'oklch(0.98 0 0)',
        '--sidebar-ring': 'oklch(0.63 0.15 165)',
        // Action buttons — green accent
        '--action-view': 'oklch(0.63 0.15 165)',
        '--action-view-hover': 'oklch(0.58 0.17 165)',
        '--action-commit': 'oklch(0.63 0.15 165)',
        '--action-commit-hover': 'oklch(0.58 0.17 165)',
        '--action-verify': 'oklch(0.63 0.15 165)',
        '--action-verify-hover': 'oklch(0.58 0.17 165)',
        // Running indicator
        '--running-indicator': 'oklch(0.63 0.15 165)',
        '--running-indicator-text': 'oklch(0.68 0.13 165)',
      },
    })
  );
}

// Re-export components for direct use if needed
export { CodexIcon } from './CodexIcon';
export { CodexAuthCard } from './CodexAuthCard';
export { CodexSettingsSection } from './CodexSettingsSection';
export { CodexUsagePanel } from './CodexUsagePanel';
export { CodexStatusRenderer } from './CodexStatusRenderer';
