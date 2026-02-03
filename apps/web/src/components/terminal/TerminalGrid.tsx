import { useMemo } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Plus } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { TerminalHeader } from './TerminalHeader';
import type { TerminalSession } from './TerminalHeader';
import { PreLaunchBar } from './PreLaunchBar';
import type { PreLaunchSlot } from './PreLaunchBar';
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
  // Grid layout based on number of active sessions only
  const sessionCount = sessions.length;

  // Determine grid layout based on session count
  const gridClasses = useMemo(() => {
    switch (sessionCount) {
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
  }, [sessionCount]);

  // Empty state - no sessions and no pre-launch slots
  if (sessionCount === 0 && preLaunchSlots.length === 0) {
    return <IdleLandingView onAddSession={onAddSlot} className={className} />;
  }

  // Can add more sessions (max 6)
  const canAddMore = sessionCount + preLaunchSlots.length < 6;

  return (
    <div className={twMerge(clsx('h-full w-full flex flex-col', className))}>
      {/* Main grid area for active sessions */}
      <div className={clsx('flex-1 min-h-0 grid gap-2 p-2', gridClasses)}>
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

        {/* Empty state when no sessions but have pre-launch slots */}
        {sessionCount === 0 && preLaunchSlots.length > 0 && (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">Configure and launch sessions below</p>
          </div>
        )}
      </div>

      {/* Bottom section for pre-launch bars and add button */}
      <div className="flex-shrink-0 p-2 pt-0 space-y-2">
        {/* Pre-launch bars */}
        {preLaunchSlots.map((slot) => (
          <PreLaunchBar
            key={slot.id}
            slot={slot}
            branches={branches}
            onUpdate={onUpdateSlot}
            onLaunch={onLaunch}
            onRemove={onRemoveSlot}
          />
        ))}

        {/* Add session button */}
        {canAddMore && (
          <button
            onClick={onAddSlot}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2 rounded-lg',
              'border border-dashed border-border',
              'bg-card/30 hover:bg-card/50',
              'text-muted-foreground hover:text-foreground-secondary',
              'transition-all duration-150',
              'hover:border-primary/50',
              'group'
            )}
            aria-label="Add session"
          >
            <Plus size={16} className="group-hover:text-primary transition-colors" />
            <span className="text-sm">Add Session</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Re-export types for convenience
export type { TerminalSession, AIMode } from './TerminalHeader';
export type { PreLaunchSlot, AIMode as PreLaunchAIMode } from './PreLaunchBar';
