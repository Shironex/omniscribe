import type { SplashStep, SplashStepStatus } from '@/hooks/useSplashScreen';

interface SplashBootTraceProps {
  steps: SplashStep[];
  variant: 'loading' | 'updating' | 'error';
}

const STATUS_LABEL: Record<SplashStepStatus, string> = {
  wait: 'wait',
  running: 'running',
  done: 'done',
  error: 'failed',
};

function rowColor(status: SplashStepStatus): string {
  switch (status) {
    case 'done':
      return 'var(--status-success)';
    case 'running':
      return 'var(--primary)';
    case 'error':
      return 'var(--destructive)';
    case 'wait':
    default:
      return 'var(--foreground-muted)';
  }
}

function rowOpacity(status: SplashStepStatus): number {
  return status === 'wait' ? 0.45 : 1;
}

function rowGlyph(status: SplashStepStatus): string {
  switch (status) {
    case 'done':
      return '✓';
    case 'running':
      return '▸';
    case 'error':
      return '✗';
    case 'wait':
    default:
      return '◦';
  }
}

/**
 * Stepwise boot-trace card — three real readiness rows, each flipping from
 * `wait → running → done` (or `error`) as the corresponding store signal
 * transitions. The indeterminate sweep underneath is the "still alive" cue
 * (the moekoder track-slide trick, theme-tinted from `--primary`).
 *
 * Rationale for the row count: see `SplashStepId` doc — we ship 3 rows.
 */
export function SplashBootTrace({ steps, variant }: SplashBootTraceProps) {
  const sweepTone =
    variant === 'updating' ? 'accent' : variant === 'error' ? 'destructive' : 'primary';

  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{
        width: 'min(440px, 86vw)',
        background: 'oklch(from var(--card) l c h / 0.6)',
        borderColor: 'oklch(from var(--border) l c h / 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'omniscribe-fade-up-soft 500ms ease-out 600ms both',
      }}
    >
      <ul role="list" className="px-4 py-3 flex flex-col gap-1.5">
        {steps.map(step => {
          const isRunning = step.status === 'running';
          const color = rowColor(step.status);
          return (
            <li
              key={step.id}
              aria-current={isRunning ? 'step' : undefined}
              className="flex items-center justify-between gap-3"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color,
                opacity: rowOpacity(step.status),
                transition: 'color 240ms ease-out, opacity 240ms ease-out',
              }}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden="true"
                  className={isRunning ? 'omniscribe-anim-row-pulse' : ''}
                  style={{
                    display: 'inline-block',
                    width: 14,
                    textAlign: 'center',
                    color,
                    animation: isRunning
                      ? 'omniscribe-row-dot-pulse 1400ms ease-in-out infinite'
                      : undefined,
                  }}
                >
                  {rowGlyph(step.status)}
                </span>
                <span className="truncate">{step.label}</span>
              </span>
              <span
                style={{
                  fontSize: '0.625rem',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color,
                }}
              >
                {STATUS_LABEL[step.status]}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Indeterminate sweep — kills itself in error so the failure feels final. */}
      <div
        aria-hidden="true"
        style={{
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, oklch(from var(--${sweepTone}) l c h / 0.55) 50%, transparent 100%)`,
          backgroundSize: '40% 100%',
          backgroundRepeat: 'no-repeat',
          animation:
            variant === 'error' ? undefined : 'omniscribe-track-slide 1600ms linear infinite',
        }}
        className={variant === 'error' ? '' : 'omniscribe-anim-track'}
      />
    </div>
  );
}
