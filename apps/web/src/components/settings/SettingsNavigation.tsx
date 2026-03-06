import { useMemo } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/animations';
import type { NavigationItem, NavigationGroup } from './navigation-config';
import { CORE_NAV_GROUPS } from './navigation-config';
import { usePluginStore } from '@/stores/usePluginStore';
import { PluginErrorBoundary } from '@/components/plugin/PluginErrorBoundary';
import type { SettingsSectionId } from '@omniscribe/shared';

interface SettingsNavigationProps {
  activeSection: SettingsSectionId;
  onNavigate: (sectionId: SettingsSectionId) => void;
}

function NavButton({
  item,
  isActive,
  onNavigate,
  pluginId,
}: {
  item: NavigationItem;
  isActive: boolean;
  onNavigate: (sectionId: SettingsSectionId) => void;
  pluginId?: string;
}) {
  const Icon = item.icon;
  const iconElement = (
    <Icon
      size={16}
      className={cn(
        'w-4 h-4 shrink-0 transition-all duration-200',
        isActive ? 'text-primary' : 'group-hover:text-primary group-hover:scale-110'
      )}
    />
  );

  return (
    <button
      key={item.id}
      onClick={() => onNavigate(item.id)}
      className={cn(
        'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out text-left relative overflow-hidden',
        isActive
          ? ['text-foreground']
          : [
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/50',
              'border border-transparent hover:border-border/40',
            ],
        'hover:scale-[1.01] active:scale-[0.98]'
      )}
    >
      {/* Animated active indicator background */}
      {isActive && (
        <motion.div
          layoutId="settings-active-indicator"
          className="absolute inset-0 rounded-xl bg-linear-to-r from-primary/15 via-primary/10 to-brand-600/5 border border-primary/25 shadow-xs shadow-primary/5"
          transition={transitions.springSmooth}
        />
      )}
      {/* Active indicator bar */}
      {isActive && (
        <motion.div
          layoutId="settings-active-bar"
          className="absolute inset-y-0 left-0 w-0.5 bg-linear-to-b from-primary via-primary to-brand-600 rounded-r-full"
          transition={transitions.springSmooth}
        />
      )}
      <span className="relative z-10 flex items-center gap-2.5">
        {pluginId ? (
          <PluginErrorBoundary pluginId={pluginId}>{iconElement}</PluginErrorBoundary>
        ) : (
          iconElement
        )}
        <span
          className={cn(
            'truncate',
            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {item.label}
        </span>
      </span>
    </button>
  );
}

export function SettingsNavigation({ activeSection, onNavigate }: SettingsNavigationProps) {
  const settingsCategories = usePluginStore(s => s.settingsCategories);
  const settingsSections = usePluginStore(s => s.settingsSections);

  const mergedGroups = useMemo(() => {
    // Build plugin category groups
    const pluginGroups: Array<NavigationGroup & { order: number; pluginId: string }> = [];

    for (const [, cat] of settingsCategories) {
      // Find all sections for this category
      const catSections: Array<{
        sectionId: string;
        label: string;
        icon: NavigationItem['icon'];
        order?: number;
        pluginId: string;
      }> = [];
      for (const [, section] of settingsSections) {
        if (section.categoryId === cat.categoryId) {
          catSections.push({
            sectionId: section.sectionId,
            label: section.label,
            icon: section.icon as NavigationItem['icon'],
            order: section.order,
            pluginId: section.pluginId,
          });
        }
      }

      // Sort sections by order
      catSections.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

      const items: NavigationItem[] = catSections.map(s => ({
        id: s.sectionId,
        label: s.label,
        icon: s.icon,
      }));

      if (items.length > 0) {
        pluginGroups.push({
          label: cat.label,
          items,
          order: cat.order ?? 100,
          pluginId: cat.pluginId,
        });
      }
    }

    // Sort plugin groups by order
    pluginGroups.sort((a, b) => a.order - b.order);

    // Plugin categories appear above core groups
    return [...pluginGroups, ...CORE_NAV_GROUPS];
  }, [settingsCategories, settingsSections]);

  // Build a set of plugin-contributed section IDs for error boundary wrapping
  const pluginSectionIds = useMemo(() => {
    const ids = new Map<string, string>();
    for (const [, section] of settingsSections) {
      ids.set(section.sectionId, section.pluginId);
    }
    return ids;
  }, [settingsSections]);

  return (
    <nav
      className={cn(
        'w-56 shrink-0 overflow-y-auto',
        'border-r border-border/50',
        'bg-muted/95 backdrop-blur-xl'
      )}
    >
      <div className="sticky top-0 p-4 space-y-1">
        {/* Navigation Groups */}
        {mergedGroups.map(group => (
          <div key={group.label}>
            {/* Group Label */}
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground opacity-70">
              {group.label}
            </div>

            {/* Group Items */}
            <div className="space-y-1">
              {group.items.map(item => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeSection === item.id}
                  onNavigate={onNavigate}
                  pluginId={pluginSectionIds.get(item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
