import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GitBranch } from 'lucide-react';
import { StatusLegend, StatusCounts } from './StatusLegend';
import { UsagePopover } from '@/components/usage';

interface TopBarProps {
  currentBranch: string;
  statusCounts?: Partial<StatusCounts>;
  className?: string;
}

export function TopBar({
  currentBranch,
  statusCounts,
  className,
}: TopBarProps) {
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

      {/* Right section: Usage popover and Status legend */}
      <div className="flex items-center gap-3">
        <UsagePopover />
        <StatusLegend counts={statusCounts} showCounts={true} />
      </div>
    </div>
  );
}
