import { Package, ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useAppVersion } from '@/hooks/useAppVersion';
import { cn } from '@/lib/utils';

/**
 * Version-flow pill diagram: current version pill on the left, an arrow,
 * then a channel pill (Stable / Beta) on the right. The channel pill
 * picks up the channel-appropriate accent so users see which update
 * stream they're subscribed to without parsing prose.
 */
export function UpdatesPreview() {
  const channel = useUpdateStore(s => s.channel);
  const updateInfo = useUpdateStore(s => s.updateInfo);
  const status = useUpdateStore(s => s.status);
  const version = useAppVersion();
  const isBeta = channel === 'beta';
  const ChannelIcon = isBeta ? FlaskConical : ShieldCheck;

  const targetVersion =
    (status === 'available' || status === 'downloading' || status === 'ready') &&
    updateInfo?.version
      ? `v${updateInfo.version}`
      : 'latest';

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-4">
      <div className="flex items-center gap-3">
        {/* Current version pill */}
        <div className="flex flex-col items-start gap-1 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Installed
          </span>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border-glass bg-card/40 px-2 py-1 text-[12px] font-mono text-foreground">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="tabular-nums">{version ? `v${version}` : 'v—'}</span>
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-muted-foreground/70 shrink-0" />

        {/* Channel pill */}
        <div className="flex flex-col items-start gap-1 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Channel
          </span>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium',
              isBeta
                ? 'border-status-warning/30 bg-status-warning-bg text-status-warning'
                : 'border-status-success/30 bg-status-success-bg/40 text-status-success'
            )}
          >
            <ChannelIcon className="w-3.5 h-3.5" />
            <span>{isBeta ? 'Beta' : 'Stable'}</span>
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-muted-foreground/70 shrink-0" />

        {/* Next version target */}
        <div className="flex flex-col items-start gap-1 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Target
          </span>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[12px] font-mono text-primary">
            <span className="tabular-nums">{targetVersion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
