import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_SWARM_MESSAGES, type SwarmMessage } from '@omniscribe/shared';
import { mockSocket } from '../../test/mocks/socket';

vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

vi.mock('../useAppUIStore', () => ({
  useAppUIStore: {
    getState: () => ({
      openSwarmView: vi.fn(),
    }),
  },
}));

import { useSwarmStore } from '../useSwarmStore';

const initialState = {
  swarms: [],
  activeSwarmId: null,
  agents: {},
  tasks: {},
  messages: {},
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useSwarmStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    useSwarmStore.setState(initialState);
  });

  it('caps retained messages per swarm', () => {
    for (let index = 0; index < MAX_SWARM_MESSAGES + 5; index += 1) {
      const message: SwarmMessage = {
        id: `msg-${index}`,
        swarmId: 'swarm-1',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        content: `message-${index}`,
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
      };
      useSwarmStore.getState().addMessage({ swarmId: 'swarm-1', message });
    }

    const messages = useSwarmStore.getState().messages['swarm-1'];
    expect(messages).toHaveLength(MAX_SWARM_MESSAGES);
    expect(messages?.[0]?.id).toBe('msg-5');
    expect(messages?.[messages.length - 1]?.id).toBe(`msg-${MAX_SWARM_MESSAGES + 4}`);
  });

  it('retries an errored swarm by emitting a new create request with the same config', () => {
    useSwarmStore.setState({
      swarms: [
        {
          id: 'swarm-1',
          name: 'Retry Me',
          goal: 'Ship the feature',
          projectPath: '/project',
          status: 'error',
          strategy: 'hierarchical',
          roles: [
            { role: 'lead', count: 1 },
            { role: 'builder', count: 2 },
          ],
          memberSessionIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    useSwarmStore.getState().retrySwarm('swarm-1');

    expect(mockSocket.emit).toHaveBeenCalledWith('swarm:create', {
      name: 'Retry Me',
      goal: 'Ship the feature',
      projectPath: '/project',
      roles: [
        { role: 'lead', count: 1 },
        { role: 'builder', count: 2 },
      ],
    });
  });
});
