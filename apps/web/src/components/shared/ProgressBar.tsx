import { clsx } from 'clsx';

interface ProgressBarProps {
  percentage: number;
  colorClass: string;
}

/**
 * A horizontal progress bar with configurable color.
 */
export function ProgressBar({ percentage, colorClass }: ProgressBarProps) {
  return (
    <div className="h-2 w-full bg-muted rounded-full overflow-hidden border border-border/50">
      <div
        className={clsx('h-full transition-all duration-500 rounded-full', colorClass)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
