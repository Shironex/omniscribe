import React, { useState, useRef, useCallback, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { GripVertical, RotateCcw } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { SessionStatusDisplay } from './SessionStatusDisplay';
import { QuickActionsDropdown } from './QuickActionsDropdown';
import { MoreMenuDropdown } from './MoreMenuDropdown';
import { TaskListPopover } from './TaskListPopover';
import { ExtensionSlot } from '@/components/plugin/ExtensionSlot';
import type { TerminalDragHandleProps } from './SortableTerminalWrapper';
import { EMPTY_QUICK_ACTIONS, type QuickActionItem } from './TerminalCard';
import type { SessionStatus } from '@/components/shared/StatusLegend';
import type { AiMode } from '@omniscribe/shared';

export interface GitBranchInfo {
  name: string;
  ahead?: number;
  behind?: number;
}

export interface TerminalSession {
  id: string;
  sessionNumber: number;
  aiMode: AiMode;
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
  /** User-defined custom title (in-memory only) */
  customTitle?: string;
}

interface TerminalHeaderProps {
  quickActions?: QuickActionItem[];
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
  onSettingsClick?: () => void;
  onOpenInEditor?: () => void;
  onClose: () => void;
  onQuickAction?: (actionId: string) => void;
  onResume?: () => void;
  dragHandleProps?: TerminalDragHandleProps;
  className?: string;
}

export const TerminalHeader = React.memo(function TerminalHeader({
  session,
  gitBranch,
  quickActions = EMPTY_QUICK_ACTIONS,
  onSettingsClick,
  onOpenInEditor,
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
      className={cn(
        'h-8 bg-muted border-b border-border',
        'flex items-center justify-between px-2 gap-2',
        'select-none',
        className
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
            type="button"
            onClick={onResume}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-status-success hover:bg-status-success/10 transition-colors"
            title="Resume this session"
          >
            <RotateCcw size={12} />
            <span>Resume</span>
          </button>
        )}

        {/* Plugin-contributed terminal header actions */}
        <ExtensionSlot
          name="terminal-header-actions"
          aiMode={session.aiMode}
          context={{ sessionId: session.id, status: session.status }}
          className="flex items-center gap-0.5"
        />

        {/* Plugin-contributed action bar items (inline with core actions) */}
        <ExtensionSlot
          name="action-bar"
          aiMode={session.aiMode}
          context={{ sessionId: session.id, status: session.status }}
          className="flex items-center gap-0.5"
        />

        {quickActions.length > 0 && (
          <div className="relative" ref={quickActionsRef}>
            <QuickActionsDropdown
              quickActions={quickActions}
              isOpen={quickActionsOpen}
              disabled={session.aiMode === 'plain'}
              disabledTooltip="Quick actions are available in AI sessions only"
              onToggle={() => {
                setQuickActionsOpen(prev => !prev);
                setMoreMenuOpen(false);
              }}
              onAction={handleQuickAction}
            />
          </div>
        )}

        {session.aiMode !== 'plain' && <TaskListPopover sessionId={session.id} />}

        <div className="relative" ref={moreMenuRef}>
          <MoreMenuDropdown
            isOpen={moreMenuOpen}
            aiMode={session.aiMode}
            sessionId={session.id}
            onToggle={() => {
              setMoreMenuOpen(prev => !prev);
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
            onOpenInEditor={
              onOpenInEditor
                ? () => {
                    setMoreMenuOpen(false);
                    onOpenInEditor();
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
});

TerminalHeader.displayName = 'TerminalHeader';
