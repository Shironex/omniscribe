import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { StatusCounts } from './StatusLegend';
import type { SessionStatus } from './StatusLegend';
import { ProjectTabs } from './ProjectTabs';
import { StatusBar } from './StatusBar';
import { ActionBar } from './ActionBar';
import { WindowControls } from './WindowControls';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

export interface Tab {
  id: string;
  label: string;
  status?: SessionStatus;
}

interface TopBarProps {
  // Tab props
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  // Status props
  currentBranch: string;
  statusCounts?: Partial<StatusCounts>;
  // Session setup actions
  onAddSlot?: () => void;
  onOpenLaunchModal?: () => void;
  hasActiveProject?: boolean;
  sessionCount?: number;
  preLaunchSlotCount?: number;
  // Action props
  onStopAll: () => void;
  onLaunch: () => void;
  canLaunch: boolean;
  isLaunching?: boolean;
  hasActiveSessions: boolean;
  onToggleHistory?: () => void;
  isHistoryOpen?: boolean;
  className?: string;
}

export function TopBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  currentBranch,
  statusCounts,
  onAddSlot,
  onOpenLaunchModal,
  hasActiveProject = false,
  sessionCount = 0,
  preLaunchSlotCount = 0,
  onStopAll,
  onLaunch,
  canLaunch,
  isLaunching = false,
  hasActiveSessions,
  onToggleHistory,
  isHistoryOpen,
  className,
}: TopBarProps) {
  const closeTabShortcut = IS_MAC ? '⌘ W' : 'Ctrl+W';

  return (
    <div
      data-testid="project-tabs"
      className={twMerge(
        clsx(
          'h-11 bg-muted border-b border-border',
          'flex items-center select-none drag',
          IS_ELECTRON && IS_MAC && 'pl-[78px]',
          className
        )
      )}
    >
      {/* Left: Project tabs */}
      <ProjectTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        closeTabShortcut={closeTabShortcut}
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
          onToggleHistory={onToggleHistory}
          isHistoryOpen={isHistoryOpen}
          onOpenLaunchModal={onOpenLaunchModal}
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
