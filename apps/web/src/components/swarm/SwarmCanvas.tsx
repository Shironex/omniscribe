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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn } from '@/lib/utils';
import type { SwarmAgent } from '@omniscribe/shared';
import { useSwarmStore, selectAgentsForSwarm, selectTasksForSwarm } from '@/stores/useSwarmStore';
import { useAppUIStore } from '@/stores/useAppUIStore';
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

/**
 * Converts swarm agents to React Flow nodes with automatic layout.
 * Lead agent is positioned at top center, workers in a row below.
 */
function buildNodesAndEdges(agents: SwarmAgent[]) {
  const lead = agents.find(a => a.role === 'lead');
  const workers = agents.filter(a => a.role !== 'lead');

  const nodes: SwarmAgentNodeType[] = [];
  const edges: Edge[] = [];

  // Calculate total width of worker row for centering
  const workersWidth =
    workers.length * NODE_WIDTH + Math.max(0, workers.length - 1) * HORIZONTAL_GAP;

  // Lead node: top center
  if (lead) {
    nodes.push({
      id: lead.id,
      type: 'swarmAgent',
      position: {
        x: Math.max(workersWidth / 2 - NODE_WIDTH / 2, 0),
        y: 0,
      },
      data: {
        agent: lead,
        label: `Lead (${lead.sessionId.slice(0, 6)})`,
        isLead: true,
      },
    });
  }

  // Worker nodes: row below lead
  workers.forEach((worker, index) => {
    const x = index * (NODE_WIDTH + HORIZONTAL_GAP);
    const y = NODE_HEIGHT + VERTICAL_GAP;

    nodes.push({
      id: worker.id,
      type: 'swarmAgent',
      position: { x, y },
      data: {
        agent: worker,
        label: `${worker.role.charAt(0).toUpperCase() + worker.role.slice(1)} (${worker.sessionId.slice(0, 6)})`,
        isLead: false,
      },
    });

    // Edge from lead to worker
    if (lead) {
      edges.push({
        id: `${lead.id}-${worker.id}`,
        source: lead.id,
        target: worker.id,
        animated: worker.status === 'active',
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1.5 },
      });
    }
  });

  return { nodes, edges };
}

function SwarmCanvasInner({ swarmId }: SwarmCanvasProps) {
  const swarm = useSwarmStore(state => state.swarms.find(s => s.id === swarmId) ?? null);
  const agentSelector = useMemo(() => selectAgentsForSwarm(swarmId), [swarmId]);
  const agents = useSwarmStore(agentSelector);
  const taskSelector = useMemo(() => selectTasksForSwarm(swarmId), [swarmId]);
  const tasks = useSwarmStore(taskSelector);
  const cancelSwarm = useSwarmStore(state => state.cancelSwarm);
  const closeSwarmView = useAppUIStore(state => state.closeSwarmView);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(agents),
    [agents]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync React Flow internal state when agents change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleCancel = useCallback(() => {
    cancelSwarm(swarmId);
  }, [cancelSwarm, swarmId]);

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
          colorMode="dark"
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
