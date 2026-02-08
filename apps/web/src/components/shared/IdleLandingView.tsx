import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BrainCircuit, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { getGreeting } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';

interface IdleLandingViewProps {
  onAddSession: () => void;
  onOpenLaunchModal?: () => void;
  className?: string;
}

export function IdleLandingView({
  onAddSession,
  onOpenLaunchModal,
  className,
}: IdleLandingViewProps) {
  const greeting = useMemo(() => getGreeting(), []);

  // Keyboard shortcuts (N, Shift+N) are handled globally by useAppKeyboardShortcuts

  // Primary CTA: open modal if available, otherwise add single session
  const handlePrimaryCTA = onOpenLaunchModal ?? onAddSession;

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
          'bg-background/95 backdrop-blur-xl',
          'border border-border',
          'shadow-2xl'
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
            <BrainCircuit size={48} className="text-primary" strokeWidth={1.5} />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-lg font-medium text-foreground mb-2">No Active Sessions</h2>
        <p className="text-sm text-foreground-secondary mb-8 text-center max-w-xs">
          Add sessions to start orchestrating your AI coding assistants
        </p>

        {/* Add session button - opens modal as primary action */}
        <Button
          onClick={handlePrimaryCTA}
          type="button"
          size={'icon'}
          aria-label="Set up sessions"
          className="group"
        >
          <Plus
            className="text-white group-hover:rotate-90 transition-transform duration-200"
            strokeWidth={2}
          />
        </Button>

        {/* Keyboard shortcut hint */}
        <p className="mt-6 text-xs text-muted-foreground">
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-foreground-secondary">
            Shift+N
          </kbd>{' '}
          to set up sessions or{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-foreground-secondary">
            N
          </kbd>{' '}
          to add one
        </p>
      </div>
    </div>
  );
}
