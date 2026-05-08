import { cn } from '@/lib/utils';

interface FakeLogLine {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  scope: string;
  message: string;
}

const LINES: ReadonlyArray<FakeLogLine> = [
  {
    ts: '12:04:11',
    level: 'INFO',
    scope: 'SessionService',
    message: 'Session a3f2 transitioned Idle → Working',
  },
  {
    ts: '12:04:12',
    level: 'WARN',
    scope: 'McpDiscovery',
    message: 'Server "playwright" took 1.2s to respond',
  },
  {
    ts: '12:04:14',
    level: 'ERROR',
    scope: 'GitService',
    message: 'fatal: not a git repository (or any of the parent directories)',
  },
];

const LEVEL_TONE: Record<FakeLogLine['level'], string> = {
  INFO: 'bg-primary/15 text-primary border-primary/30',
  WARN: 'bg-status-warning-bg text-status-warning border-status-warning/30',
  ERROR: 'bg-status-error-bg/50 text-status-error border-status-error/30',
};

/**
 * Static log-tail mock that previews the kind of structured output the
 * user sees inside the Log Viewer modal — timestamp, colored level chip,
 * scope label, and message. Static-only on purpose: the Diagnostics card
 * doesn't subscribe to live logs and we don't want to start now.
 */
export function DiagnosticsPreview() {
  return (
    <div className="rounded-lg border border-border-glass bg-[#0e0f12] p-3 font-mono text-[11px] leading-relaxed">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-semibold">
          Sample log tail
        </span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-1.5 rounded-full bg-status-error/60" />
          <span className="size-1.5 rounded-full bg-status-warning/60" />
          <span className="size-1.5 rounded-full bg-status-success/60" />
        </span>
      </div>
      <div className="space-y-1">
        {LINES.map((line, idx) => (
          <div key={idx} className="flex items-start gap-2 min-w-0">
            <span className="text-muted-foreground/60 tabular-nums shrink-0">{line.ts}</span>
            <span
              className={cn(
                'inline-flex items-center justify-center rounded border px-1 py-px text-[9px] font-bold tracking-wider shrink-0',
                LEVEL_TONE[line.level]
              )}
              style={{ minWidth: 38 }}
            >
              {line.level}
            </span>
            <span className="text-muted-foreground/80 shrink-0">[{line.scope}]</span>
            <span className="text-foreground/90 truncate">{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
