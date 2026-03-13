import { cn } from '@/lib/utils';
import { BrainCircuit, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { getGreeting } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { motion, useReducedMotion } from 'motion/react';
import { transitions } from '@/lib/animations';

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
  const reduceMotion = useReducedMotion();

  // Keyboard shortcuts (N, Shift+N) are handled globally by useAppKeyboardShortcuts

  // Primary CTA: open modal if available, otherwise add single session
  const handlePrimaryCTA = onOpenLaunchModal ?? onAddSession;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'bg-background relative overflow-hidden',
        className
      )}
    >
      {/* Card */}
      <motion.div
        className={cn(
          'relative flex flex-col items-center',
          'px-12 py-10 rounded-2xl',
          'bg-card',
          'border border-border',
          'shadow-sm'
        )}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? transitions.instant : transitions.spring}
      >
        {/* Greeting */}
        <p className="text-sm text-foreground-secondary mb-6 text-center">{greeting}</p>

        {/* Icon */}
        <div className="mb-6">
          <div
            className={cn(
              'w-24 h-24 rounded-full',
              'bg-primary/10',
              'flex items-center justify-center'
            )}
          >
            <BrainCircuit size={48} className="text-primary" strokeWidth={1.5} />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-lg font-medium text-foreground mb-2 text-center">No Active Sessions</h2>
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
            className="text-primary-foreground group-hover:rotate-90 transition-transform duration-200"
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
      </motion.div>
    </div>
  );
}
