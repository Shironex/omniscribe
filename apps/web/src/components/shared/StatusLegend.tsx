import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { animationVariants } from '@/lib/animations';

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
  starting: { label: 'Starting', color: 'bg-status-pending' },
  idle: { label: 'Idle', color: 'bg-muted-foreground' },
  working: { label: 'Working', color: 'bg-status-info' },
  planning: { label: 'Planning', color: 'bg-primary' },
  needsInput: { label: 'Needs Input', color: 'bg-status-warning' },
  done: { label: 'Done', color: 'bg-status-success' },
  error: { label: 'Error', color: 'bg-status-error' },
};

interface StatusLegendProps {
  counts?: Partial<StatusCounts>;
  showCounts?: boolean;
  className?: string;
}

export function StatusLegend({ counts, showCounts = true, className }: StatusLegendProps) {
  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {(Object.entries(statusConfig) as [SessionStatus, { label: string; color: string }][]).map(
        ([status, config]) => {
          const count = counts?.[status] ?? 0;
          if (showCounts && count === 0) return null;

          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', config.color)} />
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

export function StatusDot({
  status,
  className,
  title,
}: {
  status: SessionStatus;
  className?: string;
  title?: string;
}) {
  const config = statusConfig[status];
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        variants={animationVariants.pop}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn('w-2 h-2 rounded-full inline-block', config.color, className)}
        title={title ?? config.label}
      />
    </AnimatePresence>
  );
}
