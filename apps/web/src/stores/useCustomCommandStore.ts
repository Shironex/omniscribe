import { create } from 'zustand';
import { devtools } from './utils/devtools';
import {
  createLogger,
  extractErrorMessage,
  CustomCommandEvents,
  type CustomCommand,
  type CustomCommandInput,
  type CustomCommandUpdate,
  type CustomCommandsChangedEvent,
} from '@omniscribe/shared';
import {
  listCustomCommands,
  createCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,
  executeCustomCommand,
} from '@/lib/custom-commands';
import { useSessionStore } from '@/stores/useSessionStore';
import {
  type SocketStoreState,
  type SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('CustomCommandStore');

interface CustomCommandState extends SocketStoreState {
  /** Per-project cache of custom commands. Keyed by raw projectPath. */
  commandsByProject: Record<string, CustomCommand[]>;
  /** Project paths the store has at least successfully fetched once. */
  loadedProjects: Set<string>;
}

interface CustomCommandActions extends SocketStoreActions {
  fetchForProject: (projectPath: string) => Promise<void>;
  createCommand: (projectPath: string, input: CustomCommandInput) => Promise<CustomCommand | null>;
  updateCommand: (
    projectPath: string,
    id: string,
    updates: CustomCommandUpdate
  ) => Promise<CustomCommand | null>;
  deleteCommand: (projectPath: string, id: string) => Promise<boolean>;
  executeCommand: (projectPath: string, id: string) => Promise<string | null>;
  initListeners: () => void;
  cleanupListeners: () => void;
  clearProject: (projectPath: string) => void;
}

type CustomCommandStore = CustomCommandState & CustomCommandActions;

export const useCustomCommandStore = create<CustomCommandStore>()(
  devtools(
    (set, get) => {
      const socketActions = createSocketActions<CustomCommandState>(set, 'customCommand');

      const refreshLoaded = (): void => {
        const loaded = Array.from(get().loadedProjects);
        loaded.forEach(projectPath => {
          void get().fetchForProject(projectPath);
        });
      };

      const { initListeners, cleanupListeners } = createSocketListeners<CustomCommandStore>(
        get,
        set,
        'customCommand',
        {
          listeners: [
            {
              event: CustomCommandEvents.CHANGED,
              handler: (data, get) => {
                const event = data as CustomCommandsChangedEvent;
                if (!event?.projectPath) return;
                set(
                  state => {
                    const next = { ...state.commandsByProject };
                    next[event.projectPath] = event.commands ?? [];
                    const loaded = new Set(state.loadedProjects);
                    loaded.add(event.projectPath);
                    return { commandsByProject: next, loadedProjects: loaded };
                  },
                  undefined,
                  'customCommand/changed'
                );
                // Read explicitly so the lint rule sees `get` as used.
                void get;
              },
            },
          ],
          onConnect: () => {
            // Backend is canonical; refetch every loaded project on reconnect.
            refreshLoaded();
          },
        }
      );

      return {
        ...initialSocketState,
        commandsByProject: {},
        loadedProjects: new Set<string>(),

        ...socketActions,
        initListeners,
        cleanupListeners,

        fetchForProject: async (projectPath: string) => {
          if (!projectPath) return;
          set({ isLoading: true, error: null }, undefined, 'customCommand/fetchStart');
          try {
            const response = await listCustomCommands(projectPath);
            if (response.error) {
              logger.error('LIST failed:', response.error);
              set(
                { error: response.error, isLoading: false },
                undefined,
                'customCommand/fetchError'
              );
              return;
            }
            set(
              state => {
                const next = { ...state.commandsByProject };
                next[projectPath] = response.commands ?? [];
                const loaded = new Set(state.loadedProjects);
                loaded.add(projectPath);
                return {
                  commandsByProject: next,
                  loadedProjects: loaded,
                  isLoading: false,
                  error: null,
                };
              },
              undefined,
              'customCommand/fetchSuccess'
            );
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to load custom commands');
            logger.error('LIST exception:', message);
            set({ error: message, isLoading: false }, undefined, 'customCommand/fetchError');
          }
        },

        createCommand: async (projectPath: string, input: CustomCommandInput) => {
          if (!projectPath) return null;
          try {
            const response = await createCustomCommand({ projectPath, command: input });
            if (!response.success) {
              logger.error('CREATE failed:', response.error);
              set(
                { error: response.error ?? 'Create failed' },
                undefined,
                'customCommand/createError'
              );
              return null;
            }
            if (response.commands) {
              set(
                state => ({
                  commandsByProject: {
                    ...state.commandsByProject,
                    [projectPath]: response.commands ?? [],
                  },
                  loadedProjects: new Set(state.loadedProjects).add(projectPath),
                  error: null,
                }),
                undefined,
                'customCommand/createSuccess'
              );
            }
            return response.command ?? null;
          } catch (err) {
            const message = extractErrorMessage(err, 'Create failed');
            logger.error('CREATE exception:', message);
            set({ error: message }, undefined, 'customCommand/createError');
            return null;
          }
        },

        updateCommand: async (projectPath: string, id: string, updates: CustomCommandUpdate) => {
          if (!projectPath) return null;
          try {
            const response = await updateCustomCommand({ projectPath, id, updates });
            if (!response.success) {
              logger.error('UPDATE failed:', response.error);
              set(
                { error: response.error ?? 'Update failed' },
                undefined,
                'customCommand/updateError'
              );
              return null;
            }
            if (response.commands) {
              set(
                state => ({
                  commandsByProject: {
                    ...state.commandsByProject,
                    [projectPath]: response.commands ?? [],
                  },
                  error: null,
                }),
                undefined,
                'customCommand/updateSuccess'
              );
            }
            return response.command ?? null;
          } catch (err) {
            const message = extractErrorMessage(err, 'Update failed');
            logger.error('UPDATE exception:', message);
            set({ error: message }, undefined, 'customCommand/updateError');
            return null;
          }
        },

        deleteCommand: async (projectPath: string, id: string) => {
          if (!projectPath) return false;
          try {
            const response = await deleteCustomCommand({ projectPath, id });
            if (!response.success) {
              logger.error('DELETE failed:', response.error);
              set(
                { error: response.error ?? 'Delete failed' },
                undefined,
                'customCommand/deleteError'
              );
              return false;
            }
            if (response.commands) {
              set(
                state => ({
                  commandsByProject: {
                    ...state.commandsByProject,
                    [projectPath]: response.commands ?? [],
                  },
                  error: null,
                }),
                undefined,
                'customCommand/deleteSuccess'
              );
            }
            return true;
          } catch (err) {
            const message = extractErrorMessage(err, 'Delete failed');
            logger.error('DELETE exception:', message);
            set({ error: message }, undefined, 'customCommand/deleteError');
            return false;
          }
        },

        executeCommand: async (projectPath: string, id: string) => {
          if (!projectPath) return null;
          try {
            const response = await executeCustomCommand({ projectPath, id });
            if (!response.success) {
              logger.error('EXECUTE failed:', response.error);
              set(
                { error: response.error ?? 'Execute failed' },
                undefined,
                'customCommand/executeError'
              );
              return null;
            }
            // Patch the freshly-created session with its terminalSessionId.
            // The `session:created` broadcast fired before launchSession ran
            // and carries terminalSessionId=undefined; without this patch the
            // tile is stuck on "Connecting to terminal...". Mirrors the same
            // fix applied in useSlotLaunch for the regular create flow.
            if (response.sessionId && response.terminalSessionId !== undefined) {
              useSessionStore.getState().updateSession(response.sessionId, {
                terminalSessionId: response.terminalSessionId,
              });
            }
            return response.sessionId ?? null;
          } catch (err) {
            const message = extractErrorMessage(err, 'Execute failed');
            logger.error('EXECUTE exception:', message);
            set({ error: message }, undefined, 'customCommand/executeError');
            return null;
          }
        },

        clearProject: (projectPath: string) => {
          set(
            state => {
              const next = { ...state.commandsByProject };
              delete next[projectPath];
              const loaded = new Set(state.loadedProjects);
              loaded.delete(projectPath);
              return { commandsByProject: next, loadedProjects: loaded };
            },
            undefined,
            'customCommand/clearProject'
          );
        },
      };
    },
    { name: 'customCommand' }
  )
);

/**
 * Stable empty array used as the fallback for `selectCommandsForProject` so
 * components don't re-render when an unloaded project is queried.
 */
const EMPTY_COMMANDS: CustomCommand[] = [];

export function selectCommandsForProject(
  projectPath: string | null | undefined
): (state: CustomCommandStore) => CustomCommand[] {
  return state => {
    if (!projectPath) return EMPTY_COMMANDS;
    return state.commandsByProject[projectPath] ?? EMPTY_COMMANDS;
  };
}
