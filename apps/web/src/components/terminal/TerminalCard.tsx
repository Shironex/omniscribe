import React from 'react';
import { cn } from '@/lib/utils';
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
  const { onKill, onSessionClose, onQuickAction, onResume, onOpenInEditor, quickActions } =
    useTerminalGridContext();

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

  return (
    <div
      data-testid={`session-card-${session.id}`}
      className={cn(
        'flex flex-col h-full min-h-0 min-w-0 rounded-lg overflow-hidden',
        'border border-border',
        'bg-card',
        isFocused && 'ring-2 ring-primary',
        'transition-all duration-150'
      )}
      onClick={handleFocus}
    >
      <TerminalHeader
        session={session}
        quickActions={quickActions}
        onClose={handleKill}
        onQuickAction={onQuickAction ? handleQuickAction : undefined}
        onResume={onResume ? handleResume : undefined}
        onOpenInEditor={onOpenInEditor ? handleOpenInEditor : undefined}
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
    </div>
  );
});
