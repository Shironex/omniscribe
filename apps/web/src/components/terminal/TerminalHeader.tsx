import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useRef, useCallback, type HTMLAttributes } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { SessionStatusDisplay } from './SessionStatusDisplay';
import { QuickActionsDropdown } from './QuickActionsDropdown';
import { MoreMenuDropdown } from './MoreMenuDropdown';
import type { TerminalDragHandleProps } from './SortableTerminalWrapper';
import type { QuickActionItem } from './TerminalCard';
import type { SessionStatus } from '@/components/shared/StatusLegend';
export type AIMode = 'claude' | 'plain';

export interface GitBranchInfo {
  name: string;
  ahead?: number;
  behind?: number;
}

export interface TerminalSession {
  id: string;
  sessionNumber: number;
  aiMode: AIMode;
  status: SessionStatus;
  branch?: string;
  statusMessage?: string;
  /** Terminal PTY session ID - required for the terminal to connect */
  terminalSessionId?: number;
  /** Git worktree path if session is using a worktree */
  worktreePath?: string;
}

interface TerminalHeaderProps {
  quickActions?: QuickActionItem[];
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
  onSettingsClick?: () => void;
  onClose: () => void;
  onQuickAction?: (actionId: string) => void;
  dragHandleProps?: TerminalDragHandleProps;
  className?: string;
}

export function TerminalHeader({
  session,
  gitBranch,
  quickActions = [],
  onSettingsClick,
  onClose,
  onQuickAction,
  dragHandleProps,
  className,
}: TerminalHeaderProps) {
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    quickActionsRef,
    useCallback(() => setQuickActionsOpen(false), [])
  );
  useClickOutside(
    moreMenuRef,
    useCallback(() => setMoreMenuOpen(false), [])
  );

  const handleQuickAction = useCallback(
    (actionId: string) => {
      setQuickActionsOpen(false);
      onQuickAction?.(actionId);
    },
    [onQuickAction]
  );

  const dragHandleAttributes = (dragHandleProps?.attributes ??
    {}) as HTMLAttributes<HTMLDivElement>;
  const dragHandleListeners = (dragHandleProps?.listeners ?? {}) as HTMLAttributes<HTMLDivElement>;

  return (
    <div
      className={twMerge(
        clsx(
          'h-8 bg-muted border-b border-border',
          'flex items-center justify-between px-2 gap-2',
          'select-none',
          className
        )
      )}
    >
      {/* Left section */}
      <div
        ref={node => dragHandleProps?.setNodeRef(node)}
        {...dragHandleAttributes}
        {...dragHandleListeners}
        className={clsx(
          'flex items-center gap-2 min-w-0 flex-1',
          dragHandleProps && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <SessionStatusDisplay session={session} gitBranch={gitBranch} />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onQuickAction && quickActions.length > 0 && (
          <div className="relative" ref={quickActionsRef}>
            <QuickActionsDropdown
              quickActions={quickActions}
              isOpen={quickActionsOpen}
              onToggle={() => {
                setQuickActionsOpen(!quickActionsOpen);
                setMoreMenuOpen(false);
              }}
              onAction={handleQuickAction}
            />
          </div>
        )}

        <div className="relative" ref={moreMenuRef}>
          <MoreMenuDropdown
            isOpen={moreMenuOpen}
            onToggle={() => {
              setMoreMenuOpen(!moreMenuOpen);
              setQuickActionsOpen(false);
            }}
            onSettingsClick={
              onSettingsClick
                ? () => {
                    setMoreMenuOpen(false);
                    onSettingsClick();
                  }
                : undefined
            }
            onClose={() => {
              setMoreMenuOpen(false);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
