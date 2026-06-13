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
      size={14}
      className={cn(
        'w-3.5 h-3.5 shrink-0 transition-colors duration-200',
        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
      )}
    />
  );

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={cn(
        'group relative w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isActive
          ? 'text-foreground bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
      )}
    >
      {/* Active left bar (3px wide rounded indicator) */}
      {isActive && (
        <motion.span
          layoutId="settings-active-bar"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary"
          transition={transitions.springSmooth}
        />
      )}
      <span className="flex items-center gap-2.5 relative z-10">
        {pluginId ? (
          <PluginErrorBoundary pluginId={pluginId}>{iconElement}</PluginErrorBoundary>
        ) : (
          iconElement
        )}
        <span className={cn('truncate', isActive ? 'font-medium' : '')}>{item.label}</span>
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
            icon: section.icon,
            order: section.order,
            pluginId: section.pluginId,
          });
        }
      }

      const sortedSections = catSections.toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100));

      const items: NavigationItem[] = sortedSections.map(s => ({
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

    const sortedGroups = pluginGroups.toSorted((a, b) => a.order - b.order);

    // Plugin categories appear above core groups
    return [...sortedGroups, ...CORE_NAV_GROUPS];
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
      aria-label="Settings navigation"
      className="w-[220px] shrink-0 overflow-y-auto border-r border-border-glass/60 bg-background/40 backdrop-blur-sm"
    >
      <div className="px-3 pt-5 pb-8 space-y-5">
        {mergedGroups.map(group => (
          <div key={group.label} className="space-y-1">
            {/* Mono uppercase group label with thin rule */}
            <div className="flex items-center gap-2 px-3 pb-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/80">
                {group.label}
              </span>
              <span className="flex-1 h-px bg-border-glass/60" />
            </div>

            <div className="space-y-0.5">
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
