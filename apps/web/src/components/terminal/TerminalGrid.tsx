import { useMemo } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Plus } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { TerminalHeader } from './TerminalHeader';
import type { TerminalSession } from './TerminalHeader';
import { PreLaunchCard, PreLaunchSlot } from './PreLaunchCard';
import { IdleLandingView } from '../shared/IdleLandingView';
import { Branch } from '../shared/BranchSelector';

interface TerminalGridProps {
  sessions: TerminalSession[];
  preLaunchSlots: PreLaunchSlot[];
  branches: Branch[];
  focusedSessionId: string | null;
  onFocusSession: (sessionId: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlot: (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => void;
  onLaunch: (slotId: string) => void;
  onKill: (sessionId: string) => void;
  onSessionClose?: (sessionId: string, exitCode: number) => void;
  className?: string;
}

export function TerminalGrid({
  sessions,
  preLaunchSlots,
  branches,
  focusedSessionId,
  onFocusSession,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
  onKill,
  onSessionClose,
  className,
}: TerminalGridProps) {
  // Total number of cells (sessions + pre-launch slots)
  const totalCells = sessions.length + preLaunchSlots.length;

  // Determine grid layout based on total cells
  const gridClasses = useMemo(() => {
    switch (totalCells) {
      case 0:
        return '';
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-3';
      case 4:
        return 'grid-cols-2 grid-rows-2';
      case 5:
      case 6:
      default:
        return 'grid-cols-3 grid-rows-2';
    }
  }, [totalCells]);

  // Empty state
  if (totalCells === 0) {
    return <IdleLandingView onAddSession={onAddSlot} className={className} />;
  }

  // Can add more slots (max 6)
  const canAddMore = totalCells < 6;

  return (
    <div
      className={twMerge(
        clsx('h-full w-full grid gap-2 p-2', gridClasses, className)
      )}
    >
      {/* Render active sessions */}
      {sessions.map((session) => (
        <div
          key={session.id}
          className={clsx(
            'flex flex-col rounded-lg overflow-hidden',
            'border border-border',
            'bg-card',
            focusedSessionId === session.id && 'ring-2 ring-primary',
            'transition-all duration-150'
          )}
          onClick={() => onFocusSession(session.id)}
        >
          {/* Header */}
          <TerminalHeader
            session={session}
            onClose={() => onKill(session.id)}
          />

          {/* Terminal - only render if terminalSessionId is available */}
          <div className="flex-1 min-h-0">
            {session.terminalSessionId !== undefined ? (
              <TerminalView
                sessionId={session.terminalSessionId}
                isFocused={focusedSessionId === session.id}
                onClose={(exitCode) => onSessionClose?.(session.id, exitCode)}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-muted text-muted-foreground text-sm">
                Connecting to terminal...
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Render pre-launch slots */}
      {preLaunchSlots.map((slot) => (
        <PreLaunchCard
          key={slot.id}
          slot={slot}
          branches={branches}
          onUpdate={onUpdateSlot}
          onLaunch={onLaunch}
          onRemove={onRemoveSlot}
        />
      ))}

      {/* Add session cell (if room available and we have at least one cell) */}
      {canAddMore && totalCells > 0 && (
        <button
          onClick={onAddSlot}
          className={clsx(
            'flex flex-col items-center justify-center',
            'rounded-lg border-2 border-dashed border-border',
            'bg-card/30 hover:bg-card/50',
            'text-muted-foreground hover:text-foreground-secondary',
            'transition-all duration-150',
            'hover:border-primary/50',
            'group'
          )}
          aria-label="Add session"
        >
          <div
            className={clsx(
              'w-12 h-12 rounded-full',
              'bg-card group-hover:bg-border',
              'flex items-center justify-center',
              'transition-colors'
            )}
          >
            <Plus size={24} className="group-hover:text-primary transition-colors" />
          </div>
          <span className="mt-2 text-sm">Add Session</span>
        </button>
      )}
    </div>
  );
}

// Re-export types for convenience
export type { TerminalSession, AIMode } from './TerminalHeader';
export type { PreLaunchSlot, AIMode as PreLaunchAIMode } from './PreLaunchCard';
