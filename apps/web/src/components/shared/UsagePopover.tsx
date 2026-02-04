import { useState, useEffect, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import { useUsageStore } from '@/stores/useUsageStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { UsageError } from '@omniscribe/shared';

const CLAUDE_SESSION_WINDOW_HOURS = 5;

/** Map error codes to user-friendly messages */
const ERROR_MESSAGES: Record<UsageError, { title: string; description: string }> = {
  auth_required: {
    title: 'Authentication required',
    description: "Please run 'claude login' in your terminal to authenticate.",
  },
  cli_not_found: {
    title: 'Claude CLI not found',
    description: 'Please install Claude Code CLI to view usage.',
  },
  timeout: {
    title: 'Request timed out',
    description: 'The Claude CLI took too long to respond. Try again.',
  },
  parse_error: {
    title: 'Failed to parse usage',
    description: 'Unable to read usage data from Claude CLI output.',
  },
  trust_prompt: {
    title: 'Folder permission needed',
    description:
      'Run "claude" in your terminal and approve folder access to continue.',
  },
  unknown: {
    title: 'Failed to fetch usage',
    description: 'An unexpected error occurred. Try again.',
  },
};

/** Get status color/icon based on percentage used */
function getStatusInfo(percentage: number) {
  if (percentage >= 75) return { color: 'text-red-500', icon: XCircle, bg: 'bg-red-500' };
  if (percentage >= 50) return { color: 'text-orange-500', icon: AlertTriangle, bg: 'bg-orange-500' };
  return { color: 'text-green-500', icon: CheckCircle, bg: 'bg-green-500' };
}

/** Progress bar component */
function ProgressBar({ percentage, colorClass }: { percentage: number; colorClass: string }) {
  return (
    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
      <div
        className={clsx('h-full transition-all duration-500', colorClass)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

/** Usage card component */
function UsageCard({
  title,
  subtitle,
  percentage,
  resetText,
  isPrimary = false,
  stale = false,
}: {
  title: string;
  subtitle: string;
  percentage: number;
  resetText?: string;
  isPrimary?: boolean;
  stale?: boolean;
}) {
  const isValidPercentage =
    typeof percentage === 'number' && !isNaN(percentage) && isFinite(percentage);
  const safePercentage = isValidPercentage ? percentage : 0;

  const status = getStatusInfo(safePercentage);
  const StatusIcon = status.icon;

  return (
    <div
      className={clsx(
        'rounded-xl border bg-card/50 p-4 transition-opacity',
        isPrimary ? 'border-border/60 shadow-sm' : 'border-border/40',
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

export function UsagePopover() {
  const [open, setOpen] = useState(false);

  // Usage store
  const claudeUsage = useUsageStore((s) => s.claudeUsage);
  const status = useUsageStore((s) => s.status);
  const error = useUsageStore((s) => s.error);
  const errorMessage = useUsageStore((s) => s.errorMessage);
  const fetchUsage = useUsageStore((s) => s.fetchUsage);
  const setWorkingDir = useUsageStore((s) => s.setWorkingDir);
  const startPolling = useUsageStore((s) => s.startPolling);
  const stopPolling = useUsageStore((s) => s.stopPolling);
  const lastFetched = useUsageStore((s) => s.lastFetched);

  // Get active project path from workspace store
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const projectPath = activeTab?.projectPath;

  // Update working directory when project changes
  useEffect(() => {
    if (projectPath) {
      setWorkingDir(projectPath);
    }
  }, [projectPath, setWorkingDir]);

  // Start/stop polling based on popover state
  useEffect(() => {
    if (open && projectPath) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [open, projectPath, startPolling, stopPolling]);

  // Check if data is stale (older than 2 minutes)
  const isStale = useMemo(() => {
    return !lastFetched || Date.now() - lastFetched > 2 * 60 * 1000;
  }, [lastFetched]);

  const isLoading = status === 'fetching';

  // Get progress bar color for header indicator
  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const sessionPercentage = claudeUsage?.sessionPercentage ?? 0;
  const statusColor = getStatusInfo(sessionPercentage).color;

  // Error info
  const errorInfo = error ? ERROR_MESSAGES[error] : null;

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-2 px-2 hover:bg-accent"
    >
      <ClaudeIcon className={clsx('w-4 h-4', claudeUsage && statusColor)} size={16} />
      {claudeUsage && (
        <div
          title={`Session usage (${CLAUDE_SESSION_WINDOW_HOURS}h window)`}
          className={clsx(
            'h-1.5 w-12 bg-muted-foreground/20 rounded-full overflow-hidden transition-opacity',
            isStale && 'opacity-60'
          )}
        >
          <div
            className={clsx(
              'h-full transition-all duration-500',
              getProgressBarColor(sessionPercentage)
            )}
            style={{ width: `${Math.min(sessionPercentage, 100)}%` }}
          />
        </div>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
          <div className="flex items-center gap-2">
            <ClaudeIcon className="w-4 h-4" size={16} />
            <span className="text-sm font-semibold">Claude Usage</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={clsx('h-6 w-6', isLoading && 'animate-spin')}
            onClick={() => fetchUsage()}
            disabled={isLoading}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
              <div className="space-y-1 flex flex-col items-center">
                <p className="text-sm font-medium">{errorInfo?.title ?? 'Error'}</p>
                <p className="text-xs text-muted-foreground">
                  {errorInfo?.description ?? errorMessage}
                </p>
              </div>
            </div>
          ) : !claudeUsage ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <RefreshCw className={clsx('w-6 h-6', isLoading && 'animate-spin')} />
              <p className="text-xs text-muted-foreground">Loading usage data...</p>
            </div>
          ) : (
            <>
              <UsageCard
                title="Session Usage"
                subtitle={`${CLAUDE_SESSION_WINDOW_HOURS}-hour rolling window`}
                percentage={claudeUsage.sessionPercentage}
                resetText={claudeUsage.sessionResetText}
                isPrimary={true}
                stale={isStale}
              />

              <div className="grid grid-cols-2 gap-3">
                <UsageCard
                  title="Sonnet"
                  subtitle="Weekly"
                  percentage={claudeUsage.sonnetWeeklyPercentage}
                  resetText={claudeUsage.sonnetResetText}
                  stale={isStale}
                />
                <UsageCard
                  title="Weekly"
                  subtitle="All models"
                  percentage={claudeUsage.weeklyPercentage}
                  resetText={claudeUsage.weeklyResetText}
                  stale={isStale}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50">
          <a
            href="https://status.claude.com"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Claude Status <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <span className="text-[10px] text-muted-foreground">Updates every 15 min</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
