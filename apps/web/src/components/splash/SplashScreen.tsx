import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { useSplashScreen } from '@/hooks/useSplashScreen';

/**
 * Full-screen branded splash overlay displayed during app initialization.
 *
 * Covers the entire viewport while the backend WebSocket connects and
 * workspace state hydrates. Fades out with a subtle scale-up animation
 * once the app is ready (or after a 10s safety timeout).
 */
export function SplashScreen() {
  const { isVisible, isDismissing, showSpinner, statusText, version } = useSplashScreen();

  if (!isVisible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-background"
      animate={isDismissing ? { opacity: 0, scale: 1.02 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Logo: prefer the 36 KB WebP, fall back to the 165 KB PNG.
          Electron always supports WebP so the fallback is for safety,
          not parity. */}
      <picture>
        <source srcSet={`${import.meta.env.BASE_URL}logo.webp`} type="image/webp" />
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Omniscribe"
          className="h-24 w-24"
          draggable={false}
        />
      </picture>

      {/* Version label */}
      {version && (
        <span className="mt-3 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide select-none bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
          v{version}
        </span>
      )}

      {/* Spinner + status text container */}
      <div
        className="mt-8 flex flex-col items-center gap-3"
        style={{
          opacity: showSpinner ? 1 : 0,
          transition: 'opacity 300ms ease-in',
        }}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-brand-400" />
        <p className="text-sm select-none text-foreground-muted">{statusText}</p>
      </div>
    </motion.div>
  );
}
