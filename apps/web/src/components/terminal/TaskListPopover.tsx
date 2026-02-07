import { useCallback, useMemo, useState, memo } from 'react';
import { clsx } from 'clsx';
import {
  Loader2,
  Circle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useTaskStore } from '@/stores/useTaskStore';
import { TaskBadge } from './TaskBadge';
import type { TaskItem, TaskStatus } from '@omniscribe/shared';

/** Stable empty array to avoid creating new references when no tasks exist */
const EMPTY_TASKS: TaskItem[] = [];

interface TaskListPopoverProps {
  sessionId: string;
}

interface StatusConfig {
  icon: LucideIcon;
  label: string;
  className: string;
}

const statusConfig: Record<TaskStatus, StatusConfig> = {
  in_progress: {
    icon: Loader2,
    label: 'In Progress',
    className: 'text-blue-400 animate-spin',
  },
  pending: {
    icon: Circle,
    label: 'Pending',
    className: 'text-muted-foreground',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'text-green-500',
  },
};

interface TaskGroupProps {
  label: string;
  items: TaskItem[];
}

function TaskGroup({ label, items }: TaskGroupProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 w-full px-2 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wide hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{label}</span>
        <span className="ml-auto text-[9px] tabular-nums">{items.length}</span>
      </button>
      {expanded && (
        <div>
          {items.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

const TaskRow = memo(function TaskRow({ task }: { task: TaskItem }) {
  const config = statusConfig[task.status];
  const Icon = config.icon;
  const isCompleted = task.status === 'completed';

  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 text-xs',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200',
        'transition-all duration-200'
      )}
    >
      <Icon size={12} className={clsx('shrink-0', config.className)} />
      <span
        className={clsx('truncate', isCompleted && 'line-through text-muted-foreground')}
        title={task.subject}
      >
        {task.subject}
      </span>
    </div>
  );
});

export function TaskListPopover({ sessionId }: TaskListPopoverProps) {
  // Single stable selector — useCallback ensures the same function reference
  // across renders (for the same sessionId), preventing Zustand re-subscribe loops.
  // EMPTY_TASKS is a module-level constant to avoid new array references.
  const tasks = useTaskStore(
    useCallback(state => state.tasksBySession.get(sessionId) ?? EMPTY_TASKS, [sessionId])
  );
  const taskCount = tasks.length;
  const hasInProgress = useMemo(() => tasks.some(t => t.status === 'in_progress'), [tasks]);

  const { inProgress, pending, completed } = useMemo(() => {
    const inProgress: TaskItem[] = [];
    const pending: TaskItem[] = [];
    const completed: TaskItem[] = [];
    for (const task of tasks) {
      if (task.status === 'in_progress') inProgress.push(task);
      else if (task.status === 'pending') pending.push(task);
      else if (task.status === 'completed') completed.push(task);
    }
    return { inProgress, pending, completed };
  }, [tasks]);

  const groups = [
    { key: 'in_progress', label: 'In Progress', items: inProgress },
    { key: 'pending', label: 'Pending', items: pending },
    { key: 'completed', label: 'Completed', items: completed },
  ].filter(group => group.items.length > 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={clsx(
            'p-1 rounded',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-card transition-colors'
          )}
          aria-label={`Tasks (${taskCount})`}
        >
          <TaskBadge taskCount={taskCount} hasInProgress={hasInProgress} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-0 max-h-[300px] overflow-y-auto"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {tasks.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">No tasks reported yet</div>
        ) : (
          <div className="py-1">
            {groups.map((group, groupIndex) => (
              <div key={group.key}>
                {groupIndex > 0 && <div className="border-t border-border" />}
                <TaskGroup label={group.label} items={group.items} />
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
