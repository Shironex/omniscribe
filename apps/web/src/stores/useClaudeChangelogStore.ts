import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ClaudeChangelogEvents, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type {
  ClaudeChangelogError,
  ClaudeChangelogFetchPayload,
  ClaudeChangelogPayload,
  ClaudeChangelogResponse,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';

const logger = createLogger('ClaudeChangelogStore');

type FetchStatus = 'idle' | 'fetching' | 'success' | 'error';

interface ChangelogState {
  data: ClaudeChangelogPayload | null;
  status: FetchStatus;
  error: ClaudeChangelogError | null;
  errorMessage: string | null;
  /** Epoch ms of the last *successful* renderer-side fetch (mirrors `data.fetchedAt`). */
  lastFetched: number | null;
}

interface ChangelogActions {
  fetchChangelog: (forceRefresh?: boolean) => Promise<void>;
  clear: () => void;
}

type ChangelogStore = ChangelogState & ChangelogActions;

const initial: ChangelogState = {
  data: null,
  status: 'idle',
  error: null,
  errorMessage: null,
  lastFetched: null,
};

export const useClaudeChangelogStore = create<ChangelogStore>()(
  devtools(
    (set, get) => ({
      ...initial,

      fetchChangelog: async (forceRefresh = false) => {
        const state = get();
        if (state.status === 'fetching') {
          return;
        }

        set(
          { status: 'fetching', error: null, errorMessage: null },
          undefined,
          'claudeChangelog/fetchStart'
        );

        try {
          const response = await emitAsync<ClaudeChangelogFetchPayload, ClaudeChangelogResponse>(
            ClaudeChangelogEvents.FETCH,
            { forceRefresh },
            { timeout: 30000 }
          );

          if (response.error) {
            logger.warn('Fetch error:', response.error, response.message);
            set(
              {
                status: 'error',
                error: response.error,
                errorMessage: response.message ?? null,
              },
              undefined,
              'claudeChangelog/fetchError'
            );
            return;
          }

          if (response.data) {
            set(
              {
                data: response.data,
                status: 'success',
                lastFetched: response.data.fetchedAt,
                error: null,
                errorMessage: null,
              },
              undefined,
              'claudeChangelog/fetchSuccess'
            );
          }
        } catch (err) {
          const message = extractErrorMessage(err);
          logger.error('Fetch exception:', message);
          set(
            {
              status: 'error',
              error: 'unknown',
              errorMessage: message,
            },
            undefined,
            'claudeChangelog/fetchException'
          );
        }
      },

      clear: () => {
        set({ ...initial }, undefined, 'claudeChangelog/clear');
      },
    }),
    { name: 'claude-changelog' }
  )
);

export const selectChangelog = (s: ChangelogStore) => s.data;
export const selectChangelogStatus = (s: ChangelogStore) => s.status;
