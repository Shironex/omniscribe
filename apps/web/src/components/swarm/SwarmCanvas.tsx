import { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
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
import {
  SwarmAgentNode,
  SWARM_LEAD_SOURCE_HANDLE_ID,
  SWARM_WORKER_TARGET_HANDLE_ID,
  type SwarmAgentNodeType,
} from './SwarmAgentNode';
import { SwarmToolbar } from './SwarmToolbar';
import { SwarmChatPanel } from './SwarmChatPanel';
import { SwarmSummaryPanel } from './SwarmSummaryPanel';
import { Network } from 'lucide-react';

/** Registered custom node types for React Flow */
const nodeTypes: NodeTypes = {
  swarmAgent: SwarmAgentNode,
};

/** Layout constants */
const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 50;
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
  _tasks: SwarmTask[],
  _messages: SwarmMessage[],
  previousNodes: Node[] = []
) {
  const nodes: SwarmAgentNodeType[] = [];
  const edges: Edge[] = [];
  const previousNodePositions = new Map(previousNodes.map(node => [node.id, node.position]));

  const lead = agents.find(agent => agent.role === 'lead');
  const workers = agents.filter(agent => agent.role !== 'lead');

  if (lead) {
    nodes.push({
      id: lead.id,
      type: 'swarmAgent',
      position: previousNodePositions.get(lead.id) ?? getDefaultPosition(lead, agents),
      data: { agent: lead, isLead: true },
    });
  }

  for (const worker of workers) {
    nodes.push({
      id: worker.id,
      type: 'swarmAgent',
      position: previousNodePositions.get(worker.id) ?? getDefaultPosition(worker, agents),
      data: { agent: worker, isLead: false },
    });

    // Edge from lead to each worker
    if (lead) {
      const isActive = worker.status === 'active' || worker.status === 'spawning';
      edges.push({
        id: `${lead.id}-${worker.id}`,
        source: lead.id,
        sourceHandle: SWARM_LEAD_SOURCE_HANDLE_ID,
        target: worker.id,
        targetHandle: SWARM_WORKER_TARGET_HANDLE_ID,
        type: 'smoothstep',
        animated: isActive,
        style: {
          stroke: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)',
          strokeWidth: isActive ? 2 : 1.5,
        },
      });
    }
  }

  return { nodes, edges };
}

function SwarmCanvasGraph({ swarmId }: SwarmCanvasProps) {
  const swarm = useSwarmStore(state => state.swarms.find(s => s.id === swarmId) ?? null);
  const agentSelector = useMemo(() => selectAgentsForSwarm(swarmId), [swarmId]);
  const agents = useSwarmStore(agentSelector);
  const taskSelector = useMemo(() => selectTasksForSwarm(swarmId), [swarmId]);
  const tasks = useSwarmStore(taskSelector);
  const messageSelector = useMemo(() => selectMessagesForSwarm(swarmId), [swarmId]);
  const messages = useSwarmStore(messageSelector);
  const cancelSwarm = useSwarmStore(state => state.cancelSwarm);
  const closeSwarm = useSwarmStore(state => state.closeSwarm);
  const retrySwarm = useSwarmStore(state => state.retrySwarm);
  const sendMessage = useSwarmStore(state => state.sendMessage);
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

  const { fitView } = useReactFlow();

  /** Ref to track current nodes for position preservation (avoids stale closure) */
  const nodesRef = useRef<Node[]>([]);

  // Keep nodesRef in sync with the latest React Flow node state
  // so buildGraphElements always has up-to-date dragged positions.
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  /** Track previous node count so we can re-fit when new nodes appear */
  const prevNodeCountRef = useRef(0);

  useEffect(() => {
    // Build the graph using the ref-stored nodes so dragged positions are
    // preserved even though `nodes` is excluded from deps (to prevent loops).
    const graph = buildGraphElements(agents, tasks, messages, nodesRef.current);

    // Keep the ref in sync with the latest computed nodes
    nodesRef.current = graph.nodes;

    // Set nodes and edges as separate calls (not nested) to avoid
    // React batching issues where setEdges inside setNodes callback
    // could be skipped or deferred.
    setNodes(graph.nodes);
    setEdges(graph.edges);

    // Re-fit the view when new nodes are added (e.g. workers spawning)
    if (graph.nodes.length > prevNodeCountRef.current) {
      // Small delay to let React Flow measure the new nodes before fitting
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 300 });
      }, 50);
      prevNodeCountRef.current = graph.nodes.length;
      return () => clearTimeout(timer);
    }
    prevNodeCountRef.current = graph.nodes.length;
  }, [agents, tasks, messages, setNodes, setEdges, fitView]);

  const handleCancel = useCallback(() => {
    cancelSwarm(swarmId);
  }, [cancelSwarm, swarmId]);

  const handleCloseSwarm = useCallback(() => {
    closeSwarm(swarmId);
  }, [closeSwarm, swarmId]);

  const handleRetry = useCallback(() => {
    retrySwarm(swarmId);
  }, [retrySwarm, swarmId]);

  const handleSendMessage = useCallback(
    (content: string, toAgentId?: string) => {
      sendMessage(swarmId, content, toAgentId);
    },
    [sendMessage, swarmId]
  );

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
        onCloseSwarm={handleCloseSwarm}
      />

      {/* Summary panel — shown when swarm is done or cancelled */}
      {(swarm.status === 'done' || swarm.status === 'cancelled') && (
        <SwarmSummaryPanel swarm={swarm} agents={agents} tasks={tasks} />
      )}

      {/* Chat / Activity panel */}
      {swarm && (
        <SwarmChatPanel
          swarm={swarm}
          agents={agents}
          messages={messages}
          tasks={tasks}
          onSendMessage={handleSendMessage}
        />
      )}

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

/**
 * SwarmCanvas wrapped with ReactFlowProvider so child components
 * can use useReactFlow() for programmatic fitView, zoom, etc.
 */
function SwarmCanvas({ swarmId }: SwarmCanvasProps) {
  return (
    <ReactFlowProvider>
      <SwarmCanvasGraph swarmId={swarmId} />
    </ReactFlowProvider>
  );
}

export default SwarmCanvas;
