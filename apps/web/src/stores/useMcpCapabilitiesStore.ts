import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  createLogger,
  extractErrorMessage,
  McpEvents,
  type McpCapabilityDescriptor,
  type McpCapabilityListPayload,
  type McpCapabilityListResponse,
  type McpCapabilityTogglePayload,
  type McpCapabilityToggleResponse,
  type McpCapabilitySetPortPayload,
  type McpCapabilitySetPortResponse,
  type McpCapabilityChangedEvent,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';
import {
  type SocketStoreState,
  type SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('McpCapabilitiesStore');

interface McpCapabilitiesState extends SocketStoreState {
  /** Per-project capability descriptors (label/description + enabled flag). */
  capabilities: McpCapabilityDescriptor[];
  /** Project path the cached capabilities were fetched for. */
  projectPath: string | null;
}

interface McpCapabilitiesActions extends SocketStoreActions {
  fetchCapabilities: (projectPath: string) => Promise<void>;
  toggleCapability: (projectPath: string, id: string, enabled: boolean) => Promise<void>;
  setElectronCdpPort: (projectPath: string, id: string, port: number) => Promise<void>;
  initListeners: () => void;
  cleanupListeners: () => void;
  clear: () => void;
}

type McpCapabilitiesStore = McpCapabilitiesState & McpCapabilitiesActions;

export const useMcpCapabilitiesStore = create<McpCapabilitiesStore>()(
  devtools(
    (set, get) => {
      const socketActions = createSocketActions<McpCapabilitiesState>(set, 'mcpCapabilities');

      const { initListeners, cleanupListeners } = createSocketListeners<McpCapabilitiesStore>(
        get,
        set,
        'mcpCapabilities',
        {
          listeners: [
            {
              event: McpEvents.CAPABILITY_CHANGED,
              handler: (data, get) => {
                const event = data as McpCapabilityChangedEvent;
                const state = get();
                if (state.projectPath !== event.projectPath) {
                  return;
                }
                // Re-fetch full descriptors. CAPABILITY_CHANGED is emitted
                // for toggle AND for port edits via CAPABILITY_SET_PORT, so
                // flipping `enabled` alone would leave descriptor fields
                // (electronCdpPort, disabledReason) stale in other windows.
                void get().fetchCapabilities(event.projectPath);
              },
            },
          ],
        }
      );

      return {
        ...initialSocketState,
        capabilities: [],
        projectPath: null,

        ...socketActions,

        initListeners,
        cleanupListeners,

        fetchCapabilities: async (projectPath: string) => {
          if (!projectPath) {
            return;
          }
          // Snapshot the requested path so we can drop late responses when
          // the active project has already changed.
          const requestedProjectPath = projectPath;
          set(
            { isLoading: true, error: null, projectPath: requestedProjectPath },
            undefined,
            'mcpCapabilities/fetchStart'
          );
          try {
            const response = await emitAsync<McpCapabilityListPayload, McpCapabilityListResponse>(
              McpEvents.CAPABILITY_LIST,
              { projectPath: requestedProjectPath }
            );
            if (get().projectPath !== requestedProjectPath) {
              return;
            }
            if (response.error) {
              logger.error('CAPABILITY_LIST failed:', response.error);
              set(
                { error: response.error, isLoading: false },
                undefined,
                'mcpCapabilities/fetchError'
              );
              return;
            }
            set(
              {
                capabilities: response.capabilities ?? [],
                isLoading: false,
                error: null,
              },
              undefined,
              'mcpCapabilities/fetchSuccess'
            );
          } catch (err) {
            if (get().projectPath !== requestedProjectPath) {
              return;
            }
            const message = extractErrorMessage(err, 'Failed to load capabilities');
            logger.error('CAPABILITY_LIST exception:', message);
            set({ error: message, isLoading: false }, undefined, 'mcpCapabilities/fetchError');
          }
        },

        toggleCapability: async (projectPath: string, id: string, enabled: boolean) => {
          // Optimistic update
          const previous = get().capabilities;
          const isCurrentProject = () => get().projectPath === projectPath;
          set(
            {
              capabilities: previous.map(c => (c.id === id ? { ...c, enabled } : c)),
              error: null,
            },
            undefined,
            'mcpCapabilities/toggleOptimistic'
          );

          try {
            const response = await emitAsync<
              McpCapabilityTogglePayload,
              McpCapabilityToggleResponse
            >(McpEvents.CAPABILITY_TOGGLE, { projectPath, capabilityId: id, enabled });

            if (!response.success) {
              // Roll back, but only if the user hasn't switched projects.
              logger.error('CAPABILITY_TOGGLE failed:', response.error);
              if (isCurrentProject()) {
                set(
                  { capabilities: previous, error: response.error ?? 'Toggle failed' },
                  undefined,
                  'mcpCapabilities/toggleError'
                );
              }
              return;
            }

            // Reconcile against authoritative enabledIds (covers add/remove of any cap).
            if (response.enabledIds && isCurrentProject()) {
              const enabledSet = new Set(response.enabledIds);
              set(
                s => ({
                  capabilities: s.capabilities.map(c => ({
                    ...c,
                    enabled: enabledSet.has(c.id),
                  })),
                }),
                undefined,
                'mcpCapabilities/toggleReconcile'
              );
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Toggle failed');
            logger.error('CAPABILITY_TOGGLE exception:', message);
            if (isCurrentProject()) {
              set(
                { capabilities: previous, error: message },
                undefined,
                'mcpCapabilities/toggleError'
              );
            }
          }
        },

        setElectronCdpPort: async (projectPath: string, id: string, port: number) => {
          // Optimistic update
          const previous = get().capabilities;
          const isCurrentProject = () => get().projectPath === projectPath;
          set(
            {
              capabilities: previous.map(c => (c.id === id ? { ...c, electronCdpPort: port } : c)),
              error: null,
            },
            undefined,
            'mcpCapabilities/setPortOptimistic'
          );

          try {
            const response = await emitAsync<
              McpCapabilitySetPortPayload,
              McpCapabilitySetPortResponse
            >(McpEvents.CAPABILITY_SET_PORT, { projectPath, capabilityId: id, port });

            if (!response.success) {
              logger.error('CAPABILITY_SET_PORT failed:', response.error);
              if (isCurrentProject()) {
                set(
                  { capabilities: previous, error: response.error ?? 'Set port failed' },
                  undefined,
                  'mcpCapabilities/setPortError'
                );
              }
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Set port failed');
            logger.error('CAPABILITY_SET_PORT exception:', message);
            if (isCurrentProject()) {
              set(
                { capabilities: previous, error: message },
                undefined,
                'mcpCapabilities/setPortError'
              );
            }
          }
        },

        clear: () => {
          set(
            { capabilities: [], projectPath: null, error: null, isLoading: false },
            undefined,
            'mcpCapabilities/clear'
          );
        },
      };
    },
    { name: 'mcpCapabilities' }
  )
);

export const selectMcpCapabilities = (state: McpCapabilitiesStore) => state.capabilities;
export const selectMcpCapabilitiesLoading = (state: McpCapabilitiesStore) => state.isLoading;
export const selectMcpCapabilitiesError = (state: McpCapabilitiesStore) => state.error;
