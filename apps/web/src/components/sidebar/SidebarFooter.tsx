import { GitBranch, Settings, PanelLeft } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { UsagePopover } from '@/components/shared/UsagePopover';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';

const SETTINGS_SHORTCUT = IS_MAC ? '⌘ ,' : 'Ctrl+,';

interface SidebarFooterProps {
  currentBranch: string;
  collapsed: boolean;
  /** Whether the attached side panel is open (drives the toggle icon state). */
  sidePanelOpen?: boolean;
  /** Toggle the attached side panel (Files / Source Control). */
  onToggleSidePanel?: () => void;
  /** Whether a project is active (the side-panel toggle is hidden otherwise). */
  hasProject?: boolean;
}

export function SidebarFooter({
  currentBranch,
  collapsed,
  sidePanelOpen,
  onToggleSidePanel,
  hasProject,
}: SidebarFooterProps) {
  const openSettings = useSettingsStore(state => state.openSettings);

  return (
    <div
      className={cn(
        'shrink-0 border-t border-border/50',
        collapsed ? 'px-1 py-2 flex flex-col items-center gap-1' : 'px-3 py-2 space-y-1'
      )}
    >
      {/* Git branch */}
      {currentBranch && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1.5 rounded text-foreground-secondary',
                collapsed ? 'justify-center px-1 py-1' : 'px-2 py-1'
              )}
            >
              <GitBranch size={13} className="text-muted-foreground shrink-0" />
              {!collapsed && (
                <span className="font-mono text-xs truncate max-w-[180px]">{currentBranch}</span>
              )}
            </div>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">{currentBranch}</TooltipContent>}
        </Tooltip>
      )}

      {/* Usage + panel toggle + Settings row */}
      <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'justify-between')}>
        <UsagePopover
          anchoring={{
            tooltipSide: collapsed ? 'right' : 'top',
            popoverSide: 'right',
            popoverAlign: 'end',
          }}
        />

        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0.5')}>
          {hasProject && onToggleSidePanel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleSidePanel}
                  className={cn(
                    'w-7 h-7 text-muted-foreground hover:text-foreground',
                    sidePanelOpen && 'text-foreground'
                  )}
                  aria-label={sidePanelOpen ? 'Hide side panel' : 'Show side panel'}
                  aria-pressed={sidePanelOpen}
                >
                  <PanelLeft size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={collapsed ? 'right' : 'top'}>
                {sidePanelOpen ? 'Hide side panel' : 'Show side panel'}
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openSettings()}
                className="w-7 h-7 text-muted-foreground hover:text-foreground"
                aria-label="Settings"
              >
                <Settings size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? 'right' : 'top'}>
              Settings
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">
                {SETTINGS_SHORTCUT}
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
