import { useEffect, useMemo } from 'react';
import { AlertCircle, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { cn, Button } from '@omniscribe/ui';
import { Markdown } from '@/components/ui/markdown';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useClaudeChangelogStore } from '@/stores/useClaudeChangelogStore';

const GITHUB_CHANGELOG_URL = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md';

function formatRelative(epochMs: number | null): string {
  if (!epochMs) return 'never';
  const diff = Date.now() - epochMs;
  if (diff < 0) return 'just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString();
}

export function ClaudeChangelogSection() {
  const data = useClaudeChangelogStore(s => s.data);
  const status = useClaudeChangelogStore(s => s.status);
  const error = useClaudeChangelogStore(s => s.error);
  const errorMessage = useClaudeChangelogStore(s => s.errorMessage);
  const fetchChangelog = useClaudeChangelogStore(s => s.fetchChangelog);

  // Lazy fetch on first open. The 6h TTL on the backend means subsequent
  // opens within the window return the cached payload.
  useEffect(() => {
    if (!data && status === 'idle') {
      void fetchChangelog(false);
    }
  }, [data, status, fetchChangelog]);

  const isFetching = status === 'fetching';

  const [latest, rest] = useMemo(() => {
    const entries = data?.entries ?? [];
    return [entries[0] ?? null, entries.slice(1)];
  }, [data]);

  const openOnGitHub = () => window.open(GITHUB_CHANGELOG_URL, '_blank', 'noopener,noreferrer');

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Newspaper}
        title="Claude Code changelog"
        description="What's new in upstream Claude Code"
      />

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
            <Button variant="outline" size="sm" onClick={openOnGitHub}>
              <ExternalLink className="w-3.5 h-3.5" />
              View on GitHub
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChangelog(true)}
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
        {status === 'error' && !data && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {errorMessage ?? 'Failed to fetch the Claude Code changelog.'}
              {error && <span className="ml-1 text-muted-foreground">({error})</span>}
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
                    <span className="font-mono">{entry.version}</span>
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
