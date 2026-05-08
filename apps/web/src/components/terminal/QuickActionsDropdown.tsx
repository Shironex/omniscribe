import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  GitCommit,
  GitCommitVertical,
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
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { getCustomCommandIcon } from '@/lib/custom-command-icons';
import type { CustomCommand } from '@omniscribe/shared';
import type { QuickActionItem } from './TerminalCard';

const iconMap: Record<string, LucideIcon> = {
  GitCommit,
  GitCommitVertical,
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

const categoryConfig: Record<string, { label: string; order: number }> = {
  git: { label: 'Git', order: 1 },
  terminal: { label: 'Terminal', order: 2 },
  ai: { label: 'AI', order: 3 },
};

interface QuickActionsDropdownProps {
  quickActions: QuickActionItem[];
  isOpen: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  onToggle: () => void;
  onAction: (actionId: string) => void;
  /** Per-project custom commands shown as a separate "Custom" section. */
  customCommands?: CustomCommand[];
  /** Triggered when the user clicks a custom command. */
  onCustomCommand?: (id: string) => void;
  /** Triggered by the "Manage Custom Commands…" footer button. */
  onManageCustomCommands?: () => void;
}

export function QuickActionsDropdown({
  quickActions,
  isOpen,
  disabled = false,
  disabledTooltip,
  onToggle,
  onAction,
  customCommands,
  onCustomCommand,
  onManageCustomCommands,
}: QuickActionsDropdownProps) {
  const groupedActions = useMemo(() => {
    const groups: Record<string, QuickActionItem[]> = {};
    for (const action of quickActions) {
      const category = action.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(action);
    }
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

  const hasCustomSection = !!onCustomCommand && !!customCommands && customCommands.length > 0;
  const hasManageFooter = !!onManageCustomCommands;
  const hasAnyContent = quickActions.length > 0 || hasCustomSection || hasManageFooter;

  return (
    <>
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        title={disabled ? disabledTooltip : 'Quick actions'}
        className={cn(
          'p-1 rounded',
          disabled
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : [
                'text-muted-foreground hover:text-status-warning',
                'hover:bg-status-warning-bg transition-colors',
                isOpen && 'bg-status-warning-bg text-status-warning',
              ]
        )}
        aria-label="Quick actions"
      >
        <Zap size={12} />
      </button>
      {!disabled && isOpen && hasAnyContent && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] max-h-[360px] overflow-y-auto bg-popover border border-border rounded-md shadow-lg py-1">
          {groupedActions.map((group, groupIndex) => (
            <div key={group.category}>
              {groupIndex > 0 && <div className="my-1 border-t border-border" />}
              <div className="px-3 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                {group.label}
              </div>
              {group.actions.map(action => {
                const Icon = action.icon ? iconMap[action.icon] : null;
                return (
                  <button
                    type="button"
                    key={action.id}
                    onClick={() => onAction(action.id)}
                    className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    {Icon && <Icon size={12} className="text-muted-foreground" />}
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {hasCustomSection && (
            <div>
              {groupedActions.length > 0 && <div className="my-1 border-t border-border" />}
              <div className="px-3 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                Custom
              </div>
              {customCommands!.map(cmd => {
                const Icon = getCustomCommandIcon(cmd.icon);
                return (
                  <button
                    type="button"
                    key={cmd.id}
                    onClick={() => onCustomCommand!(cmd.id)}
                    title={cmd.command}
                    className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    <Icon size={12} className="text-muted-foreground" />
                    <span className="truncate">{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {hasManageFooter && (
            <>
              {(groupedActions.length > 0 || hasCustomSection) && (
                <div className="my-1 border-t border-border" />
              )}
              <button
                type="button"
                onClick={onManageCustomCommands}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center gap-2"
              >
                <Plus size={12} />
                <span>Manage Custom Commands…</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
