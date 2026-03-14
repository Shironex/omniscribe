import React, { useState, useRef, useCallback, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { GripVertical, RotateCcw, GitCompareArrows } from 'lucide-react';
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

type ActiveDropdown = 'quick-actions' | 'more-menu' | null;

interface TerminalHeaderProps {
  quickActions?: QuickActionItem[];
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
  onSettingsClick?: () => void;
  onOpenInEditor?: () => void;
  onViewChanges?: () => void;
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
  onViewChanges,
  onClose,
  onQuickAction,
  onResume,
  dragHandleProps,
  className,
}: TerminalHeaderProps) {
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    quickActionsRef,
    useCallback(() => setActiveDropdown(prev => (prev === 'quick-actions' ? null : prev)), [])
  );
  useClickOutside(
    moreMenuRef,
    useCallback(() => setActiveDropdown(prev => (prev === 'more-menu' ? null : prev)), [])
  );

  const handleQuickAction = useCallback(
    (actionId: string) => {
      setActiveDropdown(null);
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
        'min-h-8 h-8 bg-gradient-to-b from-muted to-muted/80 border-b border-border',
        'flex items-center justify-between px-2 gap-2',
        'select-none',
        className
      )}
    >
      {/* Left section */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
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
              isOpen={activeDropdown === 'quick-actions'}
              disabled={session.aiMode === 'plain'}
              disabledTooltip="Quick actions are available in AI sessions only"
              onToggle={() => {
                setActiveDropdown(prev => (prev === 'quick-actions' ? null : 'quick-actions'));
              }}
              onAction={handleQuickAction}
            />
          </div>
        )}

        {session.aiMode !== 'plain' && <TaskListPopover sessionId={session.id} />}

        {onViewChanges && (
          <button
            type="button"
            onClick={onViewChanges}
            className={cn(
              'p-1 rounded',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-card transition-colors'
            )}
            title="View Changes"
            aria-label="View Changes"
          >
            <GitCompareArrows size={14} />
          </button>
        )}

        <div className="relative" ref={moreMenuRef}>
          <MoreMenuDropdown
            isOpen={activeDropdown === 'more-menu'}
            aiMode={session.aiMode}
            sessionId={session.id}
            onToggle={() => {
              setActiveDropdown(prev => (prev === 'more-menu' ? null : 'more-menu'));
            }}
            onSettingsClick={
              onSettingsClick
                ? () => {
                    setActiveDropdown(null);
                    onSettingsClick();
                  }
                : undefined
            }
            onOpenInEditor={
              onOpenInEditor
                ? () => {
                    setActiveDropdown(null);
                    onOpenInEditor();
                  }
                : undefined
            }
            onClose={() => {
              setActiveDropdown(null);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
});

TerminalHeader.displayName = 'TerminalHeader';
