import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { SwarmAgent, SwarmRole } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';

/** Data carried by each agent node */
export interface SwarmAgentNodeData extends Record<string, unknown> {
  agent: SwarmAgent;
  isLead: boolean;
}

export type SwarmAgentNodeType = Node<SwarmAgentNodeData, 'swarmAgent'>;

export const SWARM_LEAD_SOURCE_HANDLE_ID = 'lead-out';
export const SWARM_WORKER_TARGET_HANDLE_ID = 'worker-in';

/** Status indicator color mapping */
const STATUS_COLORS: Record<SwarmAgent['status'], string> = {
  pending: 'bg-muted-foreground/60',
  spawning: 'bg-yellow-500',
  active: 'bg-green-500',
  idle: 'bg-blue-500',
  error: 'bg-destructive',
  stopped: 'bg-muted-foreground',
};

/** Role badge color mapping */
const ROLE_COLORS: Record<SwarmRole, string> = {
  lead: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  builder: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  reviewer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  architect: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  tester: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  security: 'bg-red-500/20 text-red-400 border-red-500/30',
};

/** Role display labels */
const ROLE_LABELS: Record<SwarmRole, string> = {
  lead: 'Lead',
  builder: 'Builder',
  reviewer: 'Reviewer',
  architect: 'Architect',
  tester: 'Tester',
  security: 'Security',
};

function SwarmAgentNodeInner({ data }: NodeProps<SwarmAgentNodeType>) {
  const { agent, isLead } = data;
  const statusColor = STATUS_COLORS[agent.status];
  const roleColor = ROLE_COLORS[agent.role] ?? 'bg-muted text-muted-foreground border-border';
  const closeSwarmView = useAppUIStore(state => state.closeSwarmView);
  const setFocusedSessionId = useTerminalStore(state => state.setFocusedSessionId);
  const selectTab = useWorkspaceStore(state => state.selectTab);
  const tabs = useWorkspaceStore(state => state.tabs);
  const activeTabId = useWorkspaceStore(state => state.activeTabId);
  const session = useSessionStore(
    state => state.sessions.find(s => s.id === agent.sessionId) ?? null
  );

  const targetTabId =
    tabs.find(tab => tab.sessionIds.includes(agent.sessionId))?.id ??
    tabs.find(tab => session?.projectPath && tab.projectPath === session.projectPath)?.id ??
    activeTabId;

  // Derive a short display name from the session name or role
  const displayName = session?.name
    ? session.name
        .replace(/^\[Swarm\]\s*/, '')
        .replace(/\s*-\s*(Lead|Builder|Reviewer|Architect|Tester|Security)$/i, '')
    : agent.sessionId.slice(0, 8);

  return (
    <div
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-md',
        'w-[160px] px-3 py-2.5',
        'transition-shadow hover:shadow-lg',
        agent.status === 'error' && 'border-destructive/50',
        isLead && 'border-purple-500/30'
      )}
    >
      {/* Target handle (top) — workers receive edges from lead */}
      {!isLead && (
        <Handle
          id={SWARM_WORKER_TARGET_HANDLE_ID}
          type="target"
          position={Position.Top}
          className="w-2! h-2! bg-muted-foreground! border-background!"
        />
      )}

      {/* Header: role badge + status */}
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 h-5 font-medium', roleColor)}
        >
          {ROLE_LABELS[agent.role] ?? agent.role}
        </Badge>

        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'w-2 h-2 rounded-full shrink-0',
              statusColor,
              agent.status === 'active' && 'animate-pulse'
            )}
            title={agent.status}
          />
          <span className="text-[10px] text-muted-foreground capitalize">{agent.status}</span>
        </span>
      </div>

      {/* Swarm name + terminal link */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-muted-foreground truncate" title={displayName}>
          {displayName}
        </p>
        {agent.sessionId && (
          <button
            className="flex items-center gap-0.5 text-[10px] text-primary hover:underline cursor-pointer shrink-0 ml-1.5"
            title="Focus terminal session"
            onClick={() => {
              if (targetTabId) {
                selectTab(targetTabId);
              }
              setFocusedSessionId(agent.sessionId);
              closeSwarmView();
            }}
          >
            <ExternalLink size={10} />
          </button>
        )}
      </div>

      {/* Source handle (bottom) — lead sends edges to workers */}
      {isLead && (
        <Handle
          id={SWARM_LEAD_SOURCE_HANDLE_ID}
          type="source"
          position={Position.Bottom}
          className="w-2! h-2! bg-primary! border-background!"
        />
      )}
    </div>
  );
}

export const SwarmAgentNode = memo(SwarmAgentNodeInner);
