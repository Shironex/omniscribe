import { useEffect, useCallback, useState } from 'react';
import { X, Menu } from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '@/stores';
import { SettingsNavigation } from './SettingsNavigation';
import {
  AppearanceSection,
  IntegrationsSection,
  GithubSection,
  McpSection,
  GeneralSection,
  WorktreesSection,
} from './sections';
import type { SettingsSectionId } from '@omniscribe/shared';

// Breakpoint constant for mobile (matches Tailwind lg breakpoint)
const LG_BREAKPOINT = 1024;

export function SettingsModal() {
  const isOpen = useSettingsStore((state) => state.isOpen);
  const activeSection = useSettingsStore((state) => state.activeSection);
  const closeSettings = useSettingsStore((state) => state.closeSettings);
  const navigateToSection = useSettingsStore((state) => state.navigateToSection);

  // Mobile navigation state - default to showing on desktop, hidden on mobile
  const [showNavigation, setShowNavigation] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= LG_BREAKPOINT;
    }
    return true;
  });

  // Handle navigation
  const handleNavigate = useCallback(
    (sectionId: SettingsSectionId) => {
      navigateToSection(sectionId);
      // Auto-close navigation on mobile when a section is selected
      if (typeof window !== 'undefined' && window.innerWidth < LG_BREAKPOINT) {
        setShowNavigation(false);
      }
    },
    [navigateToSection]
  );

  // Handle window resize to show/hide navigation appropriately
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        setShowNavigation(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeSettings();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent scrolling of background content
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeSettings]);

  // Render the active section based on current view
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'appearance':
        return <AppearanceSection />;
      case 'integrations':
        return <IntegrationsSection />;
      case 'github':
        return <GithubSection />;
      case 'mcp':
        return <McpSection />;
      case 'general':
        return <GeneralSection />;
      case 'worktrees':
        return <WorktreesSection />;
      default:
        return <AppearanceSection />;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
        data-testid="settings-modal-backdrop"
      />

      {/* Modal */}
      <div
        className={clsx(
          'relative w-full max-w-4xl max-h-[85vh] mx-4',
          'bg-background rounded-2xl shadow-2xl',
          'border border-border',
          'flex flex-col overflow-hidden',
          'animate-in',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setShowNavigation(!showNavigation)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1
              id="settings-modal-title"
              className="text-xl font-semibold text-foreground"
            >
              Settings
            </h1>
          </div>
          <button
            onClick={closeSettings}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area with Sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Side Navigation */}
          <SettingsNavigation
            activeSection={activeSection}
            onNavigate={handleNavigate}
            isOpen={showNavigation}
            onClose={() => setShowNavigation(false)}
          />

          {/* Content Panel */}
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="max-w-2xl">{renderActiveSection()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
