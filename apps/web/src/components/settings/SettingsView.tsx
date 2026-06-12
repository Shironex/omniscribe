import { useEffect, useMemo, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { transitions } from '@/lib/animations';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { PluginErrorBoundary } from '@/components/plugin/PluginErrorBoundary';
import { PluginMarketplace } from '@/components/plugin/PluginMarketplace';
import { SettingsNavigation } from './SettingsNavigation';
import { SettingsStatusBar } from './SettingsStatusBar';
import {
  AppearanceSection,
  GithubSection,
  McpSection,
  AiCapabilitiesSection,
  GeneralSection,
  WorktreesSection,
  SessionsSection,
  QuickActionsSection,
  TerminalSection,
  NotificationsSection,
} from './sections';

/**
 * Map of built-in section IDs to their components.
 */
const coreSections: Record<string, ComponentType> = {
  // ── Integrations ──────────────────────────────────────────────────
  github: GithubSection,
  mcp: McpSection,
  'ai-capabilities': AiCapabilitiesSection,
  marketplace: PluginMarketplace,
  // ── Workflow ──────────────────────────────────────────────────────
  sessions: SessionsSection,
  quickActions: QuickActionsSection,
  worktrees: WorktreesSection,
  notifications: NotificationsSection,
  // ── Interface ─────────────────────────────────────────────────────
  appearance: AppearanceSection,
  terminal: TerminalSection,
  general: GeneralSection,
};

/**
 * Full-pane Settings view. Replaces the old Radix dialog. Mounted by
 * `App.tsx` whenever `useSettingsStore.isOpen` is true; closing the view
 * (Esc or the close button) calls `closeSettings()` and the host returns
 * to the workspace tab grid.
 *
 * Composition is lifted from shiroani's `SettingsView` so the editorial
 * grid (mono group labels + active left bar + 220px rail + max-w-[760px]
 * content + bottom status bar) matches the redesign mock.
 */
export function SettingsView() {
  const activeSection = useSettingsStore(state => state.activeSection);
  const navigateToSection = useSettingsStore(state => state.navigateToSection);
  const closeSettings = useSettingsStore(state => state.closeSettings);
  const settingsSections = usePluginStore(state => state.settingsSections);

  // Esc closes the view. Implemented manually because Radix' focus trap
  // is no longer in play. The view stays mounted (but CSS-hidden) when the
  // user switches to the Terminal / editor tab, so gate the handler on the
  // active shellView — Esc pressed in another surface must NOT close the
  // hidden settings out from under it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (useAppUIStore.getState().shellView !== 'settings') return;
      e.stopPropagation();
      closeSettings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeSettings]);

  const ActiveComponent = useMemo<{ Component: ComponentType; pluginId?: string }>(() => {
    const Core = coreSections[activeSection];
    if (Core) return { Component: Core };

    for (const [, registration] of settingsSections) {
      if (registration.sectionId === activeSection) {
        return {
          Component: registration.component,
          pluginId: registration.pluginId,
        };
      }
    }

    // Final fallback so the pane is never empty
    return { Component: AppearanceSection };
  }, [activeSection, settingsSections]);

  const { Component, pluginId } = ActiveComponent;

  return (
    <section
      data-testid="settings-view"
      aria-label="Settings"
      className={cn(
        'absolute inset-0 z-30 flex flex-col bg-background',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0'
      )}
    >
      {/* In-pane header — no X close button on the right (handled by Esc /
          the dedicated control inside the rail header) since the view
          replaces the workspace pane rather than overlaying it. */}
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border-glass/60 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Settings</h1>
          <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground/70">
            Esc to close
          </span>
        </div>
        <button
          type="button"
          onClick={closeSettings}
          aria-label="Close settings"
          className="grid place-items-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        <SettingsNavigation activeSection={activeSection} onNavigate={navigateToSection} />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-7 pt-6 pb-24">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={transitions.fast}
              >
                {pluginId ? (
                  <PluginErrorBoundary pluginId={pluginId}>
                    <Component />
                  </PluginErrorBoundary>
                ) : (
                  <Component />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <SettingsStatusBar />
    </section>
  );
}
