import { clsx } from 'clsx';
import { CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

/** Get status color/icon based on percentage used */
export function getStatusInfo(percentage: number) {
  if (percentage >= 75) return { color: 'text-status-error', icon: XCircle, bg: 'bg-status-error' };
  if (percentage >= 50)
    return { color: 'text-status-warning', icon: AlertTriangle, bg: 'bg-status-warning' };
  return { color: 'text-primary', icon: CheckCircle, bg: 'bg-primary' };
}

interface UsageCardProps {
  title: string;
  subtitle: string;
  percentage: number;
  resetText?: string;
  isPrimary?: boolean;
  stale?: boolean;
}

/**
 * A card displaying usage percentage with a progress bar and status indicator.
 */
export function UsageCard({
  title,
  subtitle,
  percentage,
  resetText,
  isPrimary = false,
  stale = false,
}: UsageCardProps) {
  const isValidPercentage =
    typeof percentage === 'number' && !isNaN(percentage) && isFinite(percentage);
  const safePercentage = isValidPercentage ? percentage : 0;

  const status = getStatusInfo(safePercentage);
  const StatusIcon = status.icon;

  return (
    <div
      className={clsx(
        'rounded-xl border bg-card/50 p-4 transition-opacity',
        isPrimary ? 'border-border shadow-sm' : 'border-border/60',
        (stale || !isValidPercentage) && 'opacity-50'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className={clsx('font-semibold', isPrimary ? 'text-sm' : 'text-xs')}>{title}</h4>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
        {isValidPercentage ? (
          <div className="flex items-center gap-1.5">
            <StatusIcon className={clsx('w-3.5 h-3.5', status.color)} />
            <span
              className={clsx(
                'font-mono font-bold',
                status.color,
                isPrimary ? 'text-base' : 'text-sm'
              )}
            >
              {Math.round(safePercentage)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">N/A</span>
        )}
      </div>
      <ProgressBar
        percentage={safePercentage}
        colorClass={isValidPercentage ? status.bg : 'bg-muted-foreground/30'}
      />
      {resetText && (
        <div className="mt-2 flex justify-end">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {resetText}
          </p>
        </div>
      )}
    </div>
  );
}
