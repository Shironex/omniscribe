import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger, extractErrorMessage, GitEvents } from '@omniscribe/shared';
import type { GitFileDiff, GitDiffPayload, GitDiffResponse } from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';

const logger = createLogger('DiffStore');

interface DiffData {
  files: GitFileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

interface DiffState {
  /** Diff data keyed by projectPath */
  diffs: Record<string, DiffData>;
  /** Loading state per project */
  loading: Record<string, boolean>;
  /** Error per project */
  errors: Record<string, string | null>;
}

interface DiffActions {
  fetchDiff: (projectPath: string, baseCommit?: string) => Promise<void>;
  clearDiff: (projectPath: string) => void;
  clear: () => void;
}

type DiffStore = DiffState & DiffActions;

export const useDiffStore = create<DiffStore>()(
  devtools(
    set => ({
      diffs: {},
      loading: {},
      errors: {},

      fetchDiff: async (projectPath: string, baseCommit?: string) => {
        logger.debug('fetchDiff', projectPath);
        set(
          state => ({
            loading: { ...state.loading, [projectPath]: true },
            errors: { ...state.errors, [projectPath]: null },
          }),
          undefined,
          'diff/fetchStart'
        );

        try {
          const response = await emitAsync<GitDiffPayload, GitDiffResponse>(GitEvents.DIFF, {
            projectPath,
            baseCommit,
            includeUntracked: true,
          });

          if (response.error) {
            logger.error('fetchDiff error:', response.error);
            set(
              state => ({
                loading: { ...state.loading, [projectPath]: false },
                errors: { ...state.errors, [projectPath]: response.error ?? null },
              }),
              undefined,
              'diff/fetchError'
            );
          } else {
            set(
              state => ({
                diffs: {
                  ...state.diffs,
                  [projectPath]: {
                    files: response.files,
                    totalAdditions: response.totalAdditions,
                    totalDeletions: response.totalDeletions,
                  },
                },
                loading: { ...state.loading, [projectPath]: false },
                errors: { ...state.errors, [projectPath]: null },
              }),
              undefined,
              'diff/fetchSuccess'
            );
          }
        } catch (err) {
          const message = extractErrorMessage(err, 'Failed to fetch diff');
          logger.error('fetchDiff error:', message);
          set(
            state => ({
              loading: { ...state.loading, [projectPath]: false },
              errors: { ...state.errors, [projectPath]: message },
            }),
            undefined,
            'diff/fetchError'
          );
        }
      },

      clearDiff: (projectPath: string) => {
        set(
          state => {
            const { [projectPath]: _, ...restDiffs } = state.diffs;
            const { [projectPath]: __, ...restLoading } = state.loading;
            const { [projectPath]: ___, ...restErrors } = state.errors;
            return { diffs: restDiffs, loading: restLoading, errors: restErrors };
          },
          undefined,
          'diff/clear'
        );
      },

      clear: () => {
        set({ diffs: {}, loading: {}, errors: {} }, undefined, 'diff/clearAll');
      },
    }),
    { name: 'diff' }
  )
);

/** Select diff data for a project */
export const selectDiff = (projectPath: string | null) => (state: DiffStore) =>
  projectPath ? state.diffs[projectPath] : undefined;

/** Select loading state for a project */
export const selectDiffLoading = (projectPath: string | null) => (state: DiffStore) =>
  projectPath ? (state.loading[projectPath] ?? false) : false;

/** Select error for a project */
export const selectDiffError = (projectPath: string | null) => (state: DiffStore) =>
  projectPath ? (state.errors[projectPath] ?? null) : null;
