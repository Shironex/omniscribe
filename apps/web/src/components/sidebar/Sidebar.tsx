import { useCallback } from 'react';
import { SidebarHeader } from './SidebarHeader';
import { SidebarProjectList } from './SidebarProjectList';
import { SidebarFooter } from './SidebarFooter';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import type { Tab } from '@/hooks/useWorkspaceTabs';

const SIDEBAR_WIDTH_EXPANDED = 260;
// macOS traffic lights need ~72px; other platforms can go narrower
const SIDEBAR_WIDTH_COLLAPSED = IS_ELECTRON && IS_MAC ? 72 : 48;

interface SidebarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onReorderTabs?: (activeId: string, overId: string) => void;
  currentBranch: string;
  onTransitionEnd?: () => void;
}

export function Sidebar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTabs,
  currentBranch,
  onTransitionEnd,
}: SidebarProps) {
  const collapsed = useAppUIStore(state => state.isSidebarCollapsed);
  const toggleSidebar = useAppUIStore(state => state.toggleSidebar);

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName === 'width') {
        onTransitionEnd?.();
      }
    },
    [onTransitionEnd]
  );

  return (
    <div
      className={cn(
        'flex flex-col h-full shrink-0 bg-muted/50 border-r border-border/80',
        'transition-[width] duration-200 overflow-hidden'
      )}
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <SidebarHeader collapsed={collapsed} onToggle={toggleSidebar} onNewProject={onNewTab} />

      {/* Separator */}
      <div className="mx-2 border-b border-border/30" />

      <SidebarProjectList
        tabs={tabs}
        activeTabId={activeTabId}
        collapsed={collapsed}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onReorderTabs={onReorderTabs}
      />

      <SidebarFooter currentBranch={currentBranch} collapsed={collapsed} />
    </div>
  );
}
