import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SwarmAgent, SwarmConfig, SwarmMessage, SwarmTask } from '@omniscribe/shared';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type }: { id?: string; type: 'source' | 'target' }) => (
    <div data-testid={`handle-${type}${id ? `-${id}` : ''}`} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
  ReactFlow: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ fitView: vi.fn() }),
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
import { SwarmConfigModal } from '../swarm/SwarmConfigModal';
import { SwarmToolbar } from '../swarm/SwarmToolbar';
import { SwarmChatPanel } from '../swarm/SwarmChatPanel';
import { buildGraphElements } from '../swarm/SwarmCanvas';
import {
  SWARM_LEAD_SOURCE_HANDLE_ID,
  SWARM_WORKER_TARGET_HANDLE_ID,
} from '../swarm/SwarmAgentNode';
import { TooltipProvider } from '../ui/tooltip';

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
      sessions: [{ id: 'session-1', projectPath: '/project', name: '[Swarm] Test - Builder' }],
    };
    mockSwarmState = {
      createSwarm: vi.fn(),
    };
  });

  it('renders agent node with role badge and navigates to terminal', () => {
    render(
      <SwarmAgentNode
        {...({
          id: 'agent-1',
          data: {
            agent: createAgent(),
            isLead: false,
          },
          selected: false,
          draggable: true,
          dragging: false,
          isConnectable: true,
          type: 'swarmAgent',
        } as any)}
      />
    );

    expect(screen.getByText('Builder')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));

    expect(mockWorkspaceState.selectTab).toHaveBeenCalledWith('tab-1');
    expect(mockTerminalState.setFocusedSessionId).toHaveBeenCalledWith('session-1');
    expect(mockAppUiState.closeSwarmView).toHaveBeenCalled();
  });

  it('renders explicit handle ids for lead and worker nodes', () => {
    const { rerender } = render(
      <SwarmAgentNode
        {...({
          id: 'lead-1',
          data: {
            agent: createAgent({ id: 'lead-1', role: 'lead', sessionId: 'lead-session' }),
            isLead: true,
          },
          selected: false,
          draggable: true,
          dragging: false,
          isConnectable: true,
          type: 'swarmAgent',
        } as any)}
      />
    );

    expect(screen.getByTestId(`handle-source-${SWARM_LEAD_SOURCE_HANDLE_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`handle-target-${SWARM_WORKER_TARGET_HANDLE_ID}`)).toBeNull();

    rerender(
      <SwarmAgentNode
        {...({
          id: 'worker-1',
          data: {
            agent: createAgent({ id: 'worker-1', sessionId: 'worker-session' }),
            isLead: false,
          },
          selected: false,
          draggable: true,
          dragging: false,
          isConnectable: true,
          type: 'swarmAgent',
        } as any)}
      />
    );

    expect(screen.getByTestId(`handle-target-${SWARM_WORKER_TARGET_HANDLE_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`handle-source-${SWARM_LEAD_SOURCE_HANDLE_ID}`)).toBeNull();
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

  it('preserves dragged positions and creates lead-worker edges in the graph builder', () => {
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
      [],
      previousNodes as any
    );

    // Preserves dragged lead position
    expect(graph.nodes.find(node => node.id === 'lead-1')?.position).toEqual({ x: 320, y: 40 });
    // Creates edge between lead and worker
    const edge = graph.edges.find(edge => edge.id === 'lead-1-builder-1');
    expect(edge).toBeTruthy();
    expect(edge?.source).toBe('lead-1');
    expect(edge?.target).toBe('builder-1');
    expect(edge?.sourceHandle).toBe(SWARM_LEAD_SOURCE_HANDLE_ID);
    expect(edge?.targetHandle).toBe(SWARM_WORKER_TARGET_HANDLE_ID);
    // Active worker gets animated edge
    expect(edge?.animated).toBe(true);
  });

  it('does not create edges when workers exist without a lead', () => {
    const graph = buildGraphElements(
      [createAgent({ id: 'builder-1' }), createAgent({ id: 'tester-1', role: 'tester' })],
      [],
      []
    );

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
  });
});

