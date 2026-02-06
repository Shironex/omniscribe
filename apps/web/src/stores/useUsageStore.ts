import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ClaudeUsage, UsageStatus, UsageError } from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import { socket } from '@/lib/socket';
import { emitAsync } from '@/lib/socketHelpers';

const logger = createLogger('UsageStore');

/** Polling interval for usage data (15 minutes) */
const USAGE_POLLING_INTERVAL = 15 * 60 * 1000;

/** Data is considered stale after 2 minutes */
const STALE_THRESHOLD = 2 * 60 * 1000;

interface UsageState {
  /** Claude usage data */
  claudeUsage: ClaudeUsage | null;
  /** Current fetch status */
  status: UsageStatus;
  /** Error type if fetch failed */
  error: UsageError | null;
  /** Error message with details */
  errorMessage: string | null;
  /** Timestamp of last successful fetch */
  lastFetched: number | null;
  /** Working directory to fetch usage for */
  workingDir: string | null;
  /** Whether polling is enabled */
  pollingEnabled: boolean;
  /** Polling interval ID */
  pollingIntervalId: ReturnType<typeof setInterval> | null;
}

interface UsageActions {
  /** Fetch usage data */
  fetchUsage: (workingDir?: string) => Promise<void>;
  /** Set the working directory */
  setWorkingDir: (workingDir: string) => void;
  /** Start polling for usage updates */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
  /** Check if usage data is stale */
  isStale: () => boolean;
  /** Check if at or over limit */
  isAtLimit: () => boolean;
  /** Clear usage data and error */
  clear: () => void;
}

type UsageStore = UsageState & UsageActions;

export const useUsageStore = create<UsageStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      claudeUsage: null,
      status: 'idle',
      error: null,
      errorMessage: null,
      lastFetched: null,
      workingDir: null,
      pollingEnabled: false,
      pollingIntervalId: null,

      // Actions
      fetchUsage: async (workingDir?: string) => {
        const state = get();
        const dir = workingDir ?? state.workingDir;

        if (!dir) {
          logger.warn('No working directory set');
          return;
        }

        // Don't fetch if already fetching
        if (state.status === 'fetching') {
          return;
        }

        logger.debug('Fetching usage for', dir);
        set(
          { status: 'fetching', error: null, errorMessage: null },
          undefined,
          'usage/fetchUsageStart'
        );

        try {
          const response = await emitAsync<
            { workingDir: string },
            { usage?: ClaudeUsage; error?: UsageError; message?: string }
          >('usage:fetch', { workingDir: dir }, { timeout: 60000 });

          if (response.error) {
            logger.warn('Usage fetch error:', response.error, response.message);
            set(
              {
                status: 'error',
                error: response.error,
                errorMessage: response.message ?? null,
              },
              undefined,
              'usage/fetchUsageError'
            );
          } else if (response.usage) {
            set(
              {
                claudeUsage: response.usage,
                status: 'success',
                lastFetched: Date.now(),
                error: null,
                errorMessage: null,
              },
              undefined,
              'usage/fetchUsage'
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('Usage fetch failed:', message);
          set(
            {
              status: 'error',
              error: 'unknown',
              errorMessage: message,
            },
            undefined,
            'usage/fetchUsageException'
          );
        }
      },

      setWorkingDir: (workingDir: string) => {
        set({ workingDir }, undefined, 'usage/setWorkingDir');
      },

      startPolling: () => {
        const state = get();

        // Already polling
        if (state.pollingIntervalId) {
          return;
        }

        // Ensure socket is connected
        if (!socket.connected) {
          logger.warn('Socket not connected, cannot start polling');
          return;
        }

        logger.info('Starting usage polling');
        // Fetch immediately
        state.fetchUsage();

        // Set up interval
        const intervalId = setInterval(() => {
          get().fetchUsage();
        }, USAGE_POLLING_INTERVAL);

        set(
          { pollingEnabled: true, pollingIntervalId: intervalId },
          undefined,
          'usage/startPolling'
        );
      },

      stopPolling: () => {
        logger.info('Stopping usage polling');
        const state = get();

        if (state.pollingIntervalId) {
          clearInterval(state.pollingIntervalId);
        }

        set({ pollingEnabled: false, pollingIntervalId: null }, undefined, 'usage/stopPolling');
      },

      isStale: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - lastFetched > STALE_THRESHOLD;
      },

      isAtLimit: () => {
        const { claudeUsage } = get();
        if (!claudeUsage) return false;
        return claudeUsage.sessionPercentage >= 100;
      },

      clear: () => {
        const state = get();

        // Stop polling if active
        if (state.pollingIntervalId) {
          clearInterval(state.pollingIntervalId);
        }

        set(
          {
            claudeUsage: null,
            status: 'idle',
            error: null,
            errorMessage: null,
            lastFetched: null,
            pollingEnabled: false,
            pollingIntervalId: null,
          },
          undefined,
          'usage/clear'
        );
      },
    }),
    { name: 'usage' }
  )
);

// Selectors
export const selectUsage = (state: UsageStore) => state.claudeUsage;
export const selectUsageStatus = (state: UsageStore) => state.status;
export const selectUsageError = (state: UsageStore) => ({
  error: state.error,
  message: state.errorMessage,
});
export const selectSessionPercentage = (state: UsageStore) =>
  state.claudeUsage?.sessionPercentage ?? 0;
export const selectWeeklyPercentage = (state: UsageStore) =>
  state.claudeUsage?.weeklyPercentage ?? 0;
