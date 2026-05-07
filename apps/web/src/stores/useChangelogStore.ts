import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ChangelogEvents, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type {
  ChangelogError,
  ChangelogFetchPayload,
  ChangelogPayload,
  ChangelogResponse,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';

const logger = createLogger('ChangelogStore');

type FetchStatus = 'idle' | 'fetching' | 'success' | 'error';

export interface PerSourceState {
  data: ChangelogPayload | null;
  status: FetchStatus;
  error: ChangelogError | null;
  errorMessage: string | null;
  /** Epoch ms of the last *successful* renderer-side fetch (mirrors `data.fetchedAt`). */
  lastFetched: number | null;
}

const INITIAL_PER_SOURCE: PerSourceState = {
  data: null,
  status: 'idle',
  error: null,
  errorMessage: null,
  lastFetched: null,
};

interface ChangelogState {
  /** Per-source slot states keyed by `ChangelogSourceRegistration.id`. */
  bySource: Record<string, PerSourceState>;
}

interface ChangelogActions {
  fetchChangelog: (sourceId: string, forceRefresh?: boolean) => Promise<void>;
  /** Drop the slot for a source (or all slots when `sourceId` is omitted). */
  clear: (sourceId?: string) => void;
}

type ChangelogStore = ChangelogState & ChangelogActions;

function setSlot(
  state: ChangelogState,
  sourceId: string,
  patch: Partial<PerSourceState>
): ChangelogState {
  const existing = state.bySource[sourceId] ?? INITIAL_PER_SOURCE;
  return {
    ...state,
    bySource: {
      ...state.bySource,
      [sourceId]: { ...existing, ...patch },
    },
  };
}

export const useChangelogStore = create<ChangelogStore>()(
  devtools(
    (set, get) => ({
      bySource: {},

      fetchChangelog: async (sourceId: string, forceRefresh = false) => {
        const slot = get().bySource[sourceId];
        if (slot?.status === 'fetching') {
          return;
        }

        set(
          state =>
            setSlot(state, sourceId, {
              status: 'fetching',
              error: null,
              errorMessage: null,
            }),
          undefined,
          `changelog/fetchStart:${sourceId}`
        );

        try {
          const response = await emitAsync<ChangelogFetchPayload, ChangelogResponse>(
            ChangelogEvents.FETCH,
            { sourceId, forceRefresh },
            { timeout: 30000 }
          );

          if (response.error) {
            logger.warn(`Fetch error for "${sourceId}":`, response.error, response.message);
            set(
              state =>
                setSlot(state, sourceId, {
                  status: 'error',
                  error: response.error ?? 'unknown',
                  errorMessage: response.message ?? null,
                }),
              undefined,
              `changelog/fetchError:${sourceId}`
            );
            return;
          }

          if (response.data) {
            set(
              state =>
                setSlot(state, sourceId, {
                  data: response.data ?? null,
                  status: 'success',
                  lastFetched: response.data?.fetchedAt ?? null,
                  error: null,
                  errorMessage: null,
                }),
              undefined,
              `changelog/fetchSuccess:${sourceId}`
            );
          }
        } catch (err) {
          const message = extractErrorMessage(err);
          logger.error(`Fetch exception for "${sourceId}":`, message);
          set(
            state =>
              setSlot(state, sourceId, {
                status: 'error',
                error: 'unknown',
                errorMessage: message,
              }),
            undefined,
            `changelog/fetchException:${sourceId}`
          );
        }
      },

      clear: (sourceId?: string) => {
        if (sourceId) {
          set(
            state => {
              const next = { ...state.bySource };
              delete next[sourceId];
              return { bySource: next };
            },
            undefined,
            `changelog/clear:${sourceId}`
          );
          return;
        }
        set({ bySource: {} }, undefined, 'changelog/clearAll');
      },
    }),
    { name: 'changelog' }
  )
);

/** Selector helper — returns a stable initial state for unknown sources. */
export const selectChangelogSlot =
  (sourceId: string) =>
  (s: ChangelogStore): PerSourceState =>
    s.bySource[sourceId] ?? INITIAL_PER_SOURCE;

export { INITIAL_PER_SOURCE };
