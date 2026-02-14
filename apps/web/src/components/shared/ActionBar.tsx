import { cn } from '@/lib/utils';
import { Settings, Play, LayoutGrid, History, Plus, Square } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores';
import { IS_MAC } from '@/lib/platform';
import { MAX_CONCURRENT_SESSIONS } from '@omniscribe/shared';

const STOP_SHORTCUT = IS_MAC ? '⌘ K' : 'Ctrl+K';
const SETTINGS_SHORTCUT = IS_MAC ? '⌘ ,' : 'Ctrl+,';
const HISTORY_SHORTCUT = IS_MAC ? '⌘ ⇧ H' : 'Ctrl+Shift+H';

interface ActionBarProps {
  hasActiveProject: boolean;
  sessionCount: number;
  preLaunchSlotCount: number;
  onToggleHistory?: () => void;
  isHistoryOpen?: boolean;
  onOpenLaunchModal?: () => void;
  onAddSlot?: () => void;
  onStopAll: () => void;
  onLaunch: () => void;
  canLaunch: boolean;
  isLaunching: boolean;
  hasActiveSessions: boolean;
}

export function ActionBar({
  hasActiveProject,
  sessionCount,
  preLaunchSlotCount,
  onToggleHistory,
  isHistoryOpen,
  onOpenLaunchModal,
  onAddSlot,
  onStopAll,
  onLaunch,
  canLaunch,
  isLaunching,
  hasActiveSessions,
}: ActionBarProps) {
  const openSettings = useSettingsStore(state => state.openSettings);
  const canAddMore =
    hasActiveProject && sessionCount + preLaunchSlotCount < MAX_CONCURRENT_SESSIONS;

  return (
    <>
      {/* Session History toggle */}
      {hasActiveProject && onToggleHistory && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleHistory}
              className={cn('no-drag w-7 h-7', isHistoryOpen && 'bg-primary/10 text-primary')}
              aria-label="Session history"
            >
              <History size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Session history
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">
              {HISTORY_SHORTCUT}
            </kbd>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Settings */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openSettings()}
            className="no-drag w-7 h-7"
            aria-label="Settings"
          >
            <Settings size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Settings
          <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">
            {SETTINGS_SHORTCUT}
          </kbd>
        </TooltipContent>
      </Tooltip>

      {/* Set Up Sessions */}
      {canAddMore && onOpenLaunchModal && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="setup-sessions-button"
              onClick={onOpenLaunchModal}
              className="no-drag w-7 h-7"
              aria-label="Set up sessions"
            >
              <LayoutGrid size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Set up sessions
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">Shift+N</kbd>
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
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">N</kbd>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Stop All (shown when sessions are active) */}
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
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">
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
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">L</kbd>
          )}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
