import { memo } from 'react';
import type { SwarmConfig } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { X, Square, Users } from 'lucide-react';

interface SwarmToolbarProps {
  swarm: SwarmConfig;
  agentCount: number;
  onCancel: () => void;
  onClose: () => void;
}

/** Status display configuration */
const STATUS_BADGE: Record<
  SwarmConfig['status'],
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className?: string;
  }
> = {
  configuring: { label: 'Configuring', variant: 'outline' },
  starting: { label: 'Starting', variant: 'secondary', className: 'animate-pulse' },
  planning: { label: 'Planning', variant: 'secondary', className: 'animate-pulse' },
  active: {
    label: 'Active',
    variant: 'default',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  completing: { label: 'Completing', variant: 'secondary', className: 'animate-pulse' },
  done: {
    label: 'Done',
    variant: 'default',
    className: 'bg-primary/20 text-primary border-primary/30',
  },
  error: { label: 'Error', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline', className: 'text-muted-foreground' },
};

function SwarmToolbarInner({ swarm, agentCount, onCancel, onClose }: SwarmToolbarProps) {
  const badgeConfig = STATUS_BADGE[swarm.status] ?? STATUS_BADGE.configuring;
  const isTerminal =
    swarm.status === 'done' || swarm.status === 'cancelled' || swarm.status === 'error';

  return (
    <div
      className={cn(
        'absolute top-3 left-1/2 -translate-x-1/2 z-10',
        'flex items-center gap-3 px-4 py-2',
        'rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg',
        'min-w-[320px]'
      )}
    >
      {/* Swarm name */}
      <span
        className="text-sm font-semibold text-foreground truncate max-w-[180px]"
        title={swarm.name}
      >
        {swarm.name}
      </span>

      {/* Status badge */}
      <Badge variant={badgeConfig.variant} className={cn('text-[10px] h-5', badgeConfig.className)}>
        {badgeConfig.label}
      </Badge>

      {/* Agent count */}
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Users size={12} />
        {agentCount}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stop All — shown when swarm is running */}
      {!isTerminal && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancel}
              className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              aria-label="Stop swarm"
            >
              <Square size={14} fill="currentColor" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop all agents</TooltipContent>
        </Tooltip>
      )}

      {/* Close */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="w-7 h-7"
            aria-label="Close swarm view"
          >
            <X size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close swarm view</TooltipContent>
      </Tooltip>
    </div>
  );
}

export const SwarmToolbar = memo(SwarmToolbarInner);
