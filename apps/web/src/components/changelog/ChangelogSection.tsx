import { useEffect, useMemo } from 'react';
import { AlertCircle, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import type { PluginIconComponent } from '@omniscribe/plugin-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/markdown';
import { useChangelogStore, selectChangelogSlot } from '@/stores/useChangelogStore';
import { formatRelative } from './format-relative';

interface ChangelogSectionProps {
  /** Registered source id (matches `ChangelogSourceRegistration.id`). */
  sourceId: string;
  /** Display label for the section header (e.g. `"Claude Code"`). */
  label: string;
  /** Icon used in the section header. Falls back to lucide `Newspaper`. */
  icon?: PluginIconComponent;
  /**
   * Public URL for the "View on GitHub" affordance. Falls back to the
   * fetcher-supplied `viewUrl` from the response payload, then to `null`
   * (button hidden).
   */
  viewUrl?: string;
}

/**
 * Generic settings panel that consumes the per-source slot from
 * `useChangelogStore`. The plugin's only changelog interaction is
 * `context.registerChangelogSource(...)` — this component is mounted
 * by the host via the auto-registered settings section.
 */
export function ChangelogSection({ sourceId, label, icon, viewUrl }: ChangelogSectionProps) {
  const slot = useChangelogStore(selectChangelogSlot(sourceId));
  const fetchChangelog = useChangelogStore(s => s.fetchChangelog);

  // Lazy fetch on first open. Backend TTL means subsequent opens within
  // the window return the cached payload.
  useEffect(() => {
    if (!slot.data && slot.status === 'idle') {
      void fetchChangelog(sourceId, false);
    }
  }, [slot.data, slot.status, sourceId, fetchChangelog]);

  const isFetching = slot.status === 'fetching';
  const data = slot.data;

  const [latest, rest] = useMemo(() => {
    const entries = data?.entries ?? [];
    return [entries[0] ?? null, entries.slice(1)];
  }, [data]);

  const Icon = icon ?? Newspaper;
  const effectiveViewUrl = viewUrl ?? data?.viewUrl ?? null;

  const openOnGitHub = () => {
    if (!effectiveViewUrl) return;
    window.open(effectiveViewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-linear-to-br from-primary/18 via-brand-500/10 to-transparent'
          )}
        >
          <Icon size={20} className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">{label} changelog</h2>
          <p className="text-sm text-muted-foreground">What&apos;s new in upstream {label}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-sm font-medium text-foreground">Release notes</h3>
            <p className="text-xs text-muted-foreground">
              Last fetched: {formatRelative(data?.fetchedAt ?? null)}
              {data?.fromCache && (
                <span className="ml-2 text-foreground-muted">(showing cached copy)</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {effectiveViewUrl && (
              <Button variant="outline" size="sm" onClick={openOnGitHub}>
                <ExternalLink className="w-3.5 h-3.5" />
                View on GitHub
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChangelog(sourceId, true)}
              disabled={isFetching}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
              {isFetching ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Loading skeleton when fetching with no prior data */}
        {isFetching && !data && (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 w-1/3 rounded bg-muted/60" />
            <div className="h-3 w-full rounded bg-muted/40" />
            <div className="h-3 w-5/6 rounded bg-muted/40" />
            <div className="h-3 w-4/6 rounded bg-muted/40" />
          </div>
        )}

        {/* Error state with no usable data */}
        {slot.status === 'error' && !data && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {slot.errorMessage ?? `Failed to fetch the ${label} changelog.`}
              {slot.error && <span className="ml-1 text-muted-foreground">({slot.error})</span>}
            </span>
          </div>
        )}

        {/* Empty success — markdown without any `## ` headers */}
        {data && latest === null && (
          <p className="text-sm text-muted-foreground">
            No changelog entries were found in the upstream document.
          </p>
        )}

        {/* Latest entry — always expanded */}
        {latest && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Latest</h4>
              <span className="font-mono text-sm text-primary">{latest.version}</span>
              {latest.prerelease && (
                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-muted/60 text-muted-foreground">
                  pre-release
                </span>
              )}
            </div>
            <div className="rounded-lg border border-border/50 bg-background/50 p-4">
              <Markdown>{latest.bodyMarkdown}</Markdown>
            </div>
          </div>
        )}

        {/* Older entries — collapsible <details> */}
        {rest.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Earlier versions</h4>
            <div className="space-y-1.5">
              {rest.map(entry => (
                <details
                  key={entry.version}
                  className={cn(
                    'group rounded-lg border border-border/50 bg-background/30',
                    'open:bg-background/60'
                  )}
                >
                  <summary
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2',
                      'cursor-pointer select-none rounded-lg',
                      'text-sm text-foreground hover:bg-muted/40',
                      'marker:hidden [&::-webkit-details-marker]:hidden'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{entry.version}</span>
                      {entry.prerelease && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-muted/60 text-muted-foreground">
                          pre-release
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
                    <span className="text-xs text-muted-foreground hidden group-open:inline">
                      Hide
                    </span>
                  </summary>
                  <div className="px-4 pb-3">
                    <Markdown>{entry.bodyMarkdown}</Markdown>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
