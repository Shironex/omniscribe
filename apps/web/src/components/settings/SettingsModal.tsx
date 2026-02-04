import { useEffect } from 'react';
import { X } from 'lucide-react';
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
  SessionsSection,
} from './sections';

export function SettingsModal() {
  const isOpen = useSettingsStore((state) => state.isOpen);
  const activeSection = useSettingsStore((state) => state.activeSection);
  const closeSettings = useSettingsStore((state) => state.closeSettings);
  const navigateToSection = useSettingsStore((state) => state.navigateToSection);

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
      case 'sessions':
        return <SessionsSection />;
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
          <h1
            id="settings-modal-title"
            className="text-xl font-semibold text-foreground"
          >
            Settings
          </h1>
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
            onNavigate={navigateToSection}
          />

          {/* Content Panel */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl">{renderActiveSection()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
