import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GitBranch, ChevronDown } from 'lucide-react';
import { StatusLegend, StatusCounts } from './StatusLegend';

interface TopBarProps {
  currentBranch: string;
  onBranchClick: () => void;
  statusCounts?: Partial<StatusCounts>;
  className?: string;
}

export function TopBar({
  currentBranch,
  onBranchClick,
  statusCounts,
  className,
}: TopBarProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'h-9 bg-omniscribe-surface/50 border-b border-omniscribe-border',
          'flex items-center justify-between px-4',
          className
        )
      )}
    >
      {/* Branch selector */}
      <button
        onClick={onBranchClick}
        className={clsx(
          'flex items-center gap-2 px-2 py-1 rounded',
          'text-sm text-omniscribe-text-secondary',
          'hover:bg-omniscribe-card hover:text-omniscribe-text-primary',
          'transition-colors'
        )}
      >
        <GitBranch size={14} />
        <span className="font-mono text-xs">{currentBranch}</span>
        <ChevronDown size={12} className="text-omniscribe-text-muted" />
      </button>

      {/* Status legend */}
      <StatusLegend counts={statusCounts} showCounts={true} />
    </div>
  );
}
