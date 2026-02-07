import { useMemo } from 'react';
import { clsx } from 'clsx';
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
  type LucideIcon,
} from 'lucide-react';
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
}

export function QuickActionsDropdown({
  quickActions,
  isOpen,
  disabled = false,
  disabledTooltip,
  onToggle,
  onAction,
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

  return (
    <>
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        title={disabled ? disabledTooltip : 'Quick actions'}
        className={clsx(
          'p-1 rounded',
          disabled
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : [
                'text-muted-foreground hover:text-yellow-400',
                'hover:bg-yellow-400/10 transition-colors',
                isOpen && 'bg-yellow-400/10 text-yellow-400',
              ]
        )}
        aria-label="Quick actions"
      >
        <Zap size={12} />
      </button>
      {!disabled && isOpen && quickActions.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-popover border border-border rounded-md shadow-lg py-1">
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
        </div>
      )}
    </>
  );
}
