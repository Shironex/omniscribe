import { memo } from 'react';
import type { SwarmConfig, SwarmAgent, SwarmTask } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Clock, AlertTriangle, ListTodo, Target } from 'lucide-react';

interface SwarmSummaryPanelProps {
  swarm: SwarmConfig;
  agents: SwarmAgent[];
  tasks: SwarmTask[];
}

function SwarmSummaryPanelInner({ swarm, agents, tasks }: SwarmSummaryPanelProps) {
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(
    t => t.status === 'assigned' || t.status === 'in_progress'
  ).length;
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'blocked').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const activeAgents = agents.filter(a => a.status === 'active').length;

  return (
    <div
      className={cn(
        'absolute top-16 right-3 z-10',
        'flex flex-col gap-2 p-3',
        'rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg',
        'w-[260px] text-xs'
      )}
    >
      {/* Goal */}
      <div className="flex items-start gap-2">
        <Target size={12} className="text-primary shrink-0 mt-0.5" />
        <p className="text-muted-foreground line-clamp-3" title={swarm.goal}>
          {swarm.goal}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Task stats */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ListTodo size={12} />
        <span className="font-medium text-foreground">Tasks</span>
        <span className="ml-auto">{tasks.length} total</span>
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-4">
          {completedTasks > 0 && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={10} className="text-green-500" />
              <span className="text-green-400">{completedTasks} done</span>
            </div>
          )}
          {inProgressTasks > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-blue-400" />
              <span className="text-blue-400">{inProgressTasks} active</span>
            </div>
          )}
          {pendingTasks > 0 && (
            <div className="flex items-center gap-1.5">
              <Circle size={10} className="text-muted-foreground" />
              <span>{pendingTasks} pending</span>
            </div>
          )}
          {failedTasks > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-destructive" />
              <span className="text-destructive">{failedTasks} failed</span>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${(completedTasks / tasks.length) * 100}%` }}
          />
        </div>
      )}

      {/* Agent activity */}
      <div className="text-muted-foreground">
        {activeAgents}/{agents.length} agents active
      </div>
    </div>
  );
}

export const SwarmSummaryPanel = memo(SwarmSummaryPanelInner);
