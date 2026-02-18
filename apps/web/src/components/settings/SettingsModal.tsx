import type { ComponentType } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore, usePluginStore } from '@/stores';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
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

export function SettingsModal() {
  const isOpen = useSettingsStore(state => state.isOpen);
  const activeSection = useSettingsStore(state => state.activeSection);
  const closeSettings = useSettingsStore(state => state.closeSettings);
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
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) closeSettings();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-4xl max-h-[85vh] mx-4',
            'bg-background rounded-2xl shadow-2xl',
            'border border-border',
            'flex flex-col overflow-hidden',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <DialogTitle className="text-xl font-semibold text-foreground">Settings</DialogTitle>
            <DialogPrimitive.Close
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close settings"
            >
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Content Area with Sidebar */}
          <div className="flex-1 flex overflow-hidden">
            {/* Side Navigation */}
            <SettingsNavigation activeSection={activeSection} onNavigate={navigateToSection} />

            {/* Content Panel */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-2xl">{renderActiveSection()}</div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
