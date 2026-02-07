import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSplashScreen } from '@/hooks/useSplashScreen';

/**
 * Full-screen branded splash overlay displayed during app initialization.
 *
 * Covers the entire viewport while the backend WebSocket connects and
 * workspace state hydrates. Fades out with a subtle scale-up animation
 * once the app is ready (or after a 10s safety timeout).
 */
export function SplashScreen() {
  const { isVisible, isDismissing, showSpinner, statusText, version, isDarkTheme } =
    useSplashScreen();

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center',
        isDarkTheme
          ? 'bg-gradient-to-br from-[#0a0a0f] via-[#0a0a0f] to-[#1a1a2e]'
          : 'bg-gradient-to-br from-[#fafafa] via-[#ffffff] to-[#f0f0ff]'
      )}
      style={{
        opacity: isDismissing ? 0 : 1,
        transform: isDismissing ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 500ms ease-out, transform 500ms ease-out',
      }}
    >
      {/* Logo */}
      <img src="/logo.png" alt="Omniscribe" className="h-24 w-24" draggable={false} />

      {/* Milestone label */}
      <span
        className={cn(
          'mt-3 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase select-none',
          isDarkTheme
            ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20'
            : 'bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20'
        )}
      >
        v0.4.0 milestone
      </span>

      {/* Spinner + status text container */}
      <div
        className="mt-8 flex flex-col items-center gap-3"
        style={{
          opacity: showSpinner ? 1 : 0,
          transition: 'opacity 300ms ease-in',
        }}
      >
        <Loader2
          className={cn(
            'h-5 w-5 animate-spin',
            isDarkTheme ? 'text-indigo-400' : 'text-indigo-500'
          )}
        />
        <p className={cn('text-sm select-none', isDarkTheme ? 'text-zinc-500' : 'text-zinc-400')}>
          {statusText}
        </p>
      </div>

      {/* Version (bottom-right) */}
      {version && (
        <div
          className={cn(
            'absolute bottom-4 right-4 text-xs select-none',
            isDarkTheme ? 'text-zinc-600' : 'text-zinc-400'
          )}
        >
          v{version}
        </div>
      )}
    </div>
  );
}
