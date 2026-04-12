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
                const enabledSet = new Set(event.enabledIds);
                set(
                  s => ({
                    capabilities: s.capabilities.map(c => ({
                      ...c,
                      enabled: enabledSet.has(c.id),
                    })),
                  }),
                  undefined,
                  'mcpCapabilities/onChanged'
                );
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
          set(
            { isLoading: true, error: null, projectPath },
            undefined,
            'mcpCapabilities/fetchStart'
          );
          try {
            const response = await emitAsync<McpCapabilityListPayload, McpCapabilityListResponse>(
              McpEvents.CAPABILITY_LIST,
              { projectPath }
            );
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
            const message = extractErrorMessage(err, 'Failed to load capabilities');
            logger.error('CAPABILITY_LIST exception:', message);
            set({ error: message, isLoading: false }, undefined, 'mcpCapabilities/fetchError');
          }
        },

        toggleCapability: async (projectPath: string, id: string, enabled: boolean) => {
          // Optimistic update
          const previous = get().capabilities;
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
              // Roll back
              logger.error('CAPABILITY_TOGGLE failed:', response.error);
              set(
                { capabilities: previous, error: response.error ?? 'Toggle failed' },
                undefined,
                'mcpCapabilities/toggleError'
              );
              return;
            }

            // Reconcile against authoritative enabledIds (covers add/remove of any cap).
            if (response.enabledIds) {
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
            set(
              { capabilities: previous, error: message },
              undefined,
              'mcpCapabilities/toggleError'
            );
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
