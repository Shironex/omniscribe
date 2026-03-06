import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn } from '@/lib/utils';
import type { SwarmAgent, SwarmMessage, SwarmTask } from '@omniscribe/shared';
import {
  useSwarmStore,
  selectAgentsForSwarm,
  selectMessagesForSwarm,
  selectTasksForSwarm,
} from '@/stores/useSwarmStore';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getPluginTheme } from '@/stores/usePluginStore';
import { themeOptions } from '@/lib/theme';
import { SwarmAgentNode, type SwarmAgentNodeType } from './SwarmAgentNode';
import { SwarmToolbar } from './SwarmToolbar';
import { SwarmSummaryPanel } from './SwarmSummaryPanel';
import { Network } from 'lucide-react';

/** Registered custom node types for React Flow */
const nodeTypes: NodeTypes = {
  swarmAgent: SwarmAgentNode,
};

/** Layout constants */
const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const HORIZONTAL_GAP = 40;
const VERTICAL_GAP = 100;

interface SwarmCanvasProps {
  swarmId: string;
}

function getDefaultPosition(agent: SwarmAgent, agents: SwarmAgent[]) {
  const lead = agents.find(a => a.role === 'lead');
  const workers = agents.filter(a => a.role !== 'lead');
  const workersWidth =
    workers.length * NODE_WIDTH + Math.max(0, workers.length - 1) * HORIZONTAL_GAP;

  if (agent.id === lead?.id) {
    return {
      x: Math.max(workersWidth / 2 - NODE_WIDTH / 2, 0),
      y: 0,
    };
  }

  const workerIndex = workers.findIndex(worker => worker.id === agent.id);
  return {
    x: Math.max(workerIndex, 0) * (NODE_WIDTH + HORIZONTAL_GAP),
    y: NODE_HEIGHT + VERTICAL_GAP,
  };
}

export function buildGraphElements(
  agents: SwarmAgent[],
  tasks: SwarmTask[],
  messages: SwarmMessage[],
  previousNodes: Node[] = []
) {
  const nodes: SwarmAgentNodeType[] = [];
  const edges: Edge[] = [];
  const previousNodePositions = new Map(previousNodes.map(node => [node.id, node.position]));
  const taskCounts = new Map<string, number>();
  const messageCounts = new Map<string, number>();
  const communicationPairs = new Map<string, { count: number; source: string; target: string }>();

  for (const task of tasks) {
    if (!task.assignedTo) continue;
    taskCounts.set(task.assignedTo, (taskCounts.get(task.assignedTo) ?? 0) + 1);
  }

  for (const message of messages) {
    messageCounts.set(message.fromAgentId, (messageCounts.get(message.fromAgentId) ?? 0) + 1);
    if (message.toAgentId !== 'all') {
      messageCounts.set(message.toAgentId, (messageCounts.get(message.toAgentId) ?? 0) + 1);
      const pairKey = [message.fromAgentId, message.toAgentId].sort().join(':');
      const existing = communicationPairs.get(pairKey);
      communicationPairs.set(pairKey, {
        count: (existing?.count ?? 0) + 1,
        source: existing?.source ?? message.fromAgentId,
        target: existing?.target ?? message.toAgentId,
      });
    }
  }

  const lead = agents.find(agent => agent.role === 'lead');
  const workers = agents.filter(agent => agent.role !== 'lead');
  if (lead) {
    nodes.push({
      id: lead.id,
      type: 'swarmAgent',
      position: previousNodePositions.get(lead.id) ?? getDefaultPosition(lead, agents),
      data: {
        agent: lead,
        label: `Lead (${lead.sessionId.slice(0, 6)})`,
        isLead: true,
        taskCount: taskCounts.get(lead.id) ?? lead.assignedTaskIds.length,
        messageCount: messageCounts.get(lead.id) ?? 0,
      },
    });
  }

  workers.forEach(worker => {
    nodes.push({
      id: worker.id,
      type: 'swarmAgent',
      position: previousNodePositions.get(worker.id) ?? getDefaultPosition(worker, agents),
      data: {
        agent: worker,
        label: `${worker.role.charAt(0).toUpperCase() + worker.role.slice(1)} (${worker.sessionId.slice(0, 6)})`,
        isLead: false,
        taskCount: taskCounts.get(worker.id) ?? worker.assignedTaskIds.length,
        messageCount: messageCounts.get(worker.id) ?? 0,
      },
    });

    if (lead) {
      const pairKey = [lead.id, worker.id].sort().join(':');
      const communication = communicationPairs.get(pairKey);
      edges.push({
        id: `${lead.id}-${worker.id}`,
        source: lead.id,
        target: worker.id,
        animated: worker.status === 'active' || Boolean(communication),
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1.5 },
        ...(communication && {
          label: `${communication.count} msg${communication.count === 1 ? '' : 's'}`,
        }),
      });
      communicationPairs.delete(pairKey);
    }
  });

  for (const [pairKey, communication] of communicationPairs) {
    if (
      !agents.some(agent => agent.id === communication.source || agent.id === communication.target)
    ) {
      continue;
    }

    edges.push({
      id: `message-${pairKey}`,
      source: communication.source,
      target: communication.target,
      animated: true,
      label: `${communication.count} msg${communication.count === 1 ? '' : 's'}`,
      style: {
        stroke: 'hsl(var(--primary))',
        strokeWidth: 1.5,
        strokeDasharray: '6 4',
      },
    });
  }

  return { nodes, edges };
}

