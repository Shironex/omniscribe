import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/animations';
import { TerminalView } from './TerminalView';
import { TerminalErrorBoundary } from './TerminalErrorBoundary';
import { TerminalHeader } from './TerminalHeader';
import { ReconnectionOverlay } from './ReconnectionOverlay';
import { BackpressureOverlay } from './BackpressureOverlay';
import { useTerminalGridContext } from './TerminalGridContext';
import type { TerminalSession } from './TerminalHeader';
import type { TerminalDragHandleProps } from './SortableTerminalWrapper';

export type { QuickActionItem } from './terminal-types';
export { EMPTY_QUICK_ACTIONS } from './terminal-types';

const ANIMATE_FOCUSED = { scale: 1 };
const ANIMATE_UNFOCUSED = { scale: 0.995 };

interface TerminalCardProps {
  session: TerminalSession;
  /** Whether this terminal's project tab is currently active/visible */
  isActive?: boolean;
  isFocused: boolean;
  onFocus: (sessionId: string) => void;
  dragHandleProps?: TerminalDragHandleProps;
}

export const TerminalCard = React.memo(function TerminalCard({
  session,
  isActive = true,
  isFocused,
  onFocus,
  dragHandleProps,
}: TerminalCardProps) {
  const {
    onKill,
    onSessionClose,
    onQuickAction,
    onResume,
    onOpenInEditor,
    onViewChanges,
    quickActions,
  } = useTerminalGridContext();

  const handleFocus = React.useCallback(() => onFocus(session.id), [onFocus, session.id]);
  const handleKill = React.useCallback(() => onKill(session.id), [onKill, session.id]);
  const handleSessionClose = React.useCallback(
    (exitCode: number) => onSessionClose?.(session.id, exitCode),
    [onSessionClose, session.id]
  );
  const handleQuickAction = React.useCallback(
    (actionId: string) => onQuickAction?.(session.id, actionId),
    [onQuickAction, session.id]
  );
  const handleResume = React.useCallback(() => onResume?.(session.id), [onResume, session.id]);
  const handleOpenInEditor = React.useCallback(
    () => onOpenInEditor?.(session.id),
    [onOpenInEditor, session.id]
  );
  const handleViewChanges = React.useCallback(
    () => onViewChanges?.(session.id),
    [onViewChanges, session.id]
  );

  return (
    <motion.div
      data-testid={`session-card-${session.id}`}
      className={cn(
        'flex flex-col h-full min-h-0 min-w-0 rounded-lg overflow-hidden',
        'bg-card',
        'shadow-sm shadow-black/20',
        'border',
        isFocused ? 'border-primary/50' : 'border-border',
        isFocused && 'shadow-primary-glow',
        'transition-[border-color,box-shadow] duration-200'
      )}
      animate={isFocused ? ANIMATE_FOCUSED : ANIMATE_UNFOCUSED}
      transition={transitions.fast}
      onClick={handleFocus}
    >
      <TerminalHeader
        session={session}
        quickActions={quickActions}
        onClose={handleKill}
        onQuickAction={onQuickAction ? handleQuickAction : undefined}
        onResume={onResume ? handleResume : undefined}
        onOpenInEditor={onOpenInEditor ? handleOpenInEditor : undefined}
        onViewChanges={onViewChanges ? handleViewChanges : undefined}
        dragHandleProps={dragHandleProps}
      />
      <div className="relative flex-1 min-h-0">
        {session.terminalSessionId !== undefined ? (
          <TerminalErrorBoundary sessionId={session.terminalSessionId}>
            <TerminalView
              sessionId={session.terminalSessionId}
              isActive={isActive}
              isFocused={isFocused}
              onClose={handleSessionClose}
            />
          </TerminalErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full bg-muted text-muted-foreground text-sm">
            Connecting to terminal...
          </div>
        )}
        <ReconnectionOverlay />
        {session.terminalSessionId !== undefined && (
          <BackpressureOverlay terminalSessionId={session.terminalSessionId} />
        )}
      </div>
    </motion.div>
  );
});
