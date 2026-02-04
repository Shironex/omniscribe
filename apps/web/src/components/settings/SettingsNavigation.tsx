import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { NavigationItem } from './navigation-config';
import { NAV_GROUPS } from './navigation-config';
import type { SettingsSectionId } from '@omniscribe/shared';

interface SettingsNavigationProps {
  activeSection: SettingsSectionId;
  onNavigate: (sectionId: SettingsSectionId) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

function NavButton({
  item,
  isActive,
  onNavigate,
}: {
  item: NavigationItem;
  isActive: boolean;
  onNavigate: (sectionId: SettingsSectionId) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      key={item.id}
      onClick={() => onNavigate(item.id)}
      className={clsx(
        'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out text-left relative overflow-hidden',
        isActive
          ? [
              'bg-gradient-to-r from-primary/15 via-primary/10 to-brand-600/5',
              'text-foreground',
              'border border-primary/25',
              'shadow-sm shadow-primary/5',
            ]
          : [
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/50',
              'border border-transparent hover:border-border/40',
            ],
        'hover:scale-[1.01] active:scale-[0.98]',
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-primary via-primary to-brand-600 rounded-r-full" />
      )}
      <Icon
        size={16}
        className={clsx(
          'w-4 h-4 shrink-0 transition-all duration-200',
          isActive
            ? 'text-primary'
            : 'group-hover:text-primary group-hover:scale-110',
        )}
      />
      <span className={clsx('truncate', isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
        {item.label}
      </span>
    </button>
  );
}

export function SettingsNavigation({
  activeSection,
  onNavigate,
  isOpen = true,
  onClose,
}: SettingsNavigationProps) {
  return (
    <>
      {/* Mobile backdrop overlay - only shown when isOpen is true on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          data-testid="settings-nav-backdrop"
        />
      )}

      {/* Navigation sidebar */}
      <nav
        className={clsx(
          // Mobile: fixed position overlay with slide transition from right
          'fixed inset-y-0 right-0 w-72 z-30',
          'transition-transform duration-200 ease-out',
          // Hide on mobile when closed, show when open
          isOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: relative position in layout, always visible
          'lg:relative lg:w-56 lg:z-auto lg:translate-x-0',
          'shrink-0 overflow-y-auto',
          'border-l border-border/50 lg:border-l-0 lg:border-r',
          'bg-muted/95 backdrop-blur-xl',
        )}
      >
        {/* Mobile close button */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">Navigation</span>
          <button
            onClick={onClose}
            className="h-8 w-8 p-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="sticky top-0 p-4 space-y-1">
          {/* Navigation Groups */}
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label}>
              {/* Group divider (except for first group) */}
              {groupIndex > 0 && <div className="my-3 border-t border-border/50" />}

              {/* Group Label */}
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground opacity-70">
                {group.label}
              </div>

              {/* Group Items */}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    isActive={activeSection === item.id}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
