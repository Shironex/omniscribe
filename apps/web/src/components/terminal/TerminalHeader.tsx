import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useRef, useCallback, type HTMLAttributes } from 'react';
import { GripVertical, RotateCcw } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { SessionStatusDisplay } from './SessionStatusDisplay';
import { QuickActionsDropdown } from './QuickActionsDropdown';
import { MoreMenuDropdown } from './MoreMenuDropdown';
import { TaskListPopover } from './TaskListPopover';
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
  /** Whether session was launched with skip-permissions mode */
  skipPermissions?: boolean;
  /** Claude Code session ID for resume capability */
  claudeSessionId?: string;
  /** Whether this session was resumed from a previous Claude Code session */
  isResumed?: boolean;
}

interface TerminalHeaderProps {
  quickActions?: QuickActionItem[];
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
  onSettingsClick?: () => void;
  onClose: () => void;
  onQuickAction?: (actionId: string) => void;
  onResume?: () => void;
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
  onResume,
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
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {dragHandleProps && (
          <div
            ref={node => dragHandleProps.setNodeRef(node)}
            {...dragHandleAttributes}
            {...dragHandleListeners}
            className="flex items-center cursor-grab active:cursor-grabbing px-0.5 shrink-0 touch-none"
            aria-label="Drag to reorder"
          >
            <GripVertical size={14} className="text-muted-foreground/40" />
          </div>
        )}
        <SessionStatusDisplay session={session} gitBranch={gitBranch} />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-0.5 shrink-0">
        {session.status === 'error' && session.claudeSessionId && onResume && (
          <button
            onClick={onResume}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Resume this session"
          >
            <RotateCcw size={12} />
            <span>Resume</span>
          </button>
        )}

        {quickActions.length > 0 && (
          <div className="relative" ref={quickActionsRef}>
            <QuickActionsDropdown
              quickActions={quickActions}
              isOpen={quickActionsOpen}
              disabled={session.aiMode === 'plain'}
              disabledTooltip="Quick actions are available in AI sessions only"
              onToggle={() => {
                setQuickActionsOpen(!quickActionsOpen);
                setMoreMenuOpen(false);
              }}
              onAction={handleQuickAction}
            />
          </div>
        )}

        {session.aiMode === 'claude' && <TaskListPopover sessionId={session.id} />}

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
