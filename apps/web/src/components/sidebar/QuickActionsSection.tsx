import { useCallback, useMemo } from 'react';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('QuickActions');
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Play,
  GitCommit,
  Wrench,
  Sparkles,
  Zap,
  Terminal,
  FileText,
  Settings,
  Navigation,
  LucideIcon,
} from 'lucide-react';
import { useQuickActionStore, selectActions } from '@/stores';
import { QuickAction } from '@omniscribe/shared';

interface QuickActionsSectionProps {
  className?: string;
  onActionExecute?: (action: QuickAction) => void;
}

/**
 * Map icon name to Lucide icon component
 */
function getActionIcon(iconName?: string): LucideIcon {
  const iconMap: Record<string, LucideIcon> = {
    Play,
    GitCommit,
    Wrench,
    Sparkles,
    Zap,
    Terminal,
    FileText,
    Settings,
    Navigation,
  };

  return iconMap[iconName ?? ''] ?? Zap;
}

/**
 * Get category color
 */
function getCategoryColor(category: QuickAction['category']): string {
  switch (category) {
    case 'git':
      return 'text-orange-400';
    case 'terminal':
      return 'text-green-400';
    case 'ai':
      return 'text-purple-400';
    case 'file':
      return 'text-blue-400';
    case 'session':
      return 'text-cyan-400';
    case 'navigation':
      return 'text-yellow-400';
    case 'settings':
      return 'text-gray-400';
    default:
      return 'text-muted-foreground';
  }
}

export function QuickActionsSection({ className, onActionExecute }: QuickActionsSectionProps) {
  // Select the raw actions array (stable reference) and filter with useMemo
  // to avoid infinite loop from creating new array on every render
  const allActions = useQuickActionStore(selectActions);
  const actions = useMemo(
    () => allActions.filter(action => action.enabled !== false),
    [allActions]
  );

  const handleActionClick = useCallback(
    (action: QuickAction) => {
      if (onActionExecute) {
        onActionExecute(action);
      } else {
        // Default behavior: log the action
        logger.info('Executing:', action.id, action.handler);
      }
    },
    [onActionExecute]
  );

  if (actions.length === 0) {
    return (
      <div className={twMerge(clsx('py-2', className))}>
        <p className="text-xs text-muted-foreground">No quick actions configured</p>
      </div>
    );
  }

  return (
    <div className={twMerge(clsx('space-y-1', className))}>
      {actions.map(action => {
        const Icon = getActionIcon(action.icon);
        const categoryColor = getCategoryColor(action.category);

        return (
          <button
            key={action.id}
            onClick={() => handleActionClick(action)}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded',
              'text-left transition-colors',
              'hover:bg-muted',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'group'
            )}
            title={action.description ?? action.title}
          >
            <Icon
              size={14}
              className={clsx(
                'flex-shrink-0 transition-colors',
                'text-muted-foreground',
                'group-hover:' + categoryColor.replace('text-', '')
              )}
              style={{
                color: undefined,
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-foreground-secondary truncate group-hover:text-foreground transition-colors">
                {action.title}
              </div>
            </div>
            {action.shortcut && (
              <span className="text-xs text-muted-foreground font-mono flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                {action.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
