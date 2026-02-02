import { create } from 'zustand';
import { McpServerConfig, McpServerState, McpServerStatus } from '@omniscribe/shared';
import { socket } from '../lib/socket';

/**
 * MCP server discovery result payload
 */
interface McpDiscoveryResult {
  servers: McpServerConfig[];
}

/**
 * MCP server status update payload
 */
interface McpStatusUpdate {
  serverId: string;
  status: McpServerStatus;
  errorMessage?: string;
}

/**
 * MCP server state update payload
 */
interface McpServerStateUpdate {
  serverId: string;
  state: McpServerState;
}

/**
 * MCP store state
 */
interface McpState {
  /** Discovered MCP servers */
  servers: McpServerConfig[];
  /** Server states (keyed by server ID) */
  serverStates: Map<string, McpServerState>;
  /** Enabled server IDs */
  enabledServers: Set<string>;
  /** Whether server discovery is in progress */
  isDiscovering: boolean;
  /** Error message */
  error: string | null;
  /** Whether listeners are initialized */
  listenersInitialized: boolean;
}

/**
 * MCP store actions
 */
interface McpActions {
  /** Discover available MCP servers */
  discoverServers: (projectPath?: string) => void;
  /** Set server enabled/disabled */
  setEnabled: (serverId: string, enabled: boolean) => void;
  /** Get enabled servers for a session */
  getEnabledForSession: () => McpServerConfig[];
  /** Set servers list */
  setServers: (servers: McpServerConfig[]) => void;
  /** Update server state */
  updateServerState: (serverId: string, state: McpServerState) => void;
  /** Update server status */
  updateServerStatus: (serverId: string, status: McpServerStatus, errorMessage?: string) => void;
  /** Set discovering state */
  setDiscovering: (isDiscovering: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
  /** Connect to a server */
  connectServer: (serverId: string) => void;
  /** Disconnect from a server */
  disconnectServer: (serverId: string) => void;
  /** Clear store state */
  clear: () => void;
}

/**
 * Combined store type
 */
type McpStore = McpState & McpActions;

/**
 * MCP store using Zustand
 */
export const useMcpStore = create<McpStore>((set, get) => ({
  // Initial state
  servers: [],
  serverStates: new Map(),
  enabledServers: new Set(),
  isDiscovering: false,
  error: null,
  listenersInitialized: false,

  // Actions
  discoverServers: (projectPath?: string) => {
    set({ isDiscovering: true, error: null });
    socket.emit('mcp:discover', { projectPath }, (response: { servers: McpServerConfig[]; error?: string }) => {
      // Backend returns { servers, error? } - no success field
      // Check for error first, then check if we have servers
      if (response.error) {
        set({ error: response.error, isDiscovering: false });
      } else {
        // Update servers list (may be empty array, which is valid)
        set({ servers: response.servers ?? [], isDiscovering: false, error: null });

        // Initialize enabled set with servers that have enabled: true
        const enabledSet = new Set<string>();
        for (const server of response.servers ?? []) {
          if (server.enabled) {
            enabledSet.add(server.id);
          }
        }
        set({ enabledServers: enabledSet });
      }
    });
  },

  setEnabled: (serverId: string, enabled: boolean) => {
    set((state) => {
      const newEnabledServers = new Set(state.enabledServers);
      if (enabled) {
        newEnabledServers.add(serverId);
      } else {
        newEnabledServers.delete(serverId);
      }
      return { enabledServers: newEnabledServers };
    });

    // Notify backend of the change
    socket.emit('mcp:set-enabled', { serverId, enabled });
  },

  getEnabledForSession: () => {
    const { servers, enabledServers } = get();
    return servers.filter((server) => enabledServers.has(server.id));
  },

  setServers: (servers: McpServerConfig[]) => {
    set({ servers });
  },

  updateServerState: (serverId: string, state: McpServerState) => {
    set((currentState) => {
      const newServerStates = new Map(currentState.serverStates);
      newServerStates.set(serverId, state);
      return { serverStates: newServerStates };
    });
  },

  updateServerStatus: (serverId: string, status: McpServerStatus, errorMessage?: string) => {
    set((state) => {
      const newServerStates = new Map(state.serverStates);
      const existingState = newServerStates.get(serverId);

      if (existingState) {
        newServerStates.set(serverId, {
          ...existingState,
          status,
          errorMessage,
        });
      }

      return { serverStates: newServerStates };
    });
  },

  setDiscovering: (isDiscovering: boolean) => {
    set({ isDiscovering });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  connectServer: (serverId: string) => {
    socket.emit('mcp:connect', { serverId }, (response: { success: boolean; error?: string }) => {
      if (!response.success && response.error) {
        get().setError(response.error);
      }
    });
  },

  disconnectServer: (serverId: string) => {
    socket.emit('mcp:disconnect', { serverId }, (response: { success: boolean; error?: string }) => {
      if (!response.success && response.error) {
        get().setError(response.error);
      }
    });
  },

  initListeners: () => {
    const state = get();

    // Prevent duplicate listener registration
    if (state.listenersInitialized) {
      return;
    }

    const { setServers, updateServerState, updateServerStatus, setError } = get();

    // Handle server discovery results
    socket.on('mcp:servers:discovered', (result: McpDiscoveryResult) => {
      setServers(result.servers);

      // Update enabled set
      const enabledSet = new Set<string>();
      for (const server of result.servers) {
        if (server.enabled) {
          enabledSet.add(server.id);
        }
      }
      set({ enabledServers: enabledSet });
    });

    // Handle server status updates
    socket.on('mcp:status', (update: McpStatusUpdate) => {
      updateServerStatus(update.serverId, update.status, update.errorMessage);
    });

    // Handle server state updates (tools, resources, prompts)
    socket.on('mcp:state', (update: McpServerStateUpdate) => {
      updateServerState(update.serverId, update.state);
    });

    // Handle connection error
    socket.on('connect_error', (err: Error) => {
      setError(`Connection error: ${err.message}`);
    });

    // Handle reconnection - refresh server list
    socket.on('connect', () => {
      setError(null);
      get().discoverServers();
    });

    set({ listenersInitialized: true });
  },

  cleanupListeners: () => {
    socket.off('mcp:servers:discovered');
    socket.off('mcp:status');
    socket.off('mcp:state');

    set({ listenersInitialized: false });
  },

  clear: () => {
    set({
      servers: [],
      serverStates: new Map(),
      enabledServers: new Set(),
      isDiscovering: false,
      error: null,
    });
  },
}));

// Selectors

/**
 * Select all servers
 */
export const selectServers = (state: McpStore) => state.servers;

/**
 * Select enabled servers
 */
export const selectEnabledServers = (state: McpStore) =>
  state.servers.filter((server) => state.enabledServers.has(server.id));

/**
 * Select disabled servers
 */
export const selectDisabledServers = (state: McpStore) =>
  state.servers.filter((server) => !state.enabledServers.has(server.id));

/**
 * Select server by ID
 */
export const selectServerById = (serverId: string) => (state: McpStore) =>
  state.servers.find((server) => server.id === serverId);

/**
 * Select server state by ID
 */
export const selectServerStateById = (serverId: string) => (state: McpStore) =>
  state.serverStates.get(serverId);

/**
 * Select connected servers
 */
export const selectConnectedServers = (state: McpStore) => {
  const connectedServers: McpServerConfig[] = [];
  for (const server of state.servers) {
    const serverState = state.serverStates.get(server.id);
    if (serverState?.status === 'connected') {
      connectedServers.push(server);
    }
  }
  return connectedServers;
};

/**
 * Select all tools from connected servers
 */
export const selectAllTools = (state: McpStore) => {
  const tools: McpServerState['tools'] = [];
  for (const serverState of state.serverStates.values()) {
    if (serverState.status === 'connected') {
      tools.push(...serverState.tools);
    }
  }
  return tools;
};

/**
 * Select all resources from connected servers
 */
export const selectAllResources = (state: McpStore) => {
  const resources: McpServerState['resources'] = [];
  for (const serverState of state.serverStates.values()) {
    if (serverState.status === 'connected') {
      resources.push(...serverState.resources);
    }
  }
  return resources;
};

/**
 * Select discovering state
 */
export const selectMcpDiscovering = (state: McpStore) => state.isDiscovering;

/**
 * Select error
 */
export const selectMcpError = (state: McpStore) => state.error;
