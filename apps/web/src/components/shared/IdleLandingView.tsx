import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { OmniscribeAnimation } from './OmniscribeAnimation';
import { getGreeting } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { motion, useReducedMotion } from 'motion/react';
import { animationVariants, transitions } from '@/lib/animations';

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
      {/* Background gradient blobs for glassmorphism effect - uses theme colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={cn(
            'absolute top-1/4 -left-20 w-72 h-72 bg-primary/30 rounded-full blur-[100px]',
            !reduceMotion && 'animate-blob-drift-1'
          )}
        />
        <div
          className={cn(
            'absolute bottom-1/4 -right-20 w-80 h-80 bg-brand-600/25 rounded-full blur-[120px]',
            !reduceMotion && 'animate-blob-drift-2'
          )}
        />
        <div
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-400/15 rounded-full blur-[100px]',
            !reduceMotion && 'animate-blob-drift-3'
          )}
        />
      </div>

      {/* Glassmorphism card */}
      <motion.div
        className={cn(
          'relative flex flex-col items-center',
          'px-12 py-10 rounded-2xl',
          'bg-card/60 backdrop-blur-2xl',
          'border border-border-glass',
          'shadow-2xl shadow-black/25'
        )}
        initial="initial"
        animate="animate"
        transition={{ staggerChildren: 0.1 }}
      >
        {/* Greeting */}
        <motion.div variants={animationVariants.slideUp} transition={transitions.spring}>
          <p className="text-sm text-foreground-secondary mb-6 text-center">{greeting}</p>
        </motion.div>

        {/* Animated orchestration icon */}
        <motion.div
          className="mb-6"
          variants={animationVariants.slideUp}
          transition={transitions.spring}
        >
          <OmniscribeAnimation size={96} reduceMotion={!!reduceMotion} />
        </motion.div>

        {/* Text */}
        <motion.div variants={animationVariants.slideUp} transition={transitions.spring}>
          <h2 className="text-lg font-medium text-foreground mb-2 text-center">
            No Active Sessions
          </h2>
          <p className="text-sm text-foreground-secondary mb-8 text-center max-w-xs">
            Add sessions to start orchestrating your AI coding assistants
          </p>
        </motion.div>

        {/* Add session button - opens modal as primary action */}
        <motion.div variants={animationVariants.slideUp} transition={transitions.spring}>
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
        </motion.div>

        {/* Keyboard shortcut hint */}
        <motion.div variants={animationVariants.slideUp} transition={transitions.spring}>
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
      </motion.div>
    </div>
  );
}
