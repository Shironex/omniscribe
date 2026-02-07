import { ListTodo } from 'lucide-react';
import { clsx } from 'clsx';

interface TaskBadgeProps {
  taskCount: number;
  hasInProgress: boolean;
}

export function TaskBadge({ taskCount, hasInProgress }: TaskBadgeProps) {
  return (
    <span className="relative inline-flex items-center">
      <ListTodo size={12} />
      {taskCount > 0 && (
        <span
          className={clsx(
            'absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5',
            'rounded-full bg-primary text-primary-foreground',
            'text-[9px] font-medium flex items-center justify-center leading-none',
            hasInProgress && 'animate-pulse'
          )}
        >
          {taskCount > 99 ? '99+' : taskCount}
        </span>
      )}
    </span>
  );
}
