import { clsx } from 'clsx';
import { GitBranch } from 'lucide-react';
import { StatusLegend, type StatusCounts } from './StatusLegend';
import { UsagePopover } from '@/components/shared/UsagePopover';

interface StatusBarProps {
  currentBranch: string;
  statusCounts?: Partial<StatusCounts>;
}

export function StatusBar({ currentBranch, statusCounts }: StatusBarProps) {
  return (
    <>
      {/* Git branch */}
      <div
        className={clsx('flex items-center gap-1.5 px-2 py-1 rounded', 'text-foreground-secondary')}
      >
        <GitBranch size={13} className="text-muted-foreground" />
        <span className="font-mono text-xs">{currentBranch}</span>
      </div>

      {/* Claude usage */}
      <UsagePopover />

      {/* Status dots (compact) */}
      <StatusLegend counts={statusCounts} showCounts={true} className="gap-2" />
    </>
  );
}