function SwarmCanvasInner({ swarmId }: SwarmCanvasProps) {
  const swarm = useSwarmStore(state => state.swarms.find(s => s.id === swarmId) ?? null);
  const agentSelector = useMemo(() => selectAgentsForSwarm(swarmId), [swarmId]);
  const agents = useSwarmStore(agentSelector);
  const taskSelector = useMemo(() => selectTasksForSwarm(swarmId), [swarmId]);
  const tasks = useSwarmStore(taskSelector);
  const messageSelector = useMemo(() => selectMessagesForSwarm(swarmId), [swarmId]);
  const messages = useSwarmStore(messageSelector);
  const cancelSwarm = useSwarmStore(state => state.cancelSwarm);
  const retrySwarm = useSwarmStore(state => state.retrySwarm);
  const closeSwarmView = useAppUIStore(state => state.closeSwarmView);
  const theme = useSettingsStore(state => state.theme);

  const colorMode = useMemo(
    () =>
      (themeOptions.find(option => option.value === theme)?.isDark ??
      getPluginTheme(theme)?.isDark ??
      true)
        ? 'dark'
        : 'light',
    [theme]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<SwarmAgentNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(currentNodes => {
      const graph = buildGraphElements(agents, tasks, messages, currentNodes);
      setEdges(graph.edges);
      return graph.nodes;
    });
  }, [agents, tasks, messages, setNodes, setEdges]);

  const handleCancel = useCallback(() => {
    cancelSwarm(swarmId);
  }, [cancelSwarm, swarmId]);

  const handleRetry = useCallback(() => {
    retrySwarm(swarmId);
  }, [retrySwarm, swarmId]);

  // Empty state
  if (!swarm) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/95">
        <p className="text-muted-foreground">Swarm not found</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 bg-background">
      {/* Toolbar */}
      <SwarmToolbar
        swarm={swarm}
        agentCount={agents.length}
        onCancel={handleCancel}
        onRetry={swarm.status === 'error' ? handleRetry : undefined}
        onClose={closeSwarmView}
      />

      {/* Summary panel */}
      {swarm && <SwarmSummaryPanel swarm={swarm} agents={agents} tasks={tasks} />}

      {/* Graph canvas */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <Network size={48} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Waiting for agents to spawn...</p>
          <p className="text-xs text-muted-foreground/60">
            The lead agent will start first, then spawn workers
          </p>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          colorMode={colorMode}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls
            className={cn(
              '[&>button]:bg-card [&>button]:border-border [&>button]:text-foreground',
              '[&>button:hover]:bg-accent'
            )}
            showInteractive={false}
          />
        </ReactFlow>
      )}
    </div>
  );
}

export default SwarmCanvasInner;
