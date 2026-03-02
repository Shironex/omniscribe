import type { StatusCounts } from './StatusLegend';
import { ProjectTabs } from './ProjectTabs';
import type { Tab } from './ProjectTabs';
import { StatusBar } from './StatusBar';
import { ActionBar } from './ActionBar';
import { WindowControls } from './WindowControls';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

export type { Tab };

const CLOSE_TAB_SHORTCUT = IS_MAC ? '⌘ W' : 'Ctrl+W';

interface TopBarProps {
  // Tab props
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onReorderTabs?: (activeId: string, overId: string) => void;
  // Status props
  currentBranch: string;
  statusCounts?: Partial<StatusCounts>;
  // Session setup actions
  onAddSlot?: () => void;
  hasActiveProject?: boolean;
  sessionCount?: number;
  preLaunchSlotCount?: number;
  // Action props
  onStopAll: () => void;
  onLaunch: () => void;
  canLaunch: boolean;
  isLaunching?: boolean;
  hasActiveSessions: boolean;
  className?: string;
}

export function TopBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTabs,
  currentBranch,
  statusCounts,
  onAddSlot,
  hasActiveProject = false,
  sessionCount = 0,
  preLaunchSlotCount = 0,
  onStopAll,
  onLaunch,
  canLaunch,
  isLaunching = false,
  hasActiveSessions,
  className,
}: TopBarProps) {
  return (
    <div
      data-testid="project-tabs"
      className={cn(
        'h-11 bg-muted border-b border-border',
        'flex items-center select-none drag',
        IS_ELECTRON && IS_MAC && 'pl-[78px]',
        className
      )}
    >
      {/* Left: Project tabs */}
      <ProjectTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        onReorderTabs={onReorderTabs}
        closeTabShortcut={CLOSE_TAB_SHORTCUT}
      />

      {/* Center spacer */}
      <div className="flex-1 min-w-2" />

      {/* Right: Status info + Actions + Window controls */}
      <div className="no-drag flex items-center gap-1.5 px-2 shrink-0">
        <StatusBar currentBranch={currentBranch} statusCounts={statusCounts} />

        {/* Divider */}
        <div className="w-px h-5 bg-border mx-1" />

        <ActionBar
          hasActiveProject={hasActiveProject}
          sessionCount={sessionCount}
          preLaunchSlotCount={preLaunchSlotCount}
          onAddSlot={onAddSlot}
          onStopAll={onStopAll}
          onLaunch={onLaunch}
          canLaunch={canLaunch}
          isLaunching={isLaunching}
          hasActiveSessions={hasActiveSessions}
        />

        <WindowControls />
      </div>
    </div>
  );
}
