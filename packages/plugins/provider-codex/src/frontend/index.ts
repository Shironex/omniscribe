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
  context.subscriptions.push(
    context.registerTheme({
      id: 'codex-dark',
      label: 'Codex Dark',
      isDark: true,
      color: '#10A37F',
      cssProperties: {
        '--background': '160 15% 5%',
        '--foreground': '160 5% 95%',
        '--primary': '160 56% 35%',
        '--primary-foreground': '160 5% 98%',
        '--accent': '160 20% 12%',
        '--accent-foreground': '160 5% 90%',
        '--muted': '160 10% 12%',
        '--muted-foreground': '160 5% 55%',
        '--card': '160 12% 7%',
        '--card-foreground': '160 5% 95%',
        '--border': '160 10% 15%',
        '--ring': '160 56% 35%',
        '--secondary': '160 10% 10%',
        '--secondary-foreground': '160 5% 90%',
        '--destructive': '0 72% 51%',
        '--destructive-foreground': '0 0% 98%',
        '--popover': '160 12% 7%',
        '--popover-foreground': '160 5% 95%',
        '--input': '160 10% 15%',
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
