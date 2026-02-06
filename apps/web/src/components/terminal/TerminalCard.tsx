import { clsx } from 'clsx';
import { TerminalView } from './TerminalView';
import { TerminalErrorBoundary } from './TerminalErrorBoundary';
import { TerminalHeader } from './TerminalHeader';
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
  onFocus: () => void;
  onKill: () => void;
  onSessionClose?: (exitCode: number) => void;
  onQuickAction?: (actionId: string) => void;
  dragHandleProps?: TerminalDragHandleProps;
}

export function TerminalCard({
  session,
  quickActions,
  isFocused,
  onFocus,
  onKill,
  onSessionClose,
  onQuickAction,
  dragHandleProps,
}: TerminalCardProps) {
  return (
    <div
      className={clsx(
        'flex flex-col h-full min-h-0 min-w-0 rounded-lg overflow-hidden',
        'border border-border',
        'bg-card',
        isFocused && 'ring-2 ring-primary',
        'transition-all duration-150'
      )}
      onClick={onFocus}
    >
      <TerminalHeader
        session={session}
        quickActions={quickActions}
        onClose={onKill}
        onQuickAction={onQuickAction ? actionId => onQuickAction(actionId) : undefined}
        dragHandleProps={dragHandleProps}
      />
      <div className="flex-1 min-h-0">
        {session.terminalSessionId !== undefined ? (
          <TerminalErrorBoundary sessionId={session.terminalSessionId}>
            <TerminalView
              sessionId={session.terminalSessionId}
              isFocused={isFocused}
              onClose={exitCode => onSessionClose?.(exitCode)}
            />
          </TerminalErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full bg-muted text-muted-foreground text-sm">
            Connecting to terminal...
          </div>
        )}
      </div>
    </div>
  );
}
