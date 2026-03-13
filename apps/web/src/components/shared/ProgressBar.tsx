import { cn } from '@/lib/utils';

interface ProgressBarProps {
  percentage: number;
  colorClass: string;
}

/**
 * A horizontal progress bar with configurable color.
 */
export function ProgressBar({ percentage, colorClass }: ProgressBarProps) {
  const clampedPercentage = Math.max(0, Math.min(percentage, 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={clampedPercentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(clampedPercentage)}% complete`}
      className="h-2 w-full bg-muted rounded-full overflow-hidden border border-border/50"
    >
      <div
        className={cn('h-full transition-all duration-500 rounded-full', colorClass)}
        style={{ width: `${clampedPercentage}%` }}
      />
    </div>
  );
}