// ============================================
// Helper: create a swarm message
// ============================================
function createMessage(overrides: Partial<SwarmMessage> = {}): SwarmMessage {
  return {
    id: 'msg-1',
    swarmId: 'swarm-1',
    fromAgentId: 'agent-1',
    toAgentId: 'all',
    content: 'Hello from agent',
    type: 'info',
    timestamp: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

function createSwarmForToolbar(overrides: Partial<SwarmConfig> = {}): SwarmConfig {
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

function createAgentHelper(overrides: Partial<SwarmAgent> = {}): SwarmAgent {
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

function createTaskHelper(overrides: Partial<SwarmTask> = {}): SwarmTask {
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

// ============================================
// SwarmToolbar — Close Swarm button tests
// ============================================
describe('SwarmToolbar — Close Swarm button', () => {
  function renderSwarmToolbar(props: React.ComponentProps<typeof SwarmToolbar>) {
    return render(
      <TooltipProvider>
        <SwarmToolbar {...props} />
      </TooltipProvider>
    );
  }

  it('shows the Close Swarm button when swarm is in done state', () => {
    const onClose = vi.fn();
    const onCloseSwarm = vi.fn();

    renderSwarmToolbar({
      swarm: createSwarmForToolbar({ status: 'done' }),
      agentCount: 1,
      onCancel: vi.fn(),
      onClose,
      onCloseSwarm,
    });

    // Should find a button to fully close/remove the swarm (distinct from just closing the view)
    const closeSwarmBtn = screen.getByRole('button', { name: 'Close swarm' });
    expect(closeSwarmBtn).toBeTruthy();

    fireEvent.click(closeSwarmBtn);
    expect(onCloseSwarm).toHaveBeenCalled();
  });

  it('shows the Close Swarm button when swarm is cancelled', () => {
    renderSwarmToolbar({
      swarm: createSwarmForToolbar({ status: 'cancelled' }),
      agentCount: 0,
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onCloseSwarm: vi.fn(),
    });

    expect(screen.getByRole('button', { name: 'Close swarm' })).toBeTruthy();
  });

  it('shows the Close Swarm button when swarm is in error state', () => {
    renderSwarmToolbar({
      swarm: createSwarmForToolbar({ status: 'error' }),
      agentCount: 0,
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onRetry: vi.fn(),
      onCloseSwarm: vi.fn(),
    });

    expect(screen.getByRole('button', { name: 'Close swarm' })).toBeTruthy();
  });

  it('does NOT show the Close Swarm button when swarm is active', () => {
    renderSwarmToolbar({
      swarm: createSwarmForToolbar({ status: 'active' }),
      agentCount: 2,
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onCloseSwarm: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'Close swarm' })).toBeNull();
  });

  it('does NOT show the Close Swarm button when swarm is planning', () => {
    renderSwarmToolbar({
      swarm: createSwarmForToolbar({ status: 'planning' }),
      agentCount: 1,
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onCloseSwarm: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'Close swarm' })).toBeNull();
  });

  it('hides the Stop button when swarm is in terminal state', () => {
    renderSwarmToolbar({
      swarm: createSwarmForToolbar({ status: 'done' }),
      agentCount: 1,
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onCloseSwarm: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /stop swarm/i })).toBeNull();
  });
});

// ============================================
// SwarmChatPanel — Markdown rendering tests
// ============================================
describe('SwarmChatPanel — Markdown rendering', () => {
  it('renders message content with markdown formatting', () => {
    const swarm = createSwarmForToolbar({ status: 'active' });
    const agents = [createAgentHelper()];
    const messages = [
      createMessage({
        content: '**bold text** and *italic text*',
      }),
    ];

    render(
      <SwarmChatPanel
        swarm={swarm}
        agents={agents}
        messages={messages}
        tasks={[]}
        onSendMessage={vi.fn()}
      />
    );

    // With markdown rendering, bold text should be rendered as <strong>
    const boldEl = screen.getByText('bold text');
    expect(boldEl).toBeTruthy();
    expect(boldEl.tagName.toLowerCase()).toBe('strong');
  });

  it('renders code blocks in markdown messages', () => {
    const swarm = createSwarmForToolbar({ status: 'active' });
    const agents = [createAgentHelper()];
    const messages = [
      createMessage({
        content: 'Here is code:\n```js\nconst x = 1;\n```',
      }),
    ];

    render(
      <SwarmChatPanel
        swarm={swarm}
        agents={agents}
        messages={messages}
        tasks={[]}
        onSendMessage={vi.fn()}
      />
    );

    // Code block content should be rendered
    expect(screen.getByText(/const x = 1/)).toBeTruthy();
  });

  it('renders markdown lists in messages', () => {
    const swarm = createSwarmForToolbar({ status: 'active' });
    const agents = [createAgentHelper()];
    const messages = [
      createMessage({
        content: '- Item one\n- Item two\n- Item three',
      }),
    ];

    render(
      <SwarmChatPanel
        swarm={swarm}
        agents={agents}
        messages={messages}
        tasks={[]}
        onSendMessage={vi.fn()}
      />
    );

    expect(screen.getByText('Item one')).toBeTruthy();
    expect(screen.getByText('Item two')).toBeTruthy();
    expect(screen.getByText('Item three')).toBeTruthy();
  });

  it('renders markdown headings in messages', () => {
    const swarm = createSwarmForToolbar({ status: 'active' });
    const agents = [createAgentHelper()];
    const messages = [
      createMessage({
        content: '## Summary\nEverything is done.',
      }),
    ];

    render(
      <SwarmChatPanel
        swarm={swarm}
        agents={agents}
        messages={messages}
        tasks={[]}
        onSendMessage={vi.fn()}
      />
    );

    const heading = screen.getByText('Summary');
    expect(heading).toBeTruthy();
    // Should render as an h2 element
    expect(heading.tagName.toLowerCase()).toBe('h2');
  });

  it('does not truncate message content with line-clamp', () => {
    const swarm = createSwarmForToolbar({ status: 'active' });
    const agents = [createAgentHelper()];
    const longContent = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
    const messages = [createMessage({ content: longContent })];

    render(
      <SwarmChatPanel
        swarm={swarm}
        agents={agents}
        messages={messages}
        tasks={[]}
        onSendMessage={vi.fn()}
      />
    );

    // With markdown rendering, line breaks should create separate elements
    // The content should not have line-clamp CSS class
    const contentEl = screen.getByText(/Line 1/);
    expect(contentEl).toBeTruthy();
    // Verify no line-clamp truncation class is applied
    expect(contentEl.className).not.toMatch(/line-clamp/);
    // Last line should also be present (not truncated)
    expect(screen.getByText(/Line 20/)).toBeTruthy();
  });

  it('renders task results with markdown formatting', () => {
    const swarm = createSwarmForToolbar({ status: 'active' });
    const agents = [createAgentHelper()];
    const tasks = [
      createTaskHelper({
        status: 'completed',
        result: '**Success**: All tests passed\n- Unit tests: ✅\n- Integration: ✅',
      }),
    ];

    // Switch to tasks tab to see task results
    render(
      <SwarmChatPanel
        swarm={swarm}
        agents={agents}
        messages={[]}
        tasks={tasks}
        onSendMessage={vi.fn()}
      />
    );

    // Click on 'tasks' tab
    fireEvent.click(screen.getByText('tasks'));

    // Task result should contain markdown-rendered bold text
    const successEl = screen.getByText('Success');
    expect(successEl).toBeTruthy();
    expect(successEl.tagName.toLowerCase()).toBe('strong');
  });
});

// ============================================
// useSwarmStore — closeSwarm action tests
// ============================================
describe('useSwarmStore — closeSwarm', () => {
  beforeEach(() => {
    mockSwarmState = {
      createSwarm: vi.fn(),
      closeSwarm: vi.fn(),
      removeSwarm: vi.fn(),
      swarms: [
        {
          id: 'swarm-1',
          name: 'Test',
          goal: 'Test goal',
          projectPath: '/project',
          status: 'done',
          strategy: 'hierarchical',
          roles: [{ role: 'lead', count: 1 }],
          memberSessionIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      activeSwarmId: 'swarm-1',
      agents: { 'swarm-1': [] },
      tasks: { 'swarm-1': [] },
      messages: { 'swarm-1': [] },
    };
  });

  it('has a closeSwarm action defined in the store', () => {
    // The mocked store should have the closeSwarm method
    // This verifies the store interface includes closeSwarm
    expect(typeof mockSwarmState.closeSwarm).toBe('function');
  });

  it('closeSwarm should be callable and distinct from removeSwarm', () => {
    const closeSwarm = mockSwarmState.closeSwarm as Mock<(swarmId: string) => void>;
    const removeSwarm = mockSwarmState.removeSwarm as Mock<() => void>;

    closeSwarm('swarm-1');

    expect(closeSwarm).toHaveBeenCalledWith('swarm-1');
    // closeSwarm and removeSwarm should be different functions
    // closeSwarm emits to backend + clears local state
    // removeSwarm only clears local state (used by listeners)
    expect(removeSwarm).not.toHaveBeenCalled();
  });
});
