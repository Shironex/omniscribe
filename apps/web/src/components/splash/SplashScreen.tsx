import { motion } from 'motion/react';
import { useSplashScreen } from '@/hooks/useSplashScreen';
import { SplashThreads } from './SplashThreads';
import { SplashEmber } from './SplashEmber';
import { SplashWordmark } from './SplashWordmark';
import { SplashBootTrace } from './SplashBootTrace';
import { SplashFooter } from './SplashFooter';

/**
 * Full-screen branded splash overlay — "Constellation".
 *
 * Many faint signal-threads streak inward from the edges and converge on a
 * single steady ember at the center. The lower portion shows a real
 * stepwise boot trace (backend → socket → workspace) flipping `wait → running
 * → done` from honest readiness signals.
 *
 * Variants:
 *  - `loading`  — the default. Auto-dismisses once the app is ready.
 *  - `updating` — auto-updater is downloading or ready to install. Splash
 *                  stays up; the installer is about to tear down the renderer.
 *  - `error`    — connection failed or the safety net tripped. Splash stays
 *                  up with Retry + Close affordances.
 *
 * Theme-aware throughout: every color sources from CSS custom properties or
 * `oklch(from var(...))` derivations. The splash looks distinctly different
 * in Forge (warm ember), Nord (cool frost), Paper (terracotta), etc.
 */
export function SplashScreen() {
  const { isVisible, isDismissing, showSpinner, statusText, version, variant, steps, error } =
    useSplashScreen();

  if (!isVisible) return null;

  const handleRetry = () => {
    window.location.reload();
  };

  const handleClose = () => {
    // Use the existing window-controls IPC rather than raw window.close() —
    // the renderer may block direct close calls in some Electron contexts.
    window.electronAPI?.window?.close?.();
  };

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-busy={variant !== 'error'}
      aria-label={
        variant === 'error'
          ? (error ?? 'Omniscribe failed to start')
          : variant === 'updating'
            ? 'Omniscribe is installing an update'
            : 'Omniscribe is starting'
      }
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{
        background: 'var(--background)',
      }}
      animate={isDismissing ? { opacity: 0, scale: 1.02 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Drag region — top 32px lets the user move the frameless window. */}
      <div
        className="absolute inset-x-0 top-0 drag"
        style={{ height: 32, WebkitAppRegion: 'drag' } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Dual radial vignette — gives the plate depth without an image. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 45% at 50% 28%, oklch(from var(--primary) l c h / 0.12) 0%, transparent 70%),
            radial-gradient(ellipse 55% 50% at 78% 78%, oklch(from var(--accent) l c h / 0.08) 0%, transparent 75%),
            radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, oklch(from var(--background) calc(l - 0.04) c h / 0.6) 100%)
          `,
        }}
      />

      {/* Threads field — converging on the ember. Decorative. */}
      <SplashThreads variant={variant} />

      {/* Watermark glyph: "◎" (concentric — observation glyph) at low opacity.
          NOT the kanji idiom (belongs to shiroani/moekoder), NOT the bitmap
          logo (the wordmark replaces it on this design), NOT empty. */}
      <span
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{
          right: '4%',
          bottom: '6%',
          fontSize: 320,
          lineHeight: 1,
          fontFamily: 'var(--font-mono)',
          color: 'oklch(from var(--foreground) l c h / 0.035)',
          fontWeight: 200,
        }}
      >
        ◎
      </span>

      {/* Stage — centered column with ember + wordmark, then boot trace. */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center gap-10 px-6 pt-10 pb-14">
        <div className="flex flex-col items-center gap-7">
          <SplashEmber variant={variant} />
          <SplashWordmark variant={variant} version={version} />
        </div>

        {variant === 'updating' ? (
          <UpdatingPanel />
        ) : (
          <SplashBootTrace steps={steps} variant={variant} />
        )}
      </div>

      {/* Footer — anchored bottom. Hidden in the first 500ms (SPINNER_DELAY_MS)
          to avoid flicker on instant loads. */}
      <div className="absolute inset-x-0 bottom-5 flex justify-center px-6">
        <SplashFooter
          variant={variant}
          statusText={statusText}
          version={version}
          show={showSpinner}
          onRetry={handleRetry}
          onClose={handleClose}
        />
      </div>
    </motion.div>
  );
}

/**
 * Single-line panel shown during the `updating` variant in place of the boot
 * trace. The auto-updater is about to tear down the renderer; the user just
 * needs reassurance that the spinner means something is happening.
 */
function UpdatingPanel() {
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
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--accent)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 14,
            textAlign: 'center',
            color: 'var(--accent)',
            animation: 'omniscribe-row-dot-pulse 1400ms ease-in-out infinite',
          }}
        >
          ▸
        </span>
        <span className="truncate">applying update — do not close</span>
      </div>
      <div
        aria-hidden="true"
        style={{
          height: 2,
          background:
            'linear-gradient(90deg, transparent 0%, oklch(from var(--accent) l c h / 0.55) 50%, transparent 100%)',
          backgroundSize: '40% 100%',
          backgroundRepeat: 'no-repeat',
          animation: 'omniscribe-track-slide 1600ms linear infinite',
        }}
      />
    </div>
  );
}
