import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Terminal,
  X,
  Settings,
  GitBranch,
  Zap,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  FolderGit2,
  GitCommit,
  GitMerge,
  MessageSquare,
  Play,
  Sparkles,
  Wrench,
  ListTodo,
  Info,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import { SessionStatus, StatusDot } from '@/components/shared/StatusLegend';
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type ComponentType,
  type HTMLAttributes,
} from 'react';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import type { TerminalDragHandleProps } from './SortableTerminalWrapper';

// Icon map for rendering icons from string names
const iconMap: Record<string, LucideIcon> = {
  GitCommit,
  GitMerge,
  GitBranch,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  Play,
  Sparkles,
  Wrench,
  ListTodo,
  Info,
  Bot,
  Settings,
  Zap,
};

// Category labels and order
const categoryConfig: Record<string, { label: string; order: number }> = {
  git: { label: 'Git', order: 1 },
  terminal: { label: 'Terminal', order: 2 },
  ai: { label: 'AI', order: 3 },
};

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

interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  category?: string;
}

interface TerminalHeaderProps {
  quickActions?: QuickAction[];
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
  onSettingsClick?: () => void;
  onClose: () => void;
  onQuickAction?: (actionId: string) => void;
  dragHandleProps?: TerminalDragHandleProps;
  className?: string;
}

interface AIModeConfigItem {
  icon: ComponentType<{ size?: string | number; className?: string }>;
  label: string;
  color: string;
}

const aiModeConfig: Record<AIMode, AIModeConfigItem> = {
  claude: { icon: ClaudeIcon, label: 'Claude', color: 'text-orange-400' },
  plain: { icon: Terminal, label: 'Plain', color: 'text-muted-foreground' },
};

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
  const modeConfig = aiModeConfig[session.aiMode];
  const ModeIcon = modeConfig.icon;

  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setQuickActionsOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Use gitBranch prop if available, otherwise fall back to session.branch
  const branchName = gitBranch?.name ?? session.branch;
  const ahead = gitBranch?.ahead;
  const behind = gitBranch?.behind;

  const handleQuickAction = (actionId: string) => {
    setQuickActionsOpen(false);
    onQuickAction?.(actionId);
  };

  // Group quick actions by category
  const groupedActions = useMemo(() => {
    const groups: Record<string, QuickAction[]> = {};
    for (const action of quickActions) {
      const category = action.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(action);
    }
    // Sort categories by configured order
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const orderA = categoryConfig[a]?.order ?? 99;
      const orderB = categoryConfig[b]?.order ?? 99;
      return orderA - orderB;
    });
    return sortedCategories.map(cat => ({
      category: cat,
      label: categoryConfig[cat]?.label ?? cat,
      actions: groups[cat],
    }));
  }, [quickActions]);

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
      {/* Left section: Status dot + AI mode + label + git branch + status message */}
      <div
        ref={node => dragHandleProps?.setNodeRef(node)}
        {...dragHandleAttributes}
        {...dragHandleListeners}
        className={clsx(
          'flex items-center gap-2 min-w-0 flex-1',
          dragHandleProps && 'cursor-grab active:cursor-grabbing'
        )}
      >
        {/* Status dot */}
        <div className="flex items-center shrink-0">
          <StatusDot status={session.status} className="w-2 h-2" />
        </div>

        {/* AI Mode icon + Session label */}
        <div className="flex items-center gap-1 shrink-0">
          <ModeIcon size={14} className={clsx('shrink-0', modeConfig.color)} />
          <span className="text-xs font-medium text-foreground">
            {modeConfig.label} #{session.sessionNumber}
          </span>
        </div>

        {/* Git branch with ahead/behind indicators */}
        {branchName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-card/50">
            <GitBranch size={11} className="text-muted-foreground" />
            <span className="truncate max-w-24">{branchName}</span>
            {ahead !== undefined && ahead > 0 && (
              <span className="flex items-center gap-0.5 text-green-500 text-2xs">
                <ArrowUp size={9} />
                {ahead}
              </span>
            )}
            {behind !== undefined && behind > 0 && (
              <span className="flex items-center gap-0.5 text-orange-500 text-2xs">
                <ArrowDown size={9} />
                {behind}
              </span>
            )}
          </div>
        )}

        {/* Worktree indicator */}
        {session.worktreePath && (
          <div
            className="flex items-center gap-1 text-xs text-cyan-500 shrink-0 px-1.5 py-0.5 rounded bg-cyan-500/10"
            title={session.worktreePath}
          >
            <FolderGit2 size={11} />
            <span>worktree</span>
          </div>
        )}

        {/* Status message (truncated) with better styling */}
        {session.statusMessage && (
          <span className="text-2xs text-muted-foreground truncate px-1.5 py-0.5 rounded bg-card/30 max-w-[200px]">
            {session.statusMessage}
          </span>
        )}
      </div>

      {/* Right section: Quick actions + More menu + Close */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Quick Actions dropdown */}
        {onQuickAction && quickActions.length > 0 && (
          <div className="relative" ref={quickActionsRef}>
            <button
              onClick={() => {
                setQuickActionsOpen(!quickActionsOpen);
                setMoreMenuOpen(false);
              }}
              className={clsx(
                'p-1 rounded',
                'text-muted-foreground hover:text-yellow-400',
                'hover:bg-yellow-400/10 transition-colors',
                quickActionsOpen && 'bg-yellow-400/10 text-yellow-400'
              )}
              aria-label="Quick actions"
            >
              <Zap size={12} />
            </button>
            {quickActionsOpen && quickActions.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-popover border border-border rounded-md shadow-lg py-1">
                {groupedActions.map((group, groupIndex) => (
                  <div key={group.category}>
                    {/* Section divider (except first) */}
                    {groupIndex > 0 && <div className="my-1 border-t border-border" />}
                    {/* Section header */}
                    <div className="px-3 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </div>
                    {/* Actions in this section */}
                    {group.actions.map(action => {
                      const Icon = action.icon ? iconMap[action.icon] : null;
                      return (
                        <button
                          key={action.id}
                          onClick={() => handleQuickAction(action.id)}
                          className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                        >
                          {Icon && <Icon size={12} className="text-muted-foreground" />}
                          <span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* More options menu */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => {
              setMoreMenuOpen(!moreMenuOpen);
              setQuickActionsOpen(false);
            }}
            className={clsx(
              'p-1 rounded',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-card transition-colors',
              moreMenuOpen && 'bg-card text-foreground'
            )}
            aria-label="More options"
          >
            <MoreVertical size={12} />
          </button>
          {moreMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] bg-popover border border-border rounded-md shadow-lg py-1">
              {onSettingsClick && (
                <button
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onSettingsClick();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Settings size={11} />
                  Settings
                </button>
              )}
              <button
                onClick={() => {
                  setMoreMenuOpen(false);
                  onClose();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors flex items-center gap-2"
              >
                <X size={11} />
                Kill Session
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
