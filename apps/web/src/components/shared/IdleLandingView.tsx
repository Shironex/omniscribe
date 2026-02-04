import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BrainCircuit, Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';

interface IdleLandingViewProps {
  onAddSession: () => void;
  className?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function IdleLandingView({ onAddSession, className }: IdleLandingViewProps) {
  const greeting = useMemo(() => getGreeting(), []);

  // Handle "N" keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea or if modifier keys are pressed
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onAddSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAddSession]);

  return (
    <div
      className={twMerge(
        clsx(
          'flex flex-col items-center justify-center h-full w-full',
          'bg-background relative overflow-hidden',
          className
        )
      )}
    >
      {/* Background gradient blobs for glassmorphism effect - uses theme colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-brand-600/25 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-400/15 rounded-full blur-[100px]" />
      </div>

      {/* Glassmorphism card */}
      <div
        className={clsx(
          'relative flex flex-col items-center',
          'px-12 py-10 rounded-2xl',
          'bg-white/[0.08] backdrop-blur-2xl',
          'border border-white/[0.15]',
          'shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
        )}
      >
        {/* Greeting */}
        <p className="text-sm text-foreground-secondary mb-6">{greeting}</p>

        {/* Icon */}
        <div className="mb-6">
          <div
            className={clsx(
              'w-24 h-24 rounded-full',
              'bg-gradient-to-br from-primary/20 to-brand-600/20',
              'flex items-center justify-center'
            )}
          >
            <BrainCircuit
              size={48}
              className="text-primary"
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-lg font-medium text-foreground mb-2">
          No Active Sessions
        </h2>
        <p className="text-sm text-foreground-secondary mb-8 text-center max-w-xs">
          Add sessions to start orchestrating your AI coding assistants
        </p>

        {/* Add session button */}
        <button
          onClick={onAddSession}
          className={clsx(
            'w-16 h-16 rounded-full',
            'bg-gradient-to-br from-primary to-brand-600',
            'flex items-center justify-center',
            'shadow-lg shadow-primary/25',
            'hover:shadow-xl hover:shadow-primary/30',
            'hover:scale-105 active:scale-95',
            'transition-all duration-200',
            'group'
          )}
          aria-label="Add session"
        >
          <Plus
            size={32}
            className="text-white group-hover:rotate-90 transition-transform duration-200"
            strokeWidth={2}
          />
        </button>

        {/* Keyboard shortcut hint */}
        <p className="mt-6 text-xs text-muted-foreground">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 font-mono text-foreground-secondary">N</kbd> to add a session
        </p>
      </div>
    </div>
  );
}
