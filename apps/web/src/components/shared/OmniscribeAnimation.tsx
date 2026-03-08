import { useId } from 'react';
import { cn } from '@/lib/utils';

interface OmniscribeAnimationProps {
  className?: string;
  size?: number;
  reduceMotion?: boolean;
}

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
  const uid = useId().replace(/:/g, '');
  const glow = `oa-glow-${uid}`;
  const soft = `oa-soft-${uid}`;

  // Elliptical orbit path centered at (50,50), rx=38, ry=14
  const orbitPath = 'M 12,50 A 38,14 0 1,0 88,50 A 38,14 0 1,0 12,50';

  const orbits = [
    { rotation: 0, dur: '7s', r: 3, opacity: 0.9 },
    { rotation: 60, dur: '9s', r: 2.5, opacity: 0.7 },
    { rotation: -60, dur: '11s', r: 2, opacity: 0.55 },
  ];

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('text-primary', className)}
      fill="none"
      role="img"
      aria-label="Omniscribe"
    >
      <defs>
        <filter id={glow}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={soft}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Orbit rings */}
      {orbits.map(({ rotation }) => (
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
          transform={rotation ? `rotate(${rotation} 50 50)` : undefined}
        />
      ))}

      {/* Orbiting nodes */}
      {orbits.map(({ rotation, dur, r, opacity }) => {
        const wrapper = (children: React.ReactNode) =>
          rotation ? (
            <g key={rotation} transform={`rotate(${rotation} 50 50)`}>
              {children}
            </g>
          ) : (
            <g key={rotation}>{children}</g>
          );

        return wrapper(
          reduceMotion ? (
            <circle
              cx="88"
              cy="50"
              r={r}
              fill="currentColor"
              fillOpacity={opacity}
              filter={`url(#${soft})`}
            />
          ) : (
            <circle r={r} fill="currentColor" fillOpacity={opacity} filter={`url(#${soft})`}>
              <animateMotion dur={dur} repeatCount="indefinite" path={orbitPath} />
            </circle>
          )
        );
      })}

      {/* Central hub — outer halo */}
      <circle cx="50" cy="50" r="7" fill="currentColor" fillOpacity="0.08" />

      {/* Central hub — core */}
      {reduceMotion ? (
        <circle
          cx="50"
          cy="50"
          r="4"
          fill="currentColor"
          fillOpacity="0.85"
          filter={`url(#${glow})`}
        />
      ) : (
        <circle cx="50" cy="50" r="4" fill="currentColor" filter={`url(#${glow})`}>
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
