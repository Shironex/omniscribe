import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GitBranch, X, Plus, Minus, Square, XIcon, Settings, Play, LayoutGrid } from 'lucide-react';
import { StatusLegend, StatusCounts } from './StatusLegend';
import { StatusDot, SessionStatus } from './StatusLegend';
import { UsagePopover } from '@/components/shared/UsagePopover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores';

const MAX_SESSIONS = 12;

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
  className,
}: TopBarProps) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const isMac = isElectron
    ? window.electronAPI?.platform === 'darwin'
    : typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const openSettings = useSettingsStore(state => state.openSettings);

  const canAddMore = hasActiveProject && sessionCount + preLaunchSlotCount < MAX_SESSIONS;
  const stopShortcut = isMac ? '⌘ K' : 'Ctrl+K';

  return (
    <div
      data-testid="project-tabs"
      className={twMerge(
        clsx(
          'h-11 bg-muted border-b border-border',
          'flex items-center select-none drag',
          isElectron && isMac && 'pl-[78px]',
          className
        )
      )}
    >
      {/* Left: Project tabs */}
      <div className="flex items-center overflow-x-auto no-scrollbar shrink min-w-0" role="tablist">
        {tabs.map(tab => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={activeTabId === tab.id ? 0 : -1}
            aria-selected={activeTabId === tab.id}
            className={clsx(
              'no-drag group flex items-center gap-2 px-3 h-full min-w-0',
              'cursor-pointer transition-colors border-r border-border',
              activeTabId === tab.id
                ? 'bg-card text-foreground'
                : 'text-foreground-secondary hover:bg-card/50 hover:text-foreground'
            )}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTab(tab.id);
              }
            }}
          >
            {tab.status && <StatusDot status={tab.status} />}
            <span className="text-sm truncate max-w-32">{tab.label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={e => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 h-auto w-auto opacity-0 group-hover:opacity-100"
                  aria-label={`Close ${tab.label}`}
                >
                  <X size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close tab</TooltipContent>
            </Tooltip>
          </div>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="new-tab-button"
              onClick={onNewTab}
              className="no-drag px-3 h-full"
              aria-label="New tab"
            >
              <Plus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New tab</TooltipContent>
        </Tooltip>
      </div>

      {/* Center spacer */}
      <div className="flex-1 min-w-2" />

      {/* Right: Status info + Actions + Window controls */}
      <div className="no-drag flex items-center gap-1.5 px-2 shrink-0">
        {/* Git branch */}
        <div
          className={clsx(
            'flex items-center gap-1.5 px-2 py-1 rounded',
            'text-foreground-secondary'
          )}
        >
          <GitBranch size={13} className="text-muted-foreground" />
          <span className="font-mono text-xs">{currentBranch}</span>
        </div>

        {/* Claude usage */}
        <UsagePopover />

        {/* Status dots (compact) */}
        <StatusLegend counts={statusCounts} showCounts={true} className="gap-2" />

        {/* Divider */}
        <div className="w-px h-5 bg-border mx-1" />

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
          <TooltipContent side="bottom">Settings</TooltipContent>
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
                {stopShortcut}
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
              className={clsx(
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

        {/* Divider before window controls */}
        {isElectron && !isMac && <div className="w-px h-5 bg-border mx-1" />}

        {/* Window controls (Electron only, hidden on macOS) */}
        {isElectron && !isMac && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.electronAPI?.window.minimize()}
                  className="w-7 h-7"
                  aria-label="Minimize"
                >
                  <Minus size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Minimize</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.electronAPI?.window.maximize()}
                  className="w-7 h-7"
                  aria-label="Maximize"
                >
                  <Square size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Maximize</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.electronAPI?.window.close()}
                  className="w-7 h-7 hover:bg-destructive/20 hover:text-destructive"
                  aria-label="Close"
                >
                  <XIcon size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
