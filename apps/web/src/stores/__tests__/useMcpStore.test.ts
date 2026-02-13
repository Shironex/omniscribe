import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';

// Mock the socket module
vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

const mockEmitAsync = vi.fn();
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: (...args: unknown[]) => mockEmitAsync(...args),
}));

import {
  useMcpStore,
  selectServers,
  selectServerById,
  selectServerStateById,
  selectConnectedServers,
  selectAllTools,
  selectAllResources,
  selectMcpDiscovering,
  selectMcpError,
  selectInternalMcp,
} from '../useMcpStore';
import type { McpServerConfig, McpServerState, McpTool, McpResource } from '@omniscribe/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: `srv-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Server',
    transport: 'stdio',
    enabled: true,
    autoConnect: true,
    ...overrides,
  };
}

function createMockServerState(overrides: Partial<McpServerState> = {}): McpServerState {
  return {
    config: createMockServer(),
    status: 'connected',
    tools: [],
    resources: [],
    prompts: [],
    ...overrides,
  };
}

function createMockTool(overrides: Partial<McpTool> = {}): McpTool {
  return {
    name: `tool-${Math.random().toString(36).slice(2, 8)}`,
    description: 'A test tool',
    inputSchema: {},
    serverId: 'srv-1',
    ...overrides,
  };
}

function createMockResource(overrides: Partial<McpResource> = {}): McpResource {
  return {
    uri: `resource://${Math.random().toString(36).slice(2, 8)}`,
    name: `resource-${Math.random().toString(36).slice(2, 8)}`,
    serverId: 'srv-1',
    ...overrides,
  };
}

