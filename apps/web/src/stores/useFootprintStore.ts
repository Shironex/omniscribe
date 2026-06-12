import { create } from 'zustand';
import { devtools } from './utils/devtools';
import {
  createLogger,
  extractErrorMessage,
  FootprintEvents,
  type FootprintEntry,
  type FootprintKind,
  type FootprintRemovalResult,
  type FootprintGetPayload,
  type FootprintGetResponse,
  type FootprintRemovePayload,
  type FootprintRemoveResponse,
  type FootprintSetPassiveModePayload,
  type FootprintSetPassiveModeResponse,
  type FootprintGetPassiveModePayload,
  type FootprintGetPassiveModeResponse,
  type FootprintChangedEvent,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';
import {
  type SocketStoreState,
  type SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('FootprintStore');

interface FootprintState extends SocketStoreState {
  /** Detected Omniscribe-owned artifacts for the active project. */
  entries: FootprintEntry[];
  /** Whether passive mode is enabled for the active project. */
  passiveMode: boolean;
  /** Project path the cached footprint/passive-mode were fetched for. */
  projectPath: string | null;
  /** True while a removal request is in flight. */
  isRemoving: boolean;
}

interface FootprintActions extends SocketStoreActions {
  /** Fetch the footprint and passive-mode state for a project. */
  fetchFootprint: (projectPath: string) => Promise<void>;
  /** Toggle passive mode for a project. */
  setPassiveMode: (projectPath: string, enabled: boolean) => Promise<boolean>;
  /** Remove the requested footprint kinds; returns per-kind results. */
  removeFootprint: (
    projectPath: string,
    kinds: FootprintKind[]
  ) => Promise<FootprintRemovalResult[]>;
  initListeners: () => void;
  cleanupListeners: () => void;
  clear: () => void;
}

type FootprintStore = FootprintState & FootprintActions;

export const useFootprintStore = create<FootprintStore>()(
  devtools(
    (set, get) => {
      const socketActions = createSocketActions<FootprintState>(set, 'footprint');

      const { initListeners, cleanupListeners } = createSocketListeners<FootprintStore>(
        get,
        set,
        'footprint',
        {
          listeners: [
            {
              event: FootprintEvents.CHANGED,
              handler: (data, get) => {
                const event = data as FootprintChangedEvent;
                const state = get();
                // Only re-fetch when the change concerns the project we're showing.
                if (state.projectPath !== event.projectPath) {
                  return;
                }
                void get().fetchFootprint(event.projectPath);
              },
            },
          ],
        }
      );

      return {
        ...initialSocketState,
        entries: [],
        passiveMode: false,
        projectPath: null,
        isRemoving: false,

        ...socketActions,

        initListeners,
        cleanupListeners,

        fetchFootprint: async (projectPath: string) => {
          if (!projectPath) {
            return;
          }
          // Snapshot the requested path so we can drop late responses when the
          // active project has already changed.
          const requestedProjectPath = projectPath;
          set(
            { isLoading: true, error: null, projectPath: requestedProjectPath },
            undefined,
            'footprint/fetchStart'
          );
          try {
            const [footprint, passive] = await Promise.all([
              emitAsync<FootprintGetPayload, FootprintGetResponse>(FootprintEvents.GET, {
                projectPath: requestedProjectPath,
              }),
              emitAsync<FootprintGetPassiveModePayload, FootprintGetPassiveModeResponse>(
                FootprintEvents.GET_PASSIVE_MODE,
                { projectPath: requestedProjectPath }
              ),
            ]);

            if (get().projectPath !== requestedProjectPath) {
              return;
            }

            if (footprint.error) {
              logger.error('footprint:get failed:', footprint.error);
              set({ error: footprint.error, isLoading: false }, undefined, 'footprint/fetchError');
              return;
            }

            set(
              {
                entries: footprint.entries ?? [],
                passiveMode: passive.enabled === true,
                isLoading: false,
                error: passive.error ?? null,
              },
              undefined,
              'footprint/fetchSuccess'
            );
          } catch (err) {
            if (get().projectPath !== requestedProjectPath) {
              return;
            }
            const message = extractErrorMessage(err, 'Failed to load footprint');
            logger.error('footprint:get exception:', message);
            set({ error: message, isLoading: false }, undefined, 'footprint/fetchError');
          }
        },

        setPassiveMode: async (projectPath: string, enabled: boolean) => {
          const previous = get().passiveMode;
          const isCurrentProject = () => get().projectPath === projectPath;
          // Optimistic update.
          if (isCurrentProject()) {
            set({ passiveMode: enabled, error: null }, undefined, 'footprint/passiveOptimistic');
          }

          try {
            const response = await emitAsync<
              FootprintSetPassiveModePayload,
              FootprintSetPassiveModeResponse
            >(FootprintEvents.SET_PASSIVE_MODE, { projectPath, enabled });

            if (!response.success) {
              logger.error('footprint:set-passive-mode failed:', response.error);
              if (isCurrentProject()) {
                set(
                  { passiveMode: previous, error: response.error ?? 'Failed to set passive mode' },
                  undefined,
                  'footprint/passiveError'
                );
              }
              return false;
            }

            if (isCurrentProject()) {
              set({ passiveMode: response.enabled }, undefined, 'footprint/passiveReconcile');
            }
            return true;
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to set passive mode');
            logger.error('footprint:set-passive-mode exception:', message);
            if (isCurrentProject()) {
              set({ passiveMode: previous, error: message }, undefined, 'footprint/passiveError');
            }
            return false;
          }
        },

        removeFootprint: async (projectPath: string, kinds: FootprintKind[]) => {
          if (kinds.length === 0) {
            return [];
          }
          set({ isRemoving: true, error: null }, undefined, 'footprint/removeStart');
          try {
            const response = await emitAsync<FootprintRemovePayload, FootprintRemoveResponse>(
              FootprintEvents.REMOVE,
              { projectPath, kinds }
            );

            const stillCurrent = get().projectPath === projectPath;
            if (response.error) {
              logger.error('footprint:remove failed:', response.error);
              if (stillCurrent) {
                set(
                  { isRemoving: false, error: response.error },
                  undefined,
                  'footprint/removeError'
                );
              }
              return response.results ?? [];
            }

            // Re-fetch authoritative footprint for the project (the CHANGED
            // broadcast also triggers this, but re-fetch directly so the result
            // is reflected even if the broadcast is missed).
            if (stillCurrent) {
              set({ isRemoving: false }, undefined, 'footprint/removeDone');
              void get().fetchFootprint(projectPath);
            }
            return response.results ?? [];
          } catch (err) {
            const message = extractErrorMessage(err, 'Removal failed');
            logger.error('footprint:remove exception:', message);
            if (get().projectPath === projectPath) {
              set({ isRemoving: false, error: message }, undefined, 'footprint/removeError');
            }
            throw err;
          }
        },

        clear: () => {
          set(
            {
              entries: [],
              passiveMode: false,
              projectPath: null,
              error: null,
              isLoading: false,
              isRemoving: false,
            },
            undefined,
            'footprint/clear'
          );
        },
      };
    },
    { name: 'footprint' }
  )
);

export const selectFootprintEntries = (state: FootprintStore) => state.entries;
export const selectFootprintPassiveMode = (state: FootprintStore) => state.passiveMode;
export const selectFootprintLoading = (state: FootprintStore) => state.isLoading;
export const selectFootprintRemoving = (state: FootprintStore) => state.isRemoving;
export const selectFootprintError = (state: FootprintStore) => state.error;
