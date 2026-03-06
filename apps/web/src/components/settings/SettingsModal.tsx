import type { ComponentType } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { transitions } from '@/lib/animations';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { PluginErrorBoundary } from '@/components/plugin/PluginErrorBoundary';
import { SettingsNavigation } from './SettingsNavigation';
import {
  AppearanceSection,
  GithubSection,
  McpSection,
  GeneralSection,
  WorktreesSection,
  SessionsSection,
  QuickActionsSection,
  TerminalSection,
} from './sections';
import { PluginMarketplace } from '@/components/plugin/PluginMarketplace';

/**
 * Core section map: maps built-in section IDs to their components.
 * Replaces the previous switch statement for extensibility.
 */
const coreSections: Record<string, ComponentType> = {
  appearance: AppearanceSection,
  github: GithubSection,
  mcp: McpSection,
  general: GeneralSection,
  worktrees: WorktreesSection,
  sessions: SessionsSection,
  quickActions: QuickActionsSection,
  terminal: TerminalSection,
  marketplace: PluginMarketplace,
};

/**
 * Inner content of the settings modal (nav + section panels).
 * Lazy-loaded inside SettingsModalShell via Suspense.
 * The Dialog shell, overlay, and header are rendered eagerly by the shell.
 */
export function SettingsModal() {
  const activeSection = useSettingsStore(state => state.activeSection);
  const navigateToSection = useSettingsStore(state => state.navigateToSection);
  const settingsSections = usePluginStore(state => state.settingsSections);

  // Render the active section based on current view
  const renderActiveSection = () => {
    // 1. Check core sections map
    const CoreComponent = coreSections[activeSection];
    if (CoreComponent) {
      return <CoreComponent />;
    }

    // 2. Check plugin-registered sections (key is `${pluginId}:${sectionId}`)
    // Find a section where sectionId matches the activeSection
    for (const [, registration] of settingsSections) {
      if (registration.sectionId === activeSection) {
        const PluginComponent = registration.component as ComponentType;
        return (
          <PluginErrorBoundary pluginId={registration.pluginId}>
            <PluginComponent />
          </PluginErrorBoundary>
        );
      }
    }

    // 3. Fallback to appearance
    return <AppearanceSection />;
  };

  return (
    <>
      {/* Side Navigation */}
      <SettingsNavigation activeSection={activeSection} onNavigate={navigateToSection} />

      {/* Content Panel */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={transitions.fast}
            >
              {renderActiveSection()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
