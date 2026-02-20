import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
  cn,
  Badge,
  emitAsync,
  getSocket,
  UsageCard,
  getStatusInfo,
} from '@omniscribe/ui';
import { RefreshCw, AlertTriangle, ExternalLink, Loader2, Activity } from 'lucide-react';
import { UsageEvents } from '@omniscribe/shared';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { UsagePanelProps } from '@omniscribe/plugin-api';
import { CodexIcon } from './CodexIcon';

// ---- Types ----

interface UsageMetric {
  name: string;
  percentage: number;
  percentageType: 'used' | 'remaining';
  resetTime?: string;
  resetText?: string;
  category?: string;
}

interface ProviderUsageResponse {
  providerUsage?: {
    metrics: UsageMetric[];
    lastUpdated: string;
    userTimezone?: string;
  };
  error?: string;
  message?: string;
}

// ---- Constants ----

const POLLING_INTERVAL = 15 * 60 * 1000; // 15 minutes
const STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

/** Convert metric to "used" percentage */
function toUsedPct(metric: UsageMetric): number {
  return metric.percentageType === 'used' ? metric.percentage : 100 - metric.percentage;
}

// ---- Plan Badge ----

function PlanBadge({ planLabel }: { planLabel: string }) {
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
      {planLabel}
    </Badge>
  );
}

// ---- Main Component ----

/**
 * Codex Usage Panel
 *
 * Provides the Codex usage experience as a Popover:
 * - Trigger: Activity icon with primary rate limit progress bar
 * - Content: Rate limit metrics from ProviderUsageData
 * - Error states, loading states, staleness indicators
 * - Polling for live updates when open
 *
 * Registered as a usage panel via frontendActivate.
 */
export function CodexUsagePanel({ embedded = false }: UsagePanelProps) {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<UsageMetric[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get project path from workspace store
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const projectPath = activeTab?.projectPath;

  const fetchUsage = useCallback(async () => {
    if (!projectPath) return;
    if (status === 'fetching') return;

    setStatus('fetching');
    setError(null);

    try {
      const response = await emitAsync<
        { workingDir: string; aiMode: string },
        ProviderUsageResponse
      >(UsageEvents.FETCH, { workingDir: projectPath, aiMode: 'codex' }, { timeout: 60000 });

      if (response.error) {
        setStatus('error');
        setError(response.message ?? response.error);
        return;
      }

      if (response.providerUsage) {
        setMetrics(response.providerUsage.metrics);
        setLastUpdated(response.providerUsage.lastUpdated);
        setLastFetched(Date.now());
        setStatus('success');
        return;
      }

      setStatus('error');
      setError('Usage data not available');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to fetch usage');
    }
  }, [projectPath, status]);

  // Start/stop polling based on popover state (or mount/unmount in embedded mode)
  const isActive = embedded || open;
  useEffect(() => {
    if (isActive && projectPath) {
      // Fetch immediately
      fetchUsage();

      // Check socket connected
      let connected = false;
      try {
        connected = getSocket().connected;
      } catch {
        // Socket not initialized yet
      }

      if (connected) {
        pollingRef.current = setInterval(() => {
          fetchUsage();
        }, POLLING_INTERVAL);
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isActive, projectPath]);

  // Check if data is stale
  const isStale = useMemo(() => {
    return !lastFetched || Date.now() - lastFetched > STALE_THRESHOLD;
  }, [lastFetched]);

  const isLoading = status === 'fetching';

  // Get primary metric for trigger progress bar
  const primaryMetric = metrics?.[0];
  const primaryPct = primaryMetric ? toUsedPct(primaryMetric) : 0;
  const primaryStatus = getStatusInfo(primaryPct);

  // Extract plan label from primary metric name if present (e.g., "Rate Limit (Plus)")
  const planMatch = primaryMetric?.name.match(/\((\w+)\)$/);
  const planLabel = planMatch?.[1] ?? null;

  const tooltipLabel = metrics ? `Codex usage: ${Math.round(primaryPct)}%` : 'Codex usage';

  // Format last updated
  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return null;
    try {
      const date = new Date(lastUpdated);
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [lastUpdated]);

  const trigger = (
    <Button variant="ghost" size="sm" className="h-8 gap-2 px-2 hover:bg-accent">
      <CodexIcon className={cn('w-4 h-4', metrics && primaryStatus.color)} size={16} />
      {metrics && (
        <div
          className={cn(
            'h-1.5 w-12 bg-muted rounded-full overflow-hidden border border-border/50 transition-opacity',
            isStale && 'opacity-60'
          )}
        >
          <div
            className={cn('h-full transition-all duration-500 rounded-full', primaryStatus.bg)}
            style={{ width: `${Math.min(primaryPct, 100)}%` }}
          />
        </div>
      )}
    </Button>
  );

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/10">
        <div className="flex items-center gap-2">
          <CodexIcon size={16} />
          <span className="text-sm font-semibold">Codex Usage</span>
          {planLabel && <PlanBadge planLabel={planLabel} />}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => fetchUsage()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {error ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500/80" />
            <div className="space-y-1 flex flex-col items-center">
              <p className="text-sm font-medium">Failed to fetch usage</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : !metrics ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading usage data...</p>
          </div>
        ) : metrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
            <Activity className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Usage data not available</p>
          </div>
        ) : (
          <>
            {/* Primary metric (first) */}
            {metrics[0] && (
              <UsageCard
                title={metrics[0].name}
                subtitle={metrics[0].category ?? 'Rate limit'}
                percentage={toUsedPct(metrics[0])}
                resetText={metrics[0].resetText}
                isPrimary
                stale={isStale}
              />
            )}

            {/* Secondary metrics (remaining) in a grid */}
            {metrics.length > 1 && (
              <div
                className={cn('grid gap-3', metrics.length === 2 ? 'grid-cols-1' : 'grid-cols-2')}
              >
                {metrics.slice(1).map((m, i) => (
                  <UsageCard
                    key={i}
                    title={m.name}
                    subtitle={m.category ?? 'Rate limit'}
                    percentage={toUsedPct(m)}
                    resetText={m.resetText}
                    stale={isStale}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary/10 border-t border-border/50">
        <a
          href="https://status.openai.com"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          OpenAI Status <ExternalLink className="w-2.5 h-2.5" />
        </a>
        {lastUpdatedText && (
          <span className="text-[10px] text-muted-foreground">Updated {lastUpdatedText}</span>
        )}
        {!lastUpdatedText && (
          <span className="text-[10px] text-muted-foreground">Updates every 15 min</span>
        )}
      </div>
    </>
  );

  // Embedded mode: content only (used inside multi-provider tabbed popover)
  if (embedded) {
    return content;
  }

  // Standalone mode: full Popover with trigger
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </TooltipTrigger>
        {!open && <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>}
      </Tooltip>
      <PopoverContent
        className="w-[340px] p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
