import React from 'react';
import { clsx } from 'clsx';
import { TerminalView } from './TerminalView';
import { TerminalErrorBoundary } from './TerminalErrorBoundary';
import { TerminalHeader } from './TerminalHeader';
import { ReconnectionOverlay } from './ReconnectionOverlay';
import type { TerminalSession } from './TerminalHeader';
import type { TerminalDragHandleProps } from './SortableTerminalWrapper';

export interface QuickActionItem {
  id: string;
  label: string;
  icon?: string;
  category?: string;
}

interface TerminalCardProps {
  session: TerminalSession;
  quickActions: QuickActionItem[];
  isFocused: boolean;
  onFocus: (sessionId: string) => void;
  onKill: (sessionId: string) => void;
  onSessionClose?: (sessionId: string, exitCode: number) => void;
  onQuickAction?: (sessionId: string, actionId: string) => void;
  onResume?: (sessionId: string) => void;
  dragHandleProps?: TerminalDragHandleProps;
}

export const TerminalCard = React.memo(function TerminalCard({
  session,
  quickActions,
  isFocused,
  onFocus,
  onKill,
  onSessionClose,
  onQuickAction,
  onResume,
  dragHandleProps,
}: TerminalCardProps) {
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

  return (
    <div
      data-testid={`session-card-${session.id}`}
      className={clsx(
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
        dragHandleProps={dragHandleProps}
      />
      <div className="relative flex-1 min-h-0">
        {session.terminalSessionId !== undefined ? (
          <TerminalErrorBoundary sessionId={session.terminalSessionId}>
            <TerminalView
              sessionId={session.terminalSessionId}
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
      </div>
    </div>
  );
});