const initialState = {
  servers: [],
  serverStates: {},
  isDiscovering: false,
  internalMcp: { available: false, path: null },
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMcpStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useMcpStore.setState(initialState);
  });

  afterEach(() => {
    const state = useMcpStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe('initial state', () => {
    it('has empty servers array', () => {
      expect(useMcpStore.getState().servers).toEqual([]);
    });

    it('has empty serverStates object', () => {
      expect(useMcpStore.getState().serverStates).toEqual({});
    });

    it('has isDiscovering set to false', () => {
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });

    it('has internalMcp with default values', () => {
      expect(useMcpStore.getState().internalMcp).toEqual({
        available: false,
        path: null,
      });
    });

    it('is not loading', () => {
      expect(useMcpStore.getState().isLoading).toBe(false);
    });

    it('has no error', () => {
      expect(useMcpStore.getState().error).toBeNull();
    });

    it('has listeners not initialized', () => {
      expect(useMcpStore.getState().listenersInitialized).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setServers
  // -----------------------------------------------------------------------

  describe('setServers', () => {
    it('sets the servers list', () => {
      const servers = [createMockServer({ id: 'srv-1' }), createMockServer({ id: 'srv-2' })];
      useMcpStore.getState().setServers(servers);

      expect(useMcpStore.getState().servers).toEqual(servers);
      expect(useMcpStore.getState().servers).toHaveLength(2);
    });

    it('replaces existing servers', () => {
      useMcpStore.setState({ servers: [createMockServer({ id: 'old' })] });

      const newServers = [createMockServer({ id: 'new-1' })];
      useMcpStore.getState().setServers(newServers);

      expect(useMcpStore.getState().servers).toHaveLength(1);
      expect(useMcpStore.getState().servers[0].id).toBe('new-1');
    });

    it('can set an empty list', () => {
      useMcpStore.setState({ servers: [createMockServer()] });
      useMcpStore.getState().setServers([]);

      expect(useMcpStore.getState().servers).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // updateServerState
  // -----------------------------------------------------------------------

  describe('updateServerState', () => {
    it('adds a new server state entry', () => {
      const serverState = createMockServerState({ status: 'connected' });
      useMcpStore.getState().updateServerState('srv-1', serverState);

      expect(useMcpStore.getState().serverStates['srv-1']).toEqual(serverState);
    });

    it('updates an existing server state entry', () => {
      const initialServerState = createMockServerState({ status: 'connecting' });
      useMcpStore.setState({ serverStates: { 'srv-1': initialServerState } });

      const updatedState = createMockServerState({ status: 'connected' });
      useMcpStore.getState().updateServerState('srv-1', updatedState);

      expect(useMcpStore.getState().serverStates['srv-1'].status).toBe('connected');
    });

    it('does not affect other server states', () => {
      const state1 = createMockServerState({ status: 'connected' });
      const state2 = createMockServerState({ status: 'disconnected' });
      useMcpStore.setState({ serverStates: { 'srv-1': state1, 'srv-2': state2 } });

      const newState1 = createMockServerState({ status: 'error' });
      useMcpStore.getState().updateServerState('srv-1', newState1);

      expect(useMcpStore.getState().serverStates['srv-1'].status).toBe('error');
      expect(useMcpStore.getState().serverStates['srv-2'].status).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // updateServerStatus
  // -----------------------------------------------------------------------

  describe('updateServerStatus', () => {
    it('updates status of an existing server state', () => {
      const serverState = createMockServerState({ status: 'connecting' });
      useMcpStore.setState({ serverStates: { 'srv-1': serverState } });

      useMcpStore.getState().updateServerStatus('srv-1', 'connected');

      expect(useMcpStore.getState().serverStates['srv-1'].status).toBe('connected');
    });

    it('updates errorMessage along with status', () => {
      const serverState = createMockServerState({ status: 'connecting' });
      useMcpStore.setState({ serverStates: { 'srv-1': serverState } });

      useMcpStore.getState().updateServerStatus('srv-1', 'error', 'Connection refused');

      const state = useMcpStore.getState().serverStates['srv-1'];
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Connection refused');
    });

    it('ignores status update for unknown server', () => {
      useMcpStore.getState().updateServerStatus('unknown-srv', 'connected');

      expect(useMcpStore.getState().serverStates['unknown-srv']).toBeUndefined();
    });

    it('does not modify other server states', () => {
      const state1 = createMockServerState({ status: 'connecting' });
      const state2 = createMockServerState({ status: 'connected' });
      useMcpStore.setState({ serverStates: { 'srv-1': state1, 'srv-2': state2 } });

      useMcpStore.getState().updateServerStatus('srv-1', 'connected');

      expect(useMcpStore.getState().serverStates['srv-2'].status).toBe('connected');
    });

    it('preserves existing state properties when updating status', () => {
      const tools = [createMockTool({ name: 'my-tool' })];
      const serverState = createMockServerState({ status: 'connecting', tools });
      useMcpStore.setState({ serverStates: { 'srv-1': serverState } });

      useMcpStore.getState().updateServerStatus('srv-1', 'connected');

      const updated = useMcpStore.getState().serverStates['srv-1'];
      expect(updated.tools).toEqual(tools);
      expect(updated.status).toBe('connected');
    });
  });

  // -----------------------------------------------------------------------
  // setDiscovering
  // -----------------------------------------------------------------------

  describe('setDiscovering', () => {
    it('sets isDiscovering to true', () => {
      useMcpStore.getState().setDiscovering(true);
      expect(useMcpStore.getState().isDiscovering).toBe(true);
    });

    it('sets isDiscovering to false', () => {
      useMcpStore.setState({ isDiscovering: true });
      useMcpStore.getState().setDiscovering(false);
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('resets servers to empty array', () => {
      useMcpStore.setState({ servers: [createMockServer()] });
      useMcpStore.getState().clear();
      expect(useMcpStore.getState().servers).toEqual([]);
    });

    it('resets serverStates to empty object', () => {
      useMcpStore.setState({
        serverStates: { 'srv-1': createMockServerState() },
      });
      useMcpStore.getState().clear();
      expect(useMcpStore.getState().serverStates).toEqual({});
    });

    it('resets isDiscovering to false', () => {
      useMcpStore.setState({ isDiscovering: true });
      useMcpStore.getState().clear();
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });

    it('resets error to null', () => {
      useMcpStore.setState({ error: 'some error' });
      useMcpStore.getState().clear();
      expect(useMcpStore.getState().error).toBeNull();
    });

    it('does not reset internalMcp', () => {
      useMcpStore.setState({ internalMcp: { available: true, path: '/some/path' } });
      useMcpStore.getState().clear();
      // clear() does not include internalMcp in its reset
      expect(useMcpStore.getState().internalMcp).toEqual({ available: true, path: '/some/path' });
    });
  });

  // -----------------------------------------------------------------------
  // discoverServers
  // -----------------------------------------------------------------------

  describe('discoverServers', () => {
    it('sets isDiscovering to true while discovering', async () => {
      mockEmitAsync.mockResolvedValue({ servers: [] });

      const promise = useMcpStore.getState().discoverServers();

      // isDiscovering should be true during the operation
      expect(useMcpStore.getState().isDiscovering).toBe(true);

      await promise;
    });

    it('clears error before discovering', async () => {
      useMcpStore.setState({ error: 'previous error' });
      mockEmitAsync.mockResolvedValue({ servers: [] });

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().error).toBeNull();
    });

    it('sets servers on successful discovery', async () => {
      const servers = [createMockServer({ id: 'srv-1' }), createMockServer({ id: 'srv-2' })];
      mockEmitAsync.mockResolvedValue({ servers });

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().servers).toEqual(servers);
      expect(useMcpStore.getState().isDiscovering).toBe(false);
      expect(useMcpStore.getState().error).toBeNull();
    });

    it('passes projectPath to emitAsync', async () => {
      mockEmitAsync.mockResolvedValue({ servers: [] });

      await useMcpStore.getState().discoverServers('/my/project');

      expect(mockEmitAsync).toHaveBeenCalledWith('mcp:discover', { projectPath: '/my/project' });
    });

    it('handles empty servers in response', async () => {
      mockEmitAsync.mockResolvedValue({ servers: [] });

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().servers).toEqual([]);
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });

    it('handles undefined servers in response', async () => {
      mockEmitAsync.mockResolvedValue({});

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().servers).toEqual([]);
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });

    it('sets error when response contains error', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'Discovery failed: no config found' });

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().error).toBe('Discovery failed: no config found');
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });

    it('does not update servers when response contains error', async () => {
      const existingServers = [createMockServer({ id: 'existing' })];
      useMcpStore.setState({ servers: existingServers });
      mockEmitAsync.mockResolvedValue({ error: 'fail' });

      await useMcpStore.getState().discoverServers();

      // Servers should remain unchanged
      expect(useMcpStore.getState().servers).toEqual(existingServers);
    });

    it('sets error message on exception', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Network timeout'));

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().error).toBe('Network timeout');
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });

    it('sets fallback error message for non-Error exceptions', async () => {
      mockEmitAsync.mockRejectedValue('some string error');

      await useMcpStore.getState().discoverServers();

      expect(useMcpStore.getState().error).toBe('Discovery failed');
      expect(useMcpStore.getState().isDiscovering).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // fetchInternalMcpStatus
  // -----------------------------------------------------------------------

  describe('fetchInternalMcpStatus', () => {
    it('emits socket event to fetch internal MCP status', () => {
      useMcpStore.getState().fetchInternalMcpStatus();

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'mcp:get-internal-status',
        {},
        expect.any(Function)
      );
    });

    it('updates internalMcp state when callback is invoked', () => {
      useMcpStore.getState().fetchInternalMcpStatus();

      // Extract the callback from the emit call
      const callback = mockSocket.emit.mock.calls[0][2] as (response: unknown) => void;
      callback({ available: true, path: '/usr/local/bin/mcp-server' });

      expect(useMcpStore.getState().internalMcp).toEqual({
        available: true,
        path: '/usr/local/bin/mcp-server',
      });
    });

    it('handles unavailable response', () => {
      useMcpStore.getState().fetchInternalMcpStatus();

      const callback = mockSocket.emit.mock.calls[0][2] as (response: unknown) => void;
      callback({ available: false, path: null });

      expect(useMcpStore.getState().internalMcp).toEqual({
        available: false,
        path: null,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Socket listeners
  // -----------------------------------------------------------------------

  describe('socket listeners', () => {
    describe('initListeners', () => {
      it('registers socket listeners', () => {
        useMcpStore.getState().initListeners();

        expect(mockSocket.on).toHaveBeenCalledWith('mcp:servers:discovered', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('mcp:status', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('mcp:state', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      });

      it('sets listenersInitialized to true', () => {
        useMcpStore.getState().initListeners();
        expect(useMcpStore.getState().listenersInitialized).toBe(true);
      });

      it('does not register listeners twice', () => {
        useMcpStore.getState().initListeners();
        const callCount = mockSocket.on.mock.calls.length;

        useMcpStore.getState().initListeners();
        expect(mockSocket.on.mock.calls.length).toBe(callCount);
      });
    });

    describe('cleanupListeners', () => {
      it('removes socket listeners', () => {
        useMcpStore.getState().initListeners();
        useMcpStore.getState().cleanupListeners();

        expect(mockSocket.off).toHaveBeenCalledWith('mcp:servers:discovered', expect.any(Function));
        expect(mockSocket.off).toHaveBeenCalledWith('mcp:status', expect.any(Function));
        expect(mockSocket.off).toHaveBeenCalledWith('mcp:state', expect.any(Function));
        expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(mockSocket.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
      });

      it('sets listenersInitialized to false', () => {
        useMcpStore.getState().initListeners();
        useMcpStore.getState().cleanupListeners();
        expect(useMcpStore.getState().listenersInitialized).toBe(false);
      });
    });

    describe('mcp:servers:discovered event', () => {
      it('updates servers when event is received', () => {
        useMcpStore.getState().initListeners();

        const servers = [createMockServer({ id: 'srv-1' })];
        mockSocket.__simulateEvent('mcp:servers:discovered', { servers });

        expect(useMcpStore.getState().servers).toEqual(servers);
      });
    });

    describe('mcp:status event', () => {
      it('updates server status when event is received', () => {
        const serverState = createMockServerState({ status: 'connecting' });
        useMcpStore.setState({ serverStates: { 'srv-1': serverState } });
        useMcpStore.getState().initListeners();

        mockSocket.__simulateEvent('mcp:status', {
          serverId: 'srv-1',
          status: 'connected',
        });

        expect(useMcpStore.getState().serverStates['srv-1'].status).toBe('connected');
      });

      it('updates errorMessage in status event', () => {
        const serverState = createMockServerState({ status: 'connecting' });
        useMcpStore.setState({ serverStates: { 'srv-1': serverState } });
        useMcpStore.getState().initListeners();

        mockSocket.__simulateEvent('mcp:status', {
          serverId: 'srv-1',
          status: 'error',
          errorMessage: 'Timeout',
        });

        const state = useMcpStore.getState().serverStates['srv-1'];
        expect(state.status).toBe('error');
        expect(state.errorMessage).toBe('Timeout');
      });
    });

    describe('mcp:state event', () => {
      it('updates server state when event is received', () => {
        useMcpStore.getState().initListeners();

        const serverState = createMockServerState({
          status: 'connected',
          tools: [createMockTool({ name: 'read-file' })],
        });
        mockSocket.__simulateEvent('mcp:state', {
          serverId: 'srv-1',
          state: serverState,
        });

        expect(useMcpStore.getState().serverStates['srv-1']).toEqual(serverState);
      });
    });

    describe('connect event (onConnect)', () => {
      it('calls discoverServers on connect when not recovered', async () => {
        mockEmitAsync.mockResolvedValue({ servers: [] });
        mockSocket.recovered = false;
        useMcpStore.getState().initListeners();

        mockSocket.__simulateEvent('connect');

        expect(mockEmitAsync).toHaveBeenCalled();
      });

      it('skips discoverServers on connect when socket.recovered is true', () => {
        mockSocket.recovered = true;
        useMcpStore.getState().initListeners();

        mockSocket.__simulateEvent('connect');

        expect(mockEmitAsync).not.toHaveBeenCalled();
      });

      it('clears error on connect', () => {
        useMcpStore.setState({ error: 'previous error' });
        useMcpStore.getState().initListeners();

        mockSocket.__simulateEvent('connect');

        expect(useMcpStore.getState().error).toBeNull();
      });
    });

    describe('connect_error event', () => {
      it('sets error on connection error', () => {
        useMcpStore.getState().initListeners();

        mockSocket.__simulateEvent('connect_error', new Error('Connection refused'));

        expect(useMcpStore.getState().error).toBe('Connection error: Connection refused');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Selectors
  // -----------------------------------------------------------------------

  describe('selectors', () => {
    describe('selectServers', () => {
      it('returns the servers array', () => {
        const servers = [createMockServer({ id: 'srv-1' })];
        useMcpStore.setState({ servers });

        expect(selectServers(useMcpStore.getState())).toEqual(servers);
      });
    });

    describe('selectServerById', () => {
      it('returns the matching server', () => {
        const servers = [
          createMockServer({ id: 'srv-1', name: 'Server 1' }),
          createMockServer({ id: 'srv-2', name: 'Server 2' }),
        ];
        useMcpStore.setState({ servers });

        const result = selectServerById('srv-2')(useMcpStore.getState());
        expect(result?.id).toBe('srv-2');
        expect(result?.name).toBe('Server 2');
      });

      it('returns undefined for non-existent server', () => {
        useMcpStore.setState({ servers: [createMockServer({ id: 'srv-1' })] });

        const result = selectServerById('non-existent')(useMcpStore.getState());
        expect(result).toBeUndefined();
      });
    });

    describe('selectServerStateById', () => {
      it('returns the matching server state', () => {
        const state = createMockServerState({ status: 'connected' });
        useMcpStore.setState({ serverStates: { 'srv-1': state } });

        const result = selectServerStateById('srv-1')(useMcpStore.getState());
        expect(result).toEqual(state);
        expect(result?.status).toBe('connected');
      });

      it('returns undefined for non-existent server state', () => {
        const result = selectServerStateById('non-existent')(useMcpStore.getState());
        expect(result).toBeUndefined();
      });
    });

    describe('selectConnectedServers', () => {
      it('returns only servers with connected status', () => {
        const servers = [
          createMockServer({ id: 'srv-1' }),
          createMockServer({ id: 'srv-2' }),
          createMockServer({ id: 'srv-3' }),
        ];
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected' }),
          'srv-2': createMockServerState({ status: 'disconnected' }),
          'srv-3': createMockServerState({ status: 'connected' }),
        };
        useMcpStore.setState({ servers, serverStates });

        const result = selectConnectedServers(useMcpStore.getState());
        expect(result).toHaveLength(2);
        expect(result.map(s => s.id)).toEqual(['srv-1', 'srv-3']);
      });

      it('returns empty array when no servers are connected', () => {
        const servers = [createMockServer({ id: 'srv-1' })];
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'disconnected' }),
        };
        useMcpStore.setState({ servers, serverStates });

        const result = selectConnectedServers(useMcpStore.getState());
        expect(result).toEqual([]);
      });

      it('returns empty array when there are no servers', () => {
        const result = selectConnectedServers(useMcpStore.getState());
        expect(result).toEqual([]);
      });

      it('excludes servers without a state entry', () => {
        const servers = [createMockServer({ id: 'srv-1' }), createMockServer({ id: 'srv-2' })];
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected' }),
          // srv-2 has no state entry
        };
        useMcpStore.setState({ servers, serverStates });

        const result = selectConnectedServers(useMcpStore.getState());
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('srv-1');
      });

      it('returns memoized result for same state', () => {
        const servers = [createMockServer({ id: 'srv-1' })];
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected' }),
        };
        useMcpStore.setState({ servers, serverStates });

        const result1 = selectConnectedServers(useMcpStore.getState());
        const result2 = selectConnectedServers(useMcpStore.getState());
        expect(result1).toBe(result2);
      });
    });

    describe('selectAllTools', () => {
      it('returns tools from all connected servers', () => {
        const tool1 = createMockTool({ name: 'tool-1', serverId: 'srv-1' });
        const tool2 = createMockTool({ name: 'tool-2', serverId: 'srv-2' });
        const tool3 = createMockTool({ name: 'tool-3', serverId: 'srv-2' });

        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected', tools: [tool1] }),
          'srv-2': createMockServerState({ status: 'connected', tools: [tool2, tool3] }),
        };
        useMcpStore.setState({ serverStates });

        const result = selectAllTools(useMcpStore.getState());
        expect(result).toHaveLength(3);
        expect(result).toEqual([tool1, tool2, tool3]);
      });

      it('excludes tools from disconnected servers', () => {
        const tool1 = createMockTool({ name: 'tool-1', serverId: 'srv-1' });
        const tool2 = createMockTool({ name: 'tool-2', serverId: 'srv-2' });

        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected', tools: [tool1] }),
          'srv-2': createMockServerState({ status: 'disconnected', tools: [tool2] }),
        };
        useMcpStore.setState({ serverStates });

        const result = selectAllTools(useMcpStore.getState());
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('tool-1');
      });

      it('returns empty array when no servers have tools', () => {
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected', tools: [] }),
        };
        useMcpStore.setState({ serverStates });

        const result = selectAllTools(useMcpStore.getState());
        expect(result).toEqual([]);
      });

      it('returns empty array when no servers exist', () => {
        const result = selectAllTools(useMcpStore.getState());
        expect(result).toEqual([]);
      });

      it('returns memoized result for same state', () => {
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({
            status: 'connected',
            tools: [createMockTool()],
          }),
        };
        useMcpStore.setState({ serverStates });

        const result1 = selectAllTools(useMcpStore.getState());
        const result2 = selectAllTools(useMcpStore.getState());
        expect(result1).toBe(result2);
      });
    });

    describe('selectAllResources', () => {
      it('returns resources from all connected servers', () => {
        const resource1 = createMockResource({ name: 'res-1', serverId: 'srv-1' });
        const resource2 = createMockResource({ name: 'res-2', serverId: 'srv-2' });

        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected', resources: [resource1] }),
          'srv-2': createMockServerState({ status: 'connected', resources: [resource2] }),
        };
        useMcpStore.setState({ serverStates });

        const result = selectAllResources(useMcpStore.getState());
        expect(result).toHaveLength(2);
        expect(result).toEqual([resource1, resource2]);
      });

      it('excludes resources from disconnected servers', () => {
        const resource1 = createMockResource({ name: 'res-1', serverId: 'srv-1' });
        const resource2 = createMockResource({ name: 'res-2', serverId: 'srv-2' });

        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({ status: 'connected', resources: [resource1] }),
          'srv-2': createMockServerState({ status: 'error', resources: [resource2] }),
        };
        useMcpStore.setState({ serverStates });

        const result = selectAllResources(useMcpStore.getState());
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('res-1');
      });

      it('returns empty array when no servers have resources', () => {
        const result = selectAllResources(useMcpStore.getState());
        expect(result).toEqual([]);
      });

      it('returns memoized result for same state', () => {
        const serverStates: Record<string, McpServerState> = {
          'srv-1': createMockServerState({
            status: 'connected',
            resources: [createMockResource()],
          }),
        };
        useMcpStore.setState({ serverStates });

        const result1 = selectAllResources(useMcpStore.getState());
        const result2 = selectAllResources(useMcpStore.getState());
        expect(result1).toBe(result2);
      });
    });

    describe('selectMcpDiscovering', () => {
      it('returns isDiscovering value', () => {
        expect(selectMcpDiscovering(useMcpStore.getState())).toBe(false);

        useMcpStore.setState({ isDiscovering: true });
        expect(selectMcpDiscovering(useMcpStore.getState())).toBe(true);
      });
    });

    describe('selectMcpError', () => {
      it('returns error value', () => {
        expect(selectMcpError(useMcpStore.getState())).toBeNull();

        useMcpStore.setState({ error: 'Something went wrong' });
        expect(selectMcpError(useMcpStore.getState())).toBe('Something went wrong');
      });
    });

    describe('selectInternalMcp', () => {
      it('returns internalMcp value', () => {
        expect(selectInternalMcp(useMcpStore.getState())).toEqual({
          available: false,
          path: null,
        });

        useMcpStore.setState({ internalMcp: { available: true, path: '/usr/bin/mcp' } });
        expect(selectInternalMcp(useMcpStore.getState())).toEqual({
          available: true,
          path: '/usr/bin/mcp',
        });
      });
    });
  });
});
