import { IS_MAC, IS_WINDOWS, IS_LINUX } from '@/lib/platform';

interface SplashFooterProps {
  variant: 'loading' | 'updating' | 'error';
  statusText: string;
  version: string;
  show: boolean;
  onRetry?: () => void;
  onClose?: () => void;
}

function platformLabel(): string {
  if (IS_MAC) return 'macOS';
  if (IS_WINDOWS) return 'Windows';
  if (IS_LINUX) return 'Linux';
  return 'desktop';
}

/**
 * Bottom hud row — status dot + prose on the left, version meta on the right.
 *
 * In the `error` variant the prose is replaced by Retry + Close pill buttons.
 * Retry has `autoFocus` so screen reader users land on the recovery action,
 * and Close goes through the existing `electronAPI.window.close` IPC rather
 * than raw `window.close()` (the renderer may block raw close calls).
 */
export function SplashFooter({
  variant,
  statusText,
  version,
  show,
  onRetry,
  onClose,
}: SplashFooterProps) {
  const dotTone =
    variant === 'error' ? 'destructive' : variant === 'updating' ? 'accent' : 'primary';

  const prose =
    variant === 'updating'
      ? 'applying update — do not close'
      : variant === 'error'
        ? 'unable to reach backend'
        : statusText;

  const meta = [version ? `v${version}` : null, platformLabel()].filter(Boolean).join(' · ');

  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        width: 'min(440px, 86vw)',
        opacity: show ? 1 : 0,
        transition: 'opacity 400ms ease-in 100ms',
      }}
    >
      {variant === 'error' ? (
        <div className="flex items-center gap-2 no-drag">
          <button
            type="button"
            autoFocus
            onClick={onRetry}
            className="rounded-full px-3 py-1 transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              background: 'oklch(from var(--primary) l c h / 0.18)',
              color: 'var(--primary)',
              border: '1px solid oklch(from var(--primary) l c h / 0.35)',
            }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              background: 'transparent',
              color: 'var(--foreground-muted)',
              border: '1px solid oklch(from var(--border) l c h / 0.7)',
            }}
          >
            Close
          </button>
          <span
            className="ml-3 text-foreground-muted"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
            }}
          >
            {prose}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="omniscribe-anim-blink"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: `var(--${dotTone})`,
              boxShadow: `0 0 8px oklch(from var(--${dotTone}) l c h / 0.65)`,
              animation: 'omniscribe-dot-blink 1400ms ease-in-out infinite',
            }}
          />
          <span
            className="truncate text-foreground-muted"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
            }}
          >
            {prose}
          </span>
        </div>
      )}

      <span
        className="text-foreground-muted shrink-0"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6875rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {meta}
      </span>
    </div>
  );
}
