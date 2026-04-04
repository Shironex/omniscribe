import { PanelLeft, Play, LayoutGrid, History, Plus, Square } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { WindowControls } from '@/components/shared/WindowControls';
import { StatusLegend, type StatusCounts } from '@/components/shared/StatusLegend';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import { MAX_CONCURRENT_SESSIONS } from '@omniscribe/shared';

const STOP_SHORTCUT = IS_MAC ? '⌘ K' : 'Ctrl+K';
const HISTORY_SHORTCUT = IS_MAC ? '⌘ ⇧ H' : 'Ctrl+Shift+H';
const SIDEBAR_SHORTCUT = IS_MAC ? '⌘ B' : 'Ctrl+B';

interface ContentToolbarProps {
  activeProjectName: string | null;
  statusCounts?: Partial<StatusCounts>;
  hasActiveProject: boolean;
  sessionCount: number;
  preLaunchSlotCount: number;
  onAddSlot?: () => void;
  onStopAll: () => void;
  onLaunch: () => void;
  canLaunch: boolean;
  isLaunching: boolean;
  hasActiveSessions: boolean;
}

export function ContentToolbar({
  activeProjectName,
  statusCounts,
  hasActiveProject,
  sessionCount,
  preLaunchSlotCount,
  onAddSlot,
  onStopAll,
  onLaunch,
  canLaunch,
  isLaunching,
  hasActiveSessions,
}: ContentToolbarProps) {
  const isSidebarCollapsed = useAppUIStore(state => state.isSidebarCollapsed);
  const toggleSidebar = useAppUIStore(state => state.toggleSidebar);
  const toggleHistory = useAppUIStore(state => state.toggleHistory);
  const isHistoryOpen = useAppUIStore(state => state.isHistoryOpen);
  const openLaunchModal = useAppUIStore(state => state.openLaunchModal);

  const canAddMore =
    hasActiveProject && sessionCount + preLaunchSlotCount < MAX_CONCURRENT_SESSIONS;

  return (
    <div
      className={cn(
        'h-9 min-h-9 flex items-center select-none drag',
        'border-b border-border/50 bg-background'
      )}
    >
      {/* Left: Sidebar toggle + project breadcrumb */}
      <div className="no-drag flex items-center gap-1 px-2">
        {isSidebarCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="w-7 h-7 text-muted-foreground hover:text-foreground"
                aria-label="Expand sidebar"
              >
                <PanelLeft size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Expand sidebar
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">
                {SIDEBAR_SHORTCUT}
              </kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {activeProjectName && (
          <span className="text-sm text-foreground-secondary truncate max-w-48">
            {activeProjectName}
          </span>
        )}
      </div>

      {/* Center spacer */}
      <div className="flex-1 min-w-2" />

      {/* Right: Status + Actions + Window controls */}
      <div className="no-drag flex items-center gap-1 px-2 shrink-0">
        <StatusLegend counts={statusCounts} showCounts={true} className="gap-2" />

        {statusCounts && Object.values(statusCounts).some(v => v && v > 0) && (
          <div className="w-px h-4 bg-border/50 mx-1" />
        )}

        {/* Session History toggle */}
        {hasActiveProject && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleHistory}
                className={cn('no-drag w-7 h-7', isHistoryOpen && 'bg-primary/10 text-primary')}
                aria-label="Session history"
              >
                <History size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Session history
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">
                {HISTORY_SHORTCUT}
              </kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Set Up Sessions */}
        {canAddMore && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="setup-sessions-button"
                onClick={openLaunchModal}
                className="no-drag w-7 h-7"
                aria-label="Set up sessions"
              >
                <LayoutGrid size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Set up sessions
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">Shift+N</kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Add One slot */}
        {canAddMore && onAddSlot && preLaunchSlotCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="add-session-button"
                onClick={onAddSlot}
                className="no-drag w-7 h-7"
                aria-label="Add session"
              >
                <Plus size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Add session
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">N</kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Stop All */}
        {hasActiveSessions && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="stop-all-button"
                onClick={onStopAll}
                className="no-drag w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label="Stop all sessions"
              >
                <Square size={14} fill="currentColor" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Stop all sessions
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">
                {STOP_SHORTCUT}
              </kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Launch */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="launch-button"
              onClick={onLaunch}
              disabled={!canLaunch || isLaunching}
              className={cn(
                'no-drag w-7 h-7',
                canLaunch && !isLaunching && 'text-primary hover:bg-primary/10'
              )}
              aria-label="Launch all sessions"
            >
              <Play size={15} fill="currentColor" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isLaunching ? 'Launching...' : 'Launch all sessions'}
            {canLaunch && !isLaunching && (
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">L</kbd>
            )}
          </TooltipContent>
        </Tooltip>

        <WindowControls />
      </div>
    </div>
  );
}
