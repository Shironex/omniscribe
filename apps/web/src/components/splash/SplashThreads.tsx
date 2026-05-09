import { useMemo } from 'react';

interface SplashThreadsProps {
  /** Visual variant — drives palette */
  variant: 'loading' | 'updating' | 'error';
  /** True once entrance choreography has finished — flips on the "snap" */
  hasArrived?: boolean;
}

const THREAD_COUNT = 28;
const ACCENT_RATIO = 0.22;
const STAGGER_MS = 18;
const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;

/**
 * Deterministic LCG seeded with a constant so StrictMode double-renders + HMR
 * never reshuffle the thread layout. Each thread gets a stable angle and
 * a small jitter so the field doesn't look mathematically uniform.
 */
function seededLayout(): { x1: number; y1: number; isAccent: boolean; phase: number }[] {
  let s = 0x9e3779b1;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  const items: { x1: number; y1: number; isAccent: boolean; phase: number }[] = [];
  for (let i = 0; i < THREAD_COUNT; i++) {
    // Even angular distribution + small jitter
    const baseAngle = (i / THREAD_COUNT) * Math.PI * 2;
    const jitter = (next() - 0.5) * 0.18;
    const angle = baseAngle + jitter;

    // Push the origin slightly past the corner box so threads start off-screen
    const radius = VIEWBOX * 0.62 + next() * VIEWBOX * 0.08;
    const x1 = CENTER + Math.cos(angle) * radius;
    const y1 = CENTER + Math.sin(angle) * radius;

    items.push({
      x1,
      y1,
      isAccent: next() < ACCENT_RATIO,
      phase: next(),
    });
  }
  return items;
}

/**
 * Decorative SVG of N thin lines streaking from the edges toward a single
 * convergence point — the visual model of "many sessions converging into
 * one observable surface".
 *
 * Theme-aware: stroke colors are derived from `var(--primary)` and
 * `var(--accent)` via `oklch(from ...)` so the field recolors with the
 * active theme.
 *
 * Decorative — `aria-hidden`. The accessible label lives on the splash root.
 */
export function SplashThreads({ variant, hasArrived = false }: SplashThreadsProps) {
  const threads = useMemo(seededLayout, []);

  const primaryColor =
    variant === 'error'
      ? 'oklch(from var(--destructive) l c h / 0.18)'
      : variant === 'updating'
        ? 'oklch(from var(--accent) l c h / 0.2)'
        : 'oklch(from var(--primary) l c h / 0.18)';

  const accentColor =
    variant === 'error'
      ? 'oklch(from var(--destructive) l c h / 0.1)'
      : variant === 'updating'
        ? 'oklch(from var(--primary) l c h / 0.14)'
        : 'oklch(from var(--accent) l c h / 0.16)';

  return (
    <svg
      aria-hidden="true"
      role="presentation"
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      {threads.map((t, i) => {
        const dx = CENTER - t.x1;
        const dy = CENTER - t.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const stroke = t.isAccent ? accentColor : primaryColor;
        const dashArray = len;

        // Entrance: each thread draws inward with a staggered delay.
        // Idle: a slow shimmer travels along the dashed pattern, with a
        // negative animation-delay seeded from `t.phase` so threads don't
        // pulse in lockstep.
        const drawDelay = i * STAGGER_MS;
        const shimmerDuration = 6000;
        const shimmerDelay = Math.round(-t.phase * shimmerDuration);

        return (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={CENTER}
            y2={CENTER}
            stroke={stroke}
            strokeWidth={t.isAccent ? 1.4 : 1}
            strokeLinecap="round"
            style={
              {
                strokeDasharray: `${len} ${len}`,
                strokeDashoffset: 0,
                opacity: hasArrived && variant === 'loading' ? 1 : undefined,
                ['--thread-len' as string]: `${dashArray}`,
                ['--thread-target-opacity' as string]: t.isAccent ? '0.9' : '0.75',
                animation: `omniscribe-thread-draw 380ms ease-out ${drawDelay}ms both, omniscribe-thread-shimmer ${shimmerDuration}ms linear ${drawDelay + 400 + shimmerDelay}ms infinite`,
              } as React.CSSProperties
            }
            className={variant === 'error' ? '' : 'omniscribe-anim-shimmer'}
          />
        );
      })}
    </svg>
  );
}
