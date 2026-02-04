import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Settings, Square, Play } from 'lucide-react';
import { useSettingsStore } from '../../stores';

interface BottomBarProps {
  onStopAll: () => void;
  onLaunch: () => void;
  canLaunch: boolean;
  isLaunching?: boolean;
  hasActiveSessions: boolean;
  className?: string;
}

export function BottomBar({
  onStopAll,
  onLaunch,
  canLaunch,
  isLaunching = false,
  hasActiveSessions,
  className,
}: BottomBarProps) {
  const openSettings = useSettingsStore((state) => state.openSettings);

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
          onClick={() => openSettings()}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded',
            'text-sm text-foreground-secondary',
            'bg-card hover:bg-border',
            'transition-colors'
          )}
        >
          <Settings size={16} />
          <span>Settings</span>
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
          disabled={!canLaunch || isLaunching}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 rounded',
            'text-sm font-medium text-white',
            'transition-colors',
            canLaunch && !isLaunching
              ? 'bg-primary hover:bg-primary/80'
              : 'bg-primary/50 cursor-not-allowed'
          )}
        >
          <Play size={14} />
          <span>{isLaunching ? 'Launching...' : 'Launch'}</span>
        </button>
      </div>
    </div>
  );
}
