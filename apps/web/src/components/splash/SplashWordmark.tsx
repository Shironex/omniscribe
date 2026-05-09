import { IS_MAC, IS_WINDOWS, IS_LINUX } from '@/lib/platform';

interface SplashWordmarkProps {
  variant: 'loading' | 'updating' | 'error';
  version: string;
}

function platformLabel(): string {
  if (IS_MAC) return 'macOS';
  if (IS_WINDOWS) return 'Windows';
  if (IS_LINUX) return 'Linux';
  return 'desktop';
}

/**
 * "omniscribe" wordmark + sub-tagline.
 *
 * Lowercase wordmark — picked over the split-weight `OMNIscribe` for the
 * humble unix-tool feel. The sub-tagline is the moekoder typography idiom
 * (font-mono small caps with wide tracking) carrying:
 *
 *   ORCHESTRATOR · v0.4.2 · macOS
 *
 * The sidebar uses mixed-case "Omniscribe" 13px medium, which has a different
 * rhythm — no conflict.
 */
export function SplashWordmark({ variant, version }: SplashWordmarkProps) {
  const label =
    variant === 'updating' ? 'INSTALLING' : variant === 'error' ? 'STALLED' : 'ORCHESTRATOR';

  // Build the meta line. In dev the version may be empty — drop the segment
  // entirely rather than render `· v ·`.
  const segments = [label];
  if (version) segments.push(`v${version}`);
  segments.push(platformLabel());

  return (
    <div
      className="flex flex-col items-center gap-2 select-none"
      style={{
        animation: 'omniscribe-fade-up 600ms ease-out 200ms both',
      }}
    >
      <span
        className="text-foreground"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '2.2rem',
          fontWeight: 300,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        omniscribe
      </span>
      <span
        className="text-foreground-muted"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.625rem',
          textTransform: 'uppercase',
          letterSpacing: '0.22em',
          fontVariantCaps: 'all-small-caps',
        }}
      >
        {segments.join(' · ')}
      </span>
    </div>
  );
}
