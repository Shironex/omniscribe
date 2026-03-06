import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SwarmAgent, SwarmConfig, SwarmTask } from '@omniscribe/shared';

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Top: 'top', Bottom: 'bottom' },
  ReactFlow: () => null,
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

let mockAppUiState: Record<string, unknown>;
let mockTerminalState: Record<string, unknown>;
let mockWorkspaceState: Record<string, unknown>;
let mockSessionState: Record<string, unknown>;
let mockSwarmState: Record<string, unknown>;

vi.mock('@/stores/useAppUIStore', () => ({
  useAppUIStore: vi.fn((selector?: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (state: typeof mockAppUiState) => unknown)(mockAppUiState);
    }
    return mockAppUiState;
  }),
}));

vi.mock('@/stores/useTerminalStore', () => ({
  useTerminalStore: vi.fn((selector?: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (state: typeof mockTerminalState) => unknown)(mockTerminalState);
    }
    return mockTerminalState;
  }),
}));

vi.mock('@/stores/useWorkspaceStore', () => ({
  useWorkspaceStore: vi.fn((selector?: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (state: typeof mockWorkspaceState) => unknown)(mockWorkspaceState);
    }
    return mockWorkspaceState;
  }),
}));

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: vi.fn((selector?: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (state: typeof mockSessionState) => unknown)(mockSessionState);
    }
    return mockSessionState;
  }),
}));

vi.mock('@/stores/useSwarmStore', () => ({
  useSwarmStore: vi.fn((selector?: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (state: typeof mockSwarmState) => unknown)(mockSwarmState);
    }
    return mockSwarmState;
  }),
  selectAgentsForSwarm: () => () => [],
  selectTasksForSwarm: () => () => [],
  selectMessagesForSwarm: () => () => [],
}));

import { SwarmAgentNode } from '../swarm/SwarmAgentNode';
import { SwarmSummaryPanel } from '../swarm/SwarmSummaryPanel';
import { SwarmConfigModal } from '../swarm/SwarmConfigModal';
import { buildGraphElements } from '../swarm/SwarmCanvas';

function createSwarm(overrides: Partial<SwarmConfig> = {}): SwarmConfig {
  return {
    id: 'swarm-1',
    name: 'Test Swarm',
    goal: 'Ship it',
    projectPath: '/project',
    status: 'active',
    strategy: 'hierarchical',
    roles: [{ role: 'lead', count: 1 }],
    memberSessionIds: ['session-1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createAgent(overrides: Partial<SwarmAgent> = {}): SwarmAgent {
  return {
    id: 'agent-1',
    swarmId: 'swarm-1',
    sessionId: 'session-1',
    role: 'builder',
    status: 'active',
    assignedTaskIds: [],
    claimedFiles: [],
    ...overrides,
  };
}

function createTask(overrides: Partial<SwarmTask> = {}): SwarmTask {
  return {
    id: 'task-1',
    swarmId: 'swarm-1',
    subject: 'Build feature',
    status: 'assigned',
    dependsOn: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('swarm components', () => {
  beforeEach(() => {
    mockAppUiState = {
      closeSwarmView: vi.fn(),
    };
    mockTerminalState = {
      setFocusedSessionId: vi.fn(),
    };
    mockWorkspaceState = {
      tabs: [
        {
          id: 'tab-1',
          projectPath: '/project',
          sessionIds: ['session-1'],
        },
      ],
      activeTabId: 'tab-1',
      selectTab: vi.fn(),
    };
    mockSessionState = {
      sessions: [{ id: 'session-1', projectPath: '/project' }],
    };
    mockSwarmState = {
      createSwarm: vi.fn(),
    };
  });

  it('focuses the agent terminal session from the node action', () => {
    render(
      <SwarmAgentNode
        {...({
          id: 'agent-1',
          data: {
            agent: createAgent(),
            label: 'Builder (sess-1)',
            isLead: false,
            taskCount: 2,
            messageCount: 3,
          },
          selected: false,
          draggable: true,
          dragging: false,
          isConnectable: true,
          type: 'swarmAgent',
        } as any)}
      />
    );

    expect(screen.getByText('2 tasks • 3 msgs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));

    expect(mockWorkspaceState.selectTab).toHaveBeenCalledWith('tab-1');
    expect(mockTerminalState.setFocusedSessionId).toHaveBeenCalledWith('session-1');
    expect(mockAppUiState.closeSwarmView).toHaveBeenCalled();
  });

  it('shows completed task results once the swarm finishes', () => {
    render(
      <SwarmSummaryPanel
        swarm={createSwarm({ status: 'done' })}
        agents={[createAgent()]}
        tasks={[
          createTask({ status: 'completed', result: 'Implemented the feature end-to-end.' }),
          createTask({ id: 'task-2', subject: 'Review', status: 'failed' }),
        ]}
      />
    );

    expect(screen.getByText('Results')).toBeTruthy();
    expect(screen.getByText('Implemented the feature end-to-end.')).toBeTruthy();
  });

  it('enforces modal limits and input maxlengths', () => {
    render(<SwarmConfigModal open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('e.g. Auth Feature Sprint').getAttribute('maxlength')).toBe(
      '200'
    );
    expect(
      screen
        .getByPlaceholderText('Describe what the swarm should accomplish...')
        .getAttribute('maxlength')
    ).toBe('4000');

    fireEvent.click(screen.getByRole('button', { name: 'Increase Security count' }));

    expect(screen.getByText('6/6 agents')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Increase Reviewer count' }).hasAttribute('disabled')
    ).toBe(true);
  });

  it('preserves dragged positions and annotates communication edges in the graph builder', () => {
    const lead = createAgent({ id: 'lead-1', role: 'lead', sessionId: 'lead-session' });
    const builder = createAgent({ id: 'builder-1', sessionId: 'builder-session' });
    const previousNodes = [
      {
        id: 'lead-1',
        position: { x: 320, y: 40 },
      },
    ];

    const graph = buildGraphElements(
      [lead, builder],
      [createTask({ id: 'task-1', assignedTo: 'builder-1' })],
      [
        {
          id: 'msg-1',
          swarmId: 'swarm-1',
          fromAgentId: 'lead-1',
          toAgentId: 'builder-1',
          content: 'Build it',
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
        },
      ],
      previousNodes as any
    );

    expect(graph.nodes.find(node => node.id === 'lead-1')?.position).toEqual({ x: 320, y: 40 });
    expect(graph.nodes.find(node => node.id === 'builder-1')?.data.taskCount).toBe(1);
    expect(graph.edges.find(edge => edge.id === 'lead-1-builder-1')?.label).toBe('1 msg');
  });
});
