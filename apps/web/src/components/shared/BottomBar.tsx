import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FolderOpen, Plus, Square, Play } from 'lucide-react';

interface BottomBarProps {
  onSelectDirectory: () => void;
  onAddSession: () => void;
  onStopAll: () => void;
  onLaunch: () => void;
  canLaunch: boolean;
  hasActiveSessions: boolean;
  className?: string;
}

export function BottomBar({
  onSelectDirectory,
  onAddSession,
  onStopAll,
  onLaunch,
  canLaunch,
  hasActiveSessions,
  className,
}: BottomBarProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'h-12 bg-muted border-t border-border',
          'flex items-center justify-between px-4',
          className
        )
      )}
    >
      {/* Left actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSelectDirectory}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded',
            'text-sm text-foreground-secondary',
            'bg-card hover:bg-border',
            'transition-colors'
          )}
        >
          <FolderOpen size={16} />
          <span>Select Directory</span>
        </button>

        <button
          onClick={onAddSession}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded',
            'text-sm text-foreground-secondary',
            'bg-card hover:bg-border',
            'transition-colors'
          )}
        >
          <Plus size={16} />
          <span>Add Session</span>
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {hasActiveSessions && (
          <button
            onClick={onStopAll}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded',
              'text-sm text-white',
              'bg-red-600 hover:bg-red-500',
              'transition-colors'
            )}
          >
            <Square size={14} />
            <span>Stop All</span>
          </button>
        )}

        <button
          onClick={onLaunch}
          disabled={!canLaunch}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 rounded',
            'text-sm font-medium text-white',
            'transition-colors',
            canLaunch
              ? 'bg-primary hover:bg-primary/80'
              : 'bg-primary/50 cursor-not-allowed'
          )}
        >
          <Play size={14} />
          <span>Launch</span>
        </button>
      </div>
    </div>
  );
}
