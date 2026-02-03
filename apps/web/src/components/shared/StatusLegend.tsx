import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type SessionStatus =
  | 'starting'
  | 'idle'
  | 'working'
  | 'planning'
  | 'needsInput'
  | 'done'
  | 'error';

export interface StatusCounts {
  starting: number;
  idle: number;
  working: number;
  planning: number;
  needsInput: number;
  done: number;
  error: number;
}

const statusConfig: Record<SessionStatus, { label: string; color: string }> = {
  starting: { label: 'Starting', color: 'bg-orange-500' },
  idle: { label: 'Idle', color: 'bg-gray-500' },
  working: { label: 'Working', color: 'bg-blue-500' },
  planning: { label: 'Planning', color: 'bg-purple-500' },
  needsInput: { label: 'Needs Input', color: 'bg-yellow-500' },
  done: { label: 'Done', color: 'bg-green-500' },
  error: { label: 'Error', color: 'bg-red-500' },
};

interface StatusLegendProps {
  counts?: Partial<StatusCounts>;
  showCounts?: boolean;
  className?: string;
}

export function StatusLegend({ counts, showCounts = true, className }: StatusLegendProps) {
  return (
    <div className={twMerge(clsx('flex items-center gap-3 flex-wrap', className))}>
      {(Object.entries(statusConfig) as [SessionStatus, { label: string; color: string }][]).map(
        ([status, config]) => {
          const count = counts?.[status] ?? 0;
          if (showCounts && count === 0) return null;

          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={clsx('w-2 h-2 rounded-full', config.color)} />
              <span className="text-xs text-foreground-secondary">
                {config.label}
                {showCounts && count > 0 && (
                  <span className="ml-1 text-muted-foreground">({count})</span>
                )}
              </span>
            </div>
          );
        }
      )}
    </div>
  );
}

export function StatusDot({ status, className }: { status: SessionStatus; className?: string }) {
  const config = statusConfig[status];
  return (
    <span
      className={twMerge(
        clsx('w-2 h-2 rounded-full inline-block', config.color, className)
      )}
      title={config.label}
    />
  );
}
