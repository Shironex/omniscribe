import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { McpServerConfig, McpServerState, McpServerStatus, createLogger } from '@omniscribe/shared';
import { socket } from '@/lib/socket';

const logger = createLogger('McpStore');
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

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
 * Internal MCP server info
 */
interface InternalMcpInfo {
  available: boolean;
  path: string | null;
}

/**
 * MCP store state (extends common socket state)
 */
interface McpState extends SocketStoreState {
  /** Discovered MCP servers */
  servers: McpServerConfig[];
  /** Server states (keyed by server ID) */
  serverStates: Map<string, McpServerState>;
  /** Whether server discovery is in progress */
  isDiscovering: boolean;
  /** Internal MCP server info */
  internalMcp: InternalMcpInfo;
}

/**
 * MCP store actions (extends common socket actions)
 */
interface McpActions extends SocketStoreActions {
  /** Discover available MCP servers */
  discoverServers: (projectPath?: string) => void;
  /** Set servers list */
  setServers: (servers: McpServerConfig[]) => void;
  /** Update server state */
  updateServerState: (serverId: string, state: McpServerState) => void;
  /** Update server status */
  updateServerStatus: (serverId: string, status: McpServerStatus, errorMessage?: string) => void;
  /** Set discovering state */
  setDiscovering: (isDiscovering: boolean) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
  /** Clear store state */
  clear: () => void;
  /** Fetch internal MCP status */
  fetchInternalMcpStatus: () => void;
}

/**
 * Combined store type
 */
type McpStore = McpState & McpActions;

/**
 * MCP store using Zustand
 */
export const useMcpStore = create<McpStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<McpState>(set, 'mcp');

      // Create socket listeners
      const { initListeners, cleanupListeners } = createSocketListeners<McpStore>(get, set, 'mcp', {
        listeners: [
          {
            event: 'mcp:servers:discovered',
            handler: (data, get) => {
              const result = data as McpDiscoveryResult;
              get().setServers(result.servers);
            },
          },
          {
            event: 'mcp:status',
            handler: (data, get) => {
              const update = data as McpStatusUpdate;
              logger.debug('mcp:status', update.serverId, update.status);
              get().updateServerStatus(update.serverId, update.status, update.errorMessage);
            },
          },
          {
            event: 'mcp:state',
            handler: (data, get) => {
              const update = data as McpServerStateUpdate;
              logger.debug('mcp:state', update.serverId);
              get().updateServerState(update.serverId, update.state);
            },
          },
        ],
        onConnect: get => {
          // Refresh server list on reconnect
          get().discoverServers();
        },
      });

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
        servers: [],
        serverStates: new Map(),
        isDiscovering: false,
        internalMcp: { available: false, path: null },

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Custom actions
        discoverServers: (projectPath?: string) => {
          logger.info('Discovering servers', projectPath);
          set({ isDiscovering: true, error: null }, undefined, 'mcp/discoverServersStart');
          socket.emit(
            'mcp:discover',
            { projectPath },
            (response: { servers: McpServerConfig[]; error?: string }) => {
              if (response.error) {
                logger.error('Discovery failed:', response.error);
                set(
                  { error: response.error, isDiscovering: false },
                  undefined,
                  'mcp/discoverServersError'
                );
              } else {
                set(
                  { servers: response.servers ?? [], isDiscovering: false, error: null },
                  undefined,
                  'mcp/discoverServers'
                );
              }
            }
          );
        },

        setServers: (servers: McpServerConfig[]) => {
          set({ servers }, undefined, 'mcp/setServers');
        },

        updateServerState: (serverId: string, state: McpServerState) => {
          set(
            currentState => {
              const newServerStates = new Map(currentState.serverStates);
              newServerStates.set(serverId, state);
              return { serverStates: newServerStates };
            },
            undefined,
            'mcp/updateServerState'
          );
        },

        updateServerStatus: (serverId: string, status: McpServerStatus, errorMessage?: string) => {
          const existingState = get().serverStates.get(serverId);
          if (!existingState) {
            logger.warn('Status update for unknown server', serverId);
            return;
          }

          set(
            state => {
              const newServerStates = new Map(state.serverStates);
              const current = newServerStates.get(serverId);
              if (current) {
                newServerStates.set(serverId, {
                  ...current,
                  status,
                  errorMessage,
                });
              }
              return { serverStates: newServerStates };
            },
            undefined,
            'mcp/updateServerStatus'
          );
        },

        setDiscovering: (isDiscovering: boolean) => {
          set({ isDiscovering }, undefined, 'mcp/setDiscovering');
        },

        clear: () => {
          set(
            {
              servers: [],
              serverStates: new Map(),
              isDiscovering: false,
              error: null,
            },
            undefined,
            'mcp/clear'
          );
        },

        fetchInternalMcpStatus: () => {
          socket.emit('mcp:get-internal-status', {}, (response: InternalMcpInfo) => {
            set({ internalMcp: response }, undefined, 'mcp/fetchInternalMcpStatus');
          });
        },
      };
    },
    { name: 'mcp' }
  )
);

// Selectors

/**
 * Select all servers
 */
export const selectServers = (state: McpStore) => state.servers;

/**
 * Select server by ID
 */
export const selectServerById = (serverId: string) => (state: McpStore) =>
  state.servers.find(server => server.id === serverId);

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

/**
 * Select internal MCP info
 */
export const selectInternalMcp = (state: McpStore) => state.internalMcp;
