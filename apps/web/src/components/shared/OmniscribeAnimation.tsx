import { useId } from 'react';
import { cn } from '@/lib/utils';

interface OmniscribeAnimationProps {
  className?: string;
  size?: number;
  reduceMotion?: boolean;
}

// Elliptical orbit path centered at (50,50), rx=38, ry=14
const ORBIT_PATH = 'M 12,50 A 38,14 0 1,0 88,50 A 38,14 0 1,0 12,50';

const ORBITS = [
  { rotation: 0, dur: '7s', r: 3, opacity: 0.9 },
  { rotation: 60, dur: '9s', r: 2.5, opacity: 0.7 },
  { rotation: -60, dur: '11s', r: 2, opacity: 0.55 },
] as const;

/**
 * Animated SVG icon representing Omniscribe's orchestration concept.
 * Three tilted elliptical orbits with glowing dots circling a central hub —
 * like an atom or gyroscope, symbolizing parallel AI session orchestration.
 */
export function OmniscribeAnimation({
  className,
  size = 96,
  reduceMotion = false,
}: OmniscribeAnimationProps) {
  const glowFilterId = useId();
  const softFilterId = useId();

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('text-primary', className)}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={glowFilterId}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={softFilterId}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Orbit rings */}
      {ORBITS.map(({ rotation }) => (
        <ellipse
          key={rotation}
          cx="50"
          cy="50"
          rx="38"
          ry="14"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="0.7"
          strokeDasharray="4 3"
          transform={rotation !== 0 ? `rotate(${rotation} 50 50)` : undefined}
        />
      ))}

      {/* Orbiting nodes */}
      {ORBITS.map(({ rotation, dur, r, opacity }) => (
        <g key={rotation} transform={rotation !== 0 ? `rotate(${rotation} 50 50)` : undefined}>
          {reduceMotion ? (
            <circle
              cx="88"
              cy="50"
              r={r}
              fill="currentColor"
              fillOpacity={opacity}
              filter={`url(#${softFilterId})`}
            />
          ) : (
            <circle
              r={r}
              fill="currentColor"
              fillOpacity={opacity}
              filter={`url(#${softFilterId})`}
            >
              <animateMotion dur={dur} repeatCount="indefinite" path={ORBIT_PATH} />
            </circle>
          )}
        </g>
      ))}

      {/* Central hub — outer halo */}
      <circle cx="50" cy="50" r="7" fill="currentColor" fillOpacity="0.08" />

      {/* Central hub — core */}
      {reduceMotion ? (
        <circle
          cx="50"
          cy="50"
          r="3.5"
          fill="currentColor"
          fillOpacity="0.85"
          filter={`url(#${glowFilterId})`}
        />
      ) : (
        <circle cx="50" cy="50" r="3.5" fill="currentColor" filter={`url(#${glowFilterId})`}>
          <animate attributeName="r" values="3.5;5;3.5" dur="3s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.7;1;0.7"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}
