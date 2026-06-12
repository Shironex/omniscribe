import { create } from 'zustand';
import { devtools } from './utils/devtools';
import {
  createLogger,
  extractErrorMessage,
  ScmEvents,
  type ScmChangedEvent,
  type ScmCommitFile,
  type ScmCommitFileDiffPayload,
  type ScmCommitPayload,
  type ScmCommitResponse,
  type ScmDiffResponse,
  type ScmErrorCode,
  type ScmFileDiffPayload,
  type ScmHunkPayload,
  type ScmLogEntry,
  type ScmLogPayload,
  type ScmLogResponse,
  type ScmMutationResponse,
  type ScmPanelSnapshotPayload,
  type ScmPanelSnapshotResponse,
  type ScmRemotePayload,
  type ScmRemoteResponse,
  type ScmShowCommitPayload,
  type ScmShowCommitResponse,
  type ScmStagePayload,
  type GitFileDiff,
  type GitFileStatus,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('ScmStore');

/**
 * Per-operation pending flags so the UI can show targeted spinners (e.g. a
 * spinner on the Push button only) without a single global `isLoading`.
 */
export interface ScmPending {
  fetch: boolean;
  pull: boolean;
  push: boolean;
  commit: boolean;
  /** Set of repo-relative paths with an in-flight stage/unstage/discard op. */
  paths: Set<string>;
}

/** Which diff is currently selected for the diff surface. */
export type ScmDiffSource =
  | { kind: 'file'; path: string; staged: boolean }
  | { kind: 'commit'; sha: string; path: string };

export interface ScmSelectedDiff {
  source: ScmDiffSource;
  /** The resolved diff, or null while loading / when the file had no changes. */
  file: GitFileDiff | null;
  loading: boolean;
  error: string | null;
}

interface ScmState extends SocketStoreState {
  /** Active project path being tracked. */
  projectPath: string | null;
  /** Latest panel snapshot, or null before the first refresh. */
  snapshot: ScmPanelSnapshotResponse | null;
  /** Per-operation pending state. */
  pending: ScmPending;
  /** Machine-readable code from the last failed op, for branchable UI. */
  lastErrorCode: ScmErrorCode | null;

  // History (log) pagination
  log: ScmLogEntry[];
  logNextBeforeSha: string | undefined;
  logLoading: boolean;
  /** Files of the currently-expanded commit, keyed by sha. */
  commitFiles: Record<string, ScmCommitFile[]>;

  // Diff surface
  selectedDiff: ScmSelectedDiff | null;
}

interface ScmActions extends SocketStoreActions {
  /** Switch the tracked project; clears prior state. */
  setProject: (projectPath: string | null) => void;
  /** Re-fetch the batched panel snapshot for the active project. */
  refresh: (projectPath?: string) => Promise<void>;

  // Mutations (all refresh the snapshot on success via scm:changed)
  stage: (paths: string[]) => Promise<boolean>;
  unstage: (paths: string[]) => Promise<boolean>;
  discard: (paths: string[]) => Promise<boolean>;
  stageHunk: (filePath: string, patch: string) => Promise<boolean>;
  unstageHunk: (filePath: string, patch: string) => Promise<boolean>;
  commit: (message: string, amend?: boolean) => Promise<boolean>;
  fetchRemote: () => Promise<boolean>;
  pull: () => Promise<boolean>;
  push: () => Promise<boolean>;

  // History
  loadLog: (reset?: boolean) => Promise<void>;
  loadMoreLog: () => Promise<void>;
  loadCommitFiles: (sha: string) => Promise<void>;

  // Diff surface
  selectFileDiff: (path: string, staged: boolean) => Promise<void>;
  selectCommitFileDiff: (sha: string, path: string) => Promise<void>;
  clearSelectedDiff: () => void;

  clear: () => void;
  initListeners: () => void;
  cleanupListeners: () => void;
}

type ScmStore = ScmState & ScmActions;

const initialPending: ScmPending = {
  fetch: false,
  pull: false,
  push: false,
  commit: false,
  paths: new Set(),
};

const initialScmState: Omit<ScmState, keyof SocketStoreState> = {
  projectPath: null,
  snapshot: null,
  pending: initialPending,
  lastErrorCode: null,
  log: [],
  logNextBeforeSha: undefined,
  logLoading: false,
  commitFiles: {},
  selectedDiff: null,
};

/**
 * Map a {@link ScmErrorCode} to a friendly, actionable user message. Falls back
 * to the raw error text the backend supplied when no specific mapping applies.
 */
export function scmErrorMessage(code: ScmErrorCode | undefined, fallback: string): string {
  switch (code) {
    case 'NOT_A_REPO':
      return 'This folder is not a git repository.';
    case 'INVALID_PATH':
      return 'That path is not valid for this repository.';
    case 'NOTHING_TO_COMMIT':
      return 'Nothing staged to commit.';
    case 'HOOK_FAILED':
      return fallback || 'A git hook rejected the operation.';
    case 'NO_UPSTREAM':
      return 'The current branch has no upstream. Push to set one.';
    case 'NO_REMOTE':
      return 'No remote is configured for this repository.';
    case 'DIVERGED':
      return 'Local and remote histories have diverged. Pull or rebase first.';
    case 'AUTH_FAILED':
      return 'Authentication with the remote failed. Check your credentials.';
    case 'CONFLICT':
      return 'The operation hit a merge conflict.';
    case 'PATCH_FAILED':
      return fallback || 'Could not apply the selected hunk.';
    case 'GIT_ERROR':
    default:
      return fallback || 'A git error occurred.';
  }
}

export const useScmStore = create<ScmStore>()(
  devtools(
    (set, get) => {
      const socketActions = createSocketActions<ScmState>(set, 'scm');

      const { initListeners, cleanupListeners } = createSocketListeners<ScmStore>(get, set, 'scm', {
        listeners: [
          {
            event: ScmEvents.CHANGED,
            handler: (data, get) => {
              const evt = data as ScmChangedEvent;
              const { projectPath } = get();
              if (!projectPath || evt.projectPath !== projectPath) return;
              // A mutation completed somewhere — re-pull the snapshot. Also
              // refresh the open diff so staged/unstaged content stays live.
              get().refresh(projectPath);
              const sel = get().selectedDiff;
              if (sel?.source.kind === 'file') {
                get().selectFileDiff(sel.source.path, sel.source.staged);
              }
            },
          },
        ],
        onConnect: get => {
          const { projectPath } = get();
          if (projectPath) get().refresh(projectPath);
        },
      });

      /** Mark/clear a set of paths as pending (immutable Set swap). */
      const setPathsPending = (paths: string[], pending: boolean) => {
        set(
          state => {
            const next = new Set(state.pending.paths);
            for (const p of paths) {
              if (pending) next.add(p);
              else next.delete(p);
            }
            return { pending: { ...state.pending, paths: next } };
          },
          undefined,
          `scm/setPathsPending`
        );
      };

      /** Set a named boolean pending flag. */
      const setFlag = (key: 'fetch' | 'pull' | 'push' | 'commit', value: boolean) => {
        set(
          state => ({ pending: { ...state.pending, [key]: value } }),
          undefined,
          `scm/pending/${key}`
        );
      };

      /**
       * Run a path-set mutation (stage/unstage/discard/hunk): toggles pending
       * for the affected paths, maps typed errors, and lets `scm:changed` drive
       * the snapshot refresh. Returns whether it succeeded.
       */
      const runPathMutation = async (
        action: string,
        paths: string[],
        run: () => Promise<ScmMutationResponse>
      ): Promise<boolean> => {
        setPathsPending(paths, true);
        set({ error: null, lastErrorCode: null }, undefined, `scm/${action}/start`);
        try {
          const response = await run();
          if (!response.success) {
            const message = scmErrorMessage(response.errorCode, response.error ?? '');
            logger.warn(`${action} failed:`, message);
            set(
              { error: message, lastErrorCode: response.errorCode ?? 'GIT_ERROR' },
              undefined,
              `scm/${action}/error`
            );
            return false;
          }
          return true;
        } catch (err) {
          const message = extractErrorMessage(err, `Failed to ${action}`);
          logger.error(`${action} error:`, message);
          set({ error: message, lastErrorCode: 'GIT_ERROR' }, undefined, `scm/${action}/error`);
          return false;
        } finally {
          setPathsPending(paths, false);
        }
      };

      /**
       * Run a remote op (fetch/pull/push): toggles its named flag, maps typed
       * errors. The backend broadcasts scm:changed on success.
       */
      const runRemote = async (key: 'fetch' | 'pull' | 'push', event: string): Promise<boolean> => {
        const projectPath = get().projectPath;
        if (!projectPath) return false;
        setFlag(key, true);
        set({ error: null, lastErrorCode: null }, undefined, `scm/${key}/start`);
        try {
          const response = await emitAsync<ScmRemotePayload, ScmRemoteResponse>(event, {
            projectPath,
          });
          if (!response.success) {
            const message = scmErrorMessage(response.errorCode, response.error ?? '');
            logger.warn(`${key} failed:`, message);
            set(
              { error: message, lastErrorCode: response.errorCode ?? 'GIT_ERROR' },
              undefined,
              `scm/${key}/error`
            );
            return false;
          }
          // Fetch doesn't broadcast scm:changed (no worktree mutation), so pull
          // the snapshot to update ahead/behind.
          if (key === 'fetch') await get().refresh(projectPath);
          return true;
        } catch (err) {
          const message = extractErrorMessage(err, `Failed to ${key}`);
          logger.error(`${key} error:`, message);
          set({ error: message, lastErrorCode: 'GIT_ERROR' }, undefined, `scm/${key}/error`);
          return false;
        } finally {
          setFlag(key, false);
        }
      };

      return {
        ...initialSocketState,
        ...initialScmState,
        ...socketActions,
        initListeners,
        cleanupListeners,

        setProject: (projectPath: string | null) => {
          const previous = get().projectPath;
          if (previous === projectPath) return;
          set(
            {
              ...initialScmState,
              pending: { ...initialPending, paths: new Set() },
              projectPath,
            },
            undefined,
            'scm/setProject'
          );
          if (projectPath) get().refresh(projectPath);
        },

        refresh: async (projectPathArg?: string) => {
          const projectPath = projectPathArg ?? get().projectPath;
          if (!projectPath) return;
          set({ isLoading: true, error: null }, undefined, 'scm/refresh/start');
          try {
            const response = await emitAsync<ScmPanelSnapshotPayload, ScmPanelSnapshotResponse>(
              ScmEvents.PANEL_SNAPSHOT,
              { projectPath }
            );
            if (response.error) {
              set(
                {
                  isLoading: false,
                  error: scmErrorMessage(response.errorCode, response.error),
                  lastErrorCode: response.errorCode ?? 'GIT_ERROR',
                },
                undefined,
                'scm/refresh/error'
              );
              return;
            }
            // Ignore a snapshot that arrived after the project changed.
            if (get().projectPath !== projectPath) return;
            set(
              { snapshot: response, isLoading: false, error: null, lastErrorCode: null },
              undefined,
              'scm/refresh'
            );
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to load source control');
            logger.error('refresh error:', message);
            set({ error: message, isLoading: false }, undefined, 'scm/refresh/error');
          }
        },

        stage: paths =>
          withProject(get, projectPath =>
            runPathMutation('stage', paths, () =>
              emitAsync<ScmStagePayload, ScmMutationResponse>(ScmEvents.STAGE, {
                projectPath,
                paths,
              })
            )
          ),

        unstage: paths =>
          withProject(get, projectPath =>
            runPathMutation('unstage', paths, () =>
              emitAsync<ScmStagePayload, ScmMutationResponse>(ScmEvents.UNSTAGE, {
                projectPath,
                paths,
              })
            )
          ),

        discard: paths =>
          withProject(get, projectPath =>
            runPathMutation('discard', paths, () =>
              emitAsync<ScmStagePayload, ScmMutationResponse>(ScmEvents.DISCARD, {
                projectPath,
                paths,
              })
            )
          ),

        stageHunk: (filePath, patch) =>
          withProject(get, projectPath =>
            runPathMutation('stage hunk', [filePath], () =>
              emitAsync<ScmHunkPayload, ScmMutationResponse>(ScmEvents.STAGE_HUNK, {
                projectPath,
                filePath,
                patch,
              })
            )
          ),

        unstageHunk: (filePath, patch) =>
          withProject(get, projectPath =>
            runPathMutation('unstage hunk', [filePath], () =>
              emitAsync<ScmHunkPayload, ScmMutationResponse>(ScmEvents.UNSTAGE_HUNK, {
                projectPath,
                filePath,
                patch,
              })
            )
          ),

        commit: async (message, amend = false) => {
          const projectPath = get().projectPath;
          if (!projectPath) return false;
          setFlag('commit', true);
          set({ error: null, lastErrorCode: null }, undefined, 'scm/commit/start');
          try {
            const response = await emitAsync<ScmCommitPayload, ScmCommitResponse>(
              ScmEvents.COMMIT,
              { projectPath, message, amend }
            );
            if (!response.success) {
              const msg = scmErrorMessage(response.errorCode, response.error ?? '');
              logger.warn('commit failed:', msg);
              set(
                { error: msg, lastErrorCode: response.errorCode ?? 'GIT_ERROR' },
                undefined,
                'scm/commit/error'
              );
              return false;
            }
            // scm:changed will refresh the snapshot; refresh the log too so the
            // new commit appears at the top of history.
            get().loadLog(true);
            return true;
          } catch (err) {
            const msg = extractErrorMessage(err, 'Failed to commit');
            logger.error('commit error:', msg);
            set({ error: msg, lastErrorCode: 'GIT_ERROR' }, undefined, 'scm/commit/error');
            return false;
          } finally {
            setFlag('commit', false);
          }
        },

        fetchRemote: () => runRemote('fetch', ScmEvents.FETCH),
        pull: () => runRemote('pull', ScmEvents.PULL),
        push: () => runRemote('push', ScmEvents.PUSH),

        loadLog: async (reset = true) => {
          const projectPath = get().projectPath;
          if (!projectPath) return;
          set({ logLoading: true }, undefined, 'scm/loadLog/start');
          try {
            const response = await emitAsync<ScmLogPayload, ScmLogResponse>(ScmEvents.LOG, {
              projectPath,
              limit: 50,
            });
            if (response.error) {
              set(
                { logLoading: false, error: scmErrorMessage(response.errorCode, response.error) },
                undefined,
                'scm/loadLog/error'
              );
              return;
            }
            if (get().projectPath !== projectPath) return;
            set(
              {
                log: reset ? response.commits : [...get().log, ...response.commits],
                logNextBeforeSha: response.nextBeforeSha,
                logLoading: false,
              },
              undefined,
              'scm/loadLog'
            );
          } catch (err) {
            logger.error('loadLog error:', extractErrorMessage(err, 'Failed to load history'));
            set({ logLoading: false }, undefined, 'scm/loadLog/error');
          }
        },

        loadMoreLog: async () => {
          const { projectPath, logNextBeforeSha, logLoading, log } = get();
          if (!projectPath || !logNextBeforeSha || logLoading) return;
          set({ logLoading: true }, undefined, 'scm/loadMoreLog/start');
          try {
            const response = await emitAsync<ScmLogPayload, ScmLogResponse>(ScmEvents.LOG, {
              projectPath,
              limit: 50,
              beforeSha: logNextBeforeSha,
            });
            if (get().projectPath !== projectPath) return;
            if (response.error) {
              set({ logLoading: false }, undefined, 'scm/loadMoreLog/error');
              return;
            }
            set(
              {
                log: [...log, ...response.commits],
                logNextBeforeSha: response.nextBeforeSha,
                logLoading: false,
              },
              undefined,
              'scm/loadMoreLog'
            );
          } catch (err) {
            logger.error('loadMoreLog error:', extractErrorMessage(err, 'Failed to load more'));
            set({ logLoading: false }, undefined, 'scm/loadMoreLog/error');
          }
        },

        loadCommitFiles: async (sha: string) => {
          const projectPath = get().projectPath;
          if (!projectPath) return;
          try {
            const response = await emitAsync<ScmShowCommitPayload, ScmShowCommitResponse>(
              ScmEvents.SHOW_COMMIT,
              { projectPath, sha }
            );
            if (response.error || get().projectPath !== projectPath) return;
            set(
              { commitFiles: { ...get().commitFiles, [sha]: response.files } },
              undefined,
              'scm/loadCommitFiles'
            );
          } catch (err) {
            logger.error('loadCommitFiles error:', extractErrorMessage(err, 'Failed'));
          }
        },

        selectFileDiff: async (path: string, staged: boolean) => {
          const projectPath = get().projectPath;
          if (!projectPath) return;
          set(
            {
              selectedDiff: {
                source: { kind: 'file', path, staged },
                file: get().selectedDiff?.file ?? null,
                loading: true,
                error: null,
              },
            },
            undefined,
            'scm/selectFileDiff/start'
          );
          try {
            const response = await emitAsync<ScmFileDiffPayload, ScmDiffResponse>(
              ScmEvents.FILE_DIFF,
              { projectPath, path, staged }
            );
            // Drop a stale result if the selection moved on.
            const sel = get().selectedDiff;
            if (
              !sel ||
              sel.source.kind !== 'file' ||
              sel.source.path !== path ||
              sel.source.staged !== staged
            ) {
              return;
            }
            set(
              {
                selectedDiff: {
                  source: { kind: 'file', path, staged },
                  file: response.file ?? null,
                  loading: false,
                  error: response.error
                    ? scmErrorMessage(response.errorCode, response.error)
                    : null,
                },
              },
              undefined,
              'scm/selectFileDiff'
            );
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to load diff');
            set(
              {
                selectedDiff: {
                  source: { kind: 'file', path, staged },
                  file: null,
                  loading: false,
                  error: message,
                },
              },
              undefined,
              'scm/selectFileDiff/error'
            );
          }
        },

        selectCommitFileDiff: async (sha: string, path: string) => {
          const projectPath = get().projectPath;
          if (!projectPath) return;
          set(
            {
              selectedDiff: {
                source: { kind: 'commit', sha, path },
                file: null,
                loading: true,
                error: null,
              },
            },
            undefined,
            'scm/selectCommitFileDiff/start'
          );
          try {
            const response = await emitAsync<ScmCommitFileDiffPayload, ScmDiffResponse>(
              ScmEvents.COMMIT_FILE_DIFF,
              { projectPath, sha, path }
            );
            const sel = get().selectedDiff;
            if (
              !sel ||
              sel.source.kind !== 'commit' ||
              sel.source.sha !== sha ||
              sel.source.path !== path
            ) {
              return;
            }
            set(
              {
                selectedDiff: {
                  source: { kind: 'commit', sha, path },
                  file: response.file ?? null,
                  loading: false,
                  error: response.error
                    ? scmErrorMessage(response.errorCode, response.error)
                    : null,
                },
              },
              undefined,
              'scm/selectCommitFileDiff'
            );
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to load diff');
            set(
              {
                selectedDiff: {
                  source: { kind: 'commit', sha, path },
                  file: null,
                  loading: false,
                  error: message,
                },
              },
              undefined,
              'scm/selectCommitFileDiff/error'
            );
          }
        },

        clearSelectedDiff: () => {
          set({ selectedDiff: null }, undefined, 'scm/clearSelectedDiff');
        },

        clear: () => {
          set(
            {
              ...initialScmState,
              pending: { ...initialPending, paths: new Set() },
              isLoading: false,
              error: null,
            },
            undefined,
            'scm/clear'
          );
        },
      };
    },
    { name: 'scm' }
  )
);

/** Run a callback only when a project is active; resolves false otherwise. */
function withProject(
  get: () => ScmStore,
  fn: (projectPath: string) => Promise<boolean>
): Promise<boolean> {
  const projectPath = get().projectPath;
  if (!projectPath) return Promise.resolve(false);
  return fn(projectPath);
}

// ============================================================================
//  Selectors
// ============================================================================

/** Total number of changed files (staged + unstaged + untracked + conflicts). */
export function selectChangedCount(state: ScmStore): number {
  const s = state.snapshot;
  if (!s) return 0;
  return s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length;
}

/** Whether anything is currently staged (drives commit-button enablement). */
export function selectHasStaged(state: ScmStore): boolean {
  return (state.snapshot?.staged.length ?? 0) > 0;
}

/**
 * Join the repo root with a repo-relative path into the absolute path the file
 * explorer keys its tree rows by. Mirrors the explorer's path joining (always
 * '/'-separated on the parts git emits; the root already carries its own sep).
 */
function joinRepoPath(root: string, rel: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const normalizedRel = sep === '\\' ? rel.replace(/\//g, '\\') : rel;
  return root.endsWith(sep) ? `${root}${normalizedRel}` : `${root}${sep}${normalizedRel}`;
}

/**
 * Build a map of ABSOLUTE file path → {@link GitFileStatus} from the current
 * snapshot, for the file explorer's git coloring. Worktree status wins over the
 * index status for a file changed on both sides (matches VS Code). Conflicts
 * take top priority, then untracked.
 *
 * Memoized on the snapshot identity so the explorer doesn't re-render on every
 * store write — recompute only when a fresh snapshot lands.
 */
let _statusCache: {
  snapshot: ScmPanelSnapshotResponse | null;
  result: Record<string, GitFileStatus>;
} | null = null;

export function selectStatusByPath(state: ScmStore): Record<string, GitFileStatus> {
  const snapshot = state.snapshot;
  if (_statusCache && _statusCache.snapshot === snapshot) {
    return _statusCache.result;
  }
  const result: Record<string, GitFileStatus> = {};
  if (snapshot?.isRepo && snapshot.rootPath) {
    const root = snapshot.rootPath;
    // Lowest priority first so higher-priority buckets overwrite.
    for (const f of snapshot.staged) result[joinRepoPath(root, f.path)] = f.status;
    for (const f of snapshot.unstaged) result[joinRepoPath(root, f.path)] = f.status;
    for (const f of snapshot.untracked) result[joinRepoPath(root, f.path)] = 'untracked';
    for (const f of snapshot.conflicted) result[joinRepoPath(root, f.path)] = 'conflicted';
  }
  _statusCache = { snapshot, result };
  return result;
}
