import { Sparkles, Plug } from 'lucide-react';
import { useMcpCapabilitiesStore, selectMcpCapabilities } from '@/stores/useMcpCapabilitiesStore';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import { cn } from '@/lib/utils';

/**
 * Visualizes capability wiring as a "session ⇄ capabilities" chain. Each
 * capability is a pill — enabled ones light up with the primary tint and
 * connect with a solid line; disabled ones stay muted with a dashed line.
 */
export function AiCapabilitiesPreview() {
  const capabilities = useMcpCapabilitiesStore(selectMcpCapabilities);
  const activeTab = useWorkspaceStore(selectActiveTab);

  const enabledCount = capabilities.filter(c => c.enabled).length;
  const total = capabilities.length;

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-4">
      <div className="flex items-center gap-3">
        {/* Session node */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/15 text-primary text-xs font-medium shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Session</span>
        </div>

        {/* Capability chain */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {total === 0 ? (
            <span className="text-[11px] text-muted-foreground italic">
              No capabilities registered
            </span>
          ) : (
            capabilities.map(cap => {
              const on = cap.enabled;
              return (
                <div key={cap.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-block h-px w-3',
                      on
                        ? 'bg-primary/60'
                        : 'bg-transparent border-t border-dashed border-border-glass'
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors',
                      on
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border-glass bg-background/40 text-muted-foreground'
                    )}
                    title={cap.description}
                  >
                    <Plug className={cn('w-3 h-3', !on && 'opacity-50')} />
                    <span className="truncate max-w-[110px]">{cap.label}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-muted-foreground">
        <span>{activeTab ? `Project · ${activeTab.name}` : 'No active project'}</span>
        <span className="tabular-nums">
          {enabledCount}/{total} enabled
        </span>
      </div>
    </div>
  );
}
