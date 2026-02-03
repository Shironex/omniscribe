import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  GitBranch,
  ChevronDown,
  Zap,
  Play,
  GitCommit,
  Wrench,
  Sparkles,
  Terminal,
  FileText,
  Settings,
  Navigation,
  LucideIcon,
} from 'lucide-react';
import { StatusLegend, StatusCounts } from './StatusLegend';

interface QuickActionItem {
  id: string;
  title: string;
  icon?: string;
  shortcut?: string;
}

interface TopBarProps {
  currentBranch: string;
  statusCounts?: Partial<StatusCounts>;
  quickActions?: QuickActionItem[];
  onQuickAction?: (actionId: string) => void;
  className?: string;
}

/**
 * Map icon name to Lucide icon component
 */
function getActionIcon(iconName?: string): LucideIcon {
  const iconMap: Record<string, LucideIcon> = {
    Play,
    GitCommit,
    Wrench,
    Sparkles,
    Zap,
    Terminal,
    FileText,
    Settings,
    Navigation,
  };

  return iconMap[iconName ?? ''] ?? Zap;
}

export function TopBar({
  currentBranch,
  statusCounts,
  quickActions,
  onQuickAction,
  className,
}: TopBarProps) {
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        quickActionsRef.current &&
        !quickActionsRef.current.contains(event.target as Node)
      ) {
        setIsQuickActionsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuickActionClick = (actionId: string) => {
    onQuickAction?.(actionId);
    setIsQuickActionsOpen(false);
  };

  return (
    <div
      className={twMerge(
        clsx(
          'h-9 bg-muted/50 border-b border-border',
          'flex items-center justify-between px-4',
          className
        )
      )}
    >
      {/* Branch display */}
      <div
        className={clsx(
          'flex items-center gap-2 px-2 py-1 rounded',
          'text-sm text-foreground-secondary'
        )}
      >
        <GitBranch size={14} className="text-muted-foreground" />
        <span className="font-mono text-xs">{currentBranch}</span>
      </div>

      {/* Right section: Quick actions and Status legend */}
      <div className="flex items-center gap-3">
        {/* Quick actions dropdown */}
        {quickActions && quickActions.length > 0 && (
          <div ref={quickActionsRef} className="relative">
            <button
              onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded',
                'text-xs text-foreground-secondary',
                'hover:bg-card hover:text-foreground',
                'transition-colors',
                isQuickActionsOpen && 'bg-card text-foreground'
              )}
              title="Quick Actions"
            >
              <Zap size={14} />
              <ChevronDown
                size={12}
                className={clsx(
                  'text-muted-foreground transition-transform',
                  isQuickActionsOpen && 'rotate-180'
                )}
              />
            </button>

            {/* Quick actions dropdown menu */}
            {isQuickActionsOpen && (
              <div
                className={clsx(
                  'absolute top-full right-0 mt-1 z-50',
                  'bg-muted border border-border rounded-lg shadow-xl',
                  'overflow-hidden animate-fade-in min-w-[180px] max-h-[300px] overflow-y-auto'
                )}
              >
                {quickActions.map((action) => {
                  const Icon = getActionIcon(action.icon);
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleQuickActionClick(action.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-1.5',
                        'text-xs text-left transition-colors',
                        'text-foreground hover:bg-card'
                      )}
                    >
                      <Icon size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate">{action.title}</span>
                      {action.shortcut && (
                        <span className="text-muted-foreground font-mono text-2xs flex-shrink-0">
                          {action.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Status legend */}
        <StatusLegend counts={statusCounts} showCounts={true} />
      </div>
    </div>
  );
}
