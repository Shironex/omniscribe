import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BrainCircuit, Plus } from 'lucide-react';

interface IdleLandingViewProps {
  onAddSession: () => void;
  className?: string;
}

export function IdleLandingView({ onAddSession, className }: IdleLandingViewProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'flex flex-col items-center justify-center h-full w-full',
          'bg-background',
          className
        )
      )}
    >
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
        Select a directory and add sessions to start orchestrating your AI coding assistants
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

      <p className="mt-4 text-xs text-muted-foreground">
        Click to add your first session
      </p>
    </div>
  );
}
