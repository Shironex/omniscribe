import { Zap, Play } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { SessionSettings } from '@omniscribe/shared';
import { DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';

/**
 * Sample preview of a quick-action tile rendered as it would appear
 * inside a session toolbar. Reflects the active execution mode so
 * users see the difference between paste-only and execute.
 */
export function QuickActionPreview() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
  const mode = sessionSettings.quickActionMode ?? 'paste-only';

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-4 space-y-3">
      <p className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        Sample tile
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/15 text-primary"
        >
          <Zap className="w-3.5 h-3.5" />
          Run tests
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-glass bg-background/40 text-muted-foreground"
        >
          <Play className="w-3.5 h-3.5" />
          Lint
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-glass bg-background/40 text-muted-foreground"
        >
          <Zap className="w-3.5 h-3.5" />
          Type-check
        </button>
      </div>
      <div className="rounded-md border border-border-glass/60 bg-card/30 p-2.5 font-mono text-[11px] text-foreground/80">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1 font-sans text-[10px] uppercase tracking-wider">
          {mode === 'execute' ? (
            <>
              <Play className="w-3 h-3 text-primary" />
              <span>Paste &amp; Execute</span>
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 text-primary" />
              <span>Paste only</span>
            </>
          )}
        </div>
        <code>$ pnpm test --run</code>
        {mode === 'execute' && (
          <div className="text-muted-foreground/80 mt-0.5">
            <span className="text-status-success">✓</span> 142 passed in 3.4s
          </div>
        )}
        {mode === 'paste-only' && (
          <div className="text-muted-foreground/70 mt-0.5 italic font-sans text-[10px]">
            Press Enter to run.
          </div>
        )}
      </div>
    </div>
  );
}
