import { useEffect, useState } from 'react';
import { Play, LayoutGrid, History, Plus, Square, Zap } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { getCustomCommandIcon } from '@/lib/custom-command-icons';
import { WindowControls } from '@/components/shared/WindowControls';
import { StatusLegend, type StatusCounts } from '@/components/shared/StatusLegend';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import { MAX_CONCURRENT_SESSIONS } from '@omniscribe/shared';
import { CustomCommandsManager } from '@/components/custom-commands/CustomCommandsManager';
import { selectCommandsForProject, useCustomCommandStore } from '@/stores/useCustomCommandStore';

const STOP_SHORTCUT = IS_MAC ? '⌘ K' : 'Ctrl+K';
const HISTORY_SHORTCUT = IS_MAC ? '⌘ ⇧ H' : 'Ctrl+Shift+H';

interface ContentToolbarProps {
  activeProjectName: string | null;
  activeProjectPath: string | null;
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
  activeProjectPath,
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
  const toggleHistory = useAppUIStore(state => state.toggleHistory);
  const isHistoryOpen = useAppUIStore(state => state.isHistoryOpen);
  const openLaunchModal = useAppUIStore(state => state.openLaunchModal);

  const canAddMore =
    hasActiveProject && sessionCount + preLaunchSlotCount < MAX_CONCURRENT_SESSIONS;

  const [isCustomCommandsOpen, setIsCustomCommandsOpen] = useState(false);
  const fetchCustomCommands = useCustomCommandStore(state => state.fetchForProject);
  const customCommandsSelector = selectCommandsForProject(activeProjectPath);
  const customCommands = useCustomCommandStore(customCommandsSelector);
  const executeCustomCommand = useCustomCommandStore(state => state.executeCommand);

  // Refresh whenever the active project changes so the popover/menu reflects
  // the right list and the backend remains the source of truth.
  useEffect(() => {
    if (activeProjectPath) {
      void fetchCustomCommands(activeProjectPath);
    }
  }, [activeProjectPath, fetchCustomCommands]);

  const handleCustomCommandTrigger = (id: string) => {
    if (!activeProjectPath) return;
    void executeCustomCommand(activeProjectPath, id);
  };

  return (
    <div
      className={cn(
        'h-9 min-h-9 flex items-center select-none drag',
        'border-b border-border/50 bg-background'
      )}
    >
      {/* Left: Project breadcrumb */}
      <div className="no-drag flex items-center gap-1 pl-3 pr-2">
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

        {/* Custom Commands */}
        {hasActiveProject && activeProjectPath && (
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="no-drag w-7 h-7"
                    aria-label="Custom commands"
                  >
                    <Zap size={15} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Custom commands</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              className="p-1 w-64 max-h-80 overflow-y-auto"
              onCloseAutoFocus={e => e.preventDefault()}
            >
              <div className="px-2 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                Custom Commands
              </div>
              {customCommands.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No commands yet for this project.
                </div>
              ) : (
                <div className="flex flex-col">
                  {customCommands.map(cmd => {
                    const Icon = getCustomCommandIcon(cmd.icon);
                    return (
                      <button
                        type="button"
                        key={cmd.id}
                        onClick={() => handleCustomCommandTrigger(cmd.id)}
                        title={cmd.command}
                        className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded transition-colors flex items-center gap-2"
                      >
                        <Icon size={13} className="text-muted-foreground shrink-0" />
                        <span className="truncate">{cmd.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => setIsCustomCommandsOpen(true)}
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground rounded transition-colors flex items-center gap-2"
              >
                <Plus size={13} />
                <span>Manage Custom Commands…</span>
              </button>
            </PopoverContent>
          </Popover>
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

      <CustomCommandsManager
        projectPath={activeProjectPath}
        open={isCustomCommandsOpen}
        onOpenChange={setIsCustomCommandsOpen}
      />
    </div>
  );
}
