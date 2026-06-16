import { create } from 'zustand';
import { devtools } from './utils/devtools';
import { createLogger, extractErrorMessage, FsEvents } from '@omniscribe/shared';
import type {
  FsEntry,
  FsReadDirPayload,
  FsReadDirResponse,
  FsWatchPayload,
  FsUnwatchPayload,
  FsWatchResponse,
  FsChangedEvent,
  FsMutateResponse,
  FsCreateFilePayload,
  FsCreateDirPayload,
  FsRenamePayload,
  FsDeletePayload,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('FsStore');

/** Stable client watch-id per active project (one watcher per project tree). */
const WATCH_ID_PREFIX = 'explorer';

/**
 * Per-directory load state keyed by absolute directory path.
 */
export interface DirNode {
  /** Loaded child entries (undefined until first load). */
  entries?: FsEntry[];
  /** Whether a load is in flight. */
  loading: boolean;
  /** Last load error, if any. */
  error?: string;
}

interface FsState extends SocketStoreState {
  /** Active project root the explorer is bound to. */
  projectPath: string | null;
  /** Per-directory node state (absolute dir path -> DirNode). */
  dirs: Record<string, DirNode>;
  /** Absolute paths of expanded directories. */
  expanded: Record<string, boolean>;
  /** The file the user last requested to open (consumed by the editor lane / WS4). */
  requestedOpenFile: string | null;
}

interface FsActions extends SocketStoreActions {
  /** Bind the explorer to a project, load its root, and start watching it. */
  setProject: (projectPath: string | null) => Promise<void>;
  /** Load (or reload) a directory's children. */
  loadDir: (dirPath: string) => Promise<void>;
  /** Expand a directory (loading children if needed). */
  expandDir: (dirPath: string) => Promise<void>;
  /** Collapse a directory. */
  collapseDir: (dirPath: string) => void;
  /** Toggle a directory's expanded state. */
  toggleDir: (dirPath: string) => Promise<void>;
  /** Create a new file under `parentDir` and reload it. */
  createFile: (parentDir: string, name: string) => Promise<string | null>;
  /** Create a new directory under `parentDir` and reload it. */
  createDir: (parentDir: string, name: string) => Promise<string | null>;
  /** Rename / move a path; reloads affected parents. */
  rename: (from: string, to: string) => Promise<boolean>;
  /** Delete (recycle) a path; reloads its parent. */
  deletePath: (target: string) => Promise<boolean>;
  /** Record a requested file open for downstream consumers (editor lane). */
  openFile: (path: string) => void;
  /** Clear the requested-open slot after a consumer handles it. */
  clearRequestedOpen: () => void;
  /** Start watching the active project (idempotent). */
  startWatch: (projectPath: string) => Promise<void>;
  /** Stop watching a project. */
  stopWatch: (projectPath: string) => Promise<void>;
  initListeners: () => void;
  cleanupListeners: () => void;
  clear: () => void;
}

type FsStore = FsState & FsActions;

const initialFsState: Pick<FsState, 'projectPath' | 'dirs' | 'expanded' | 'requestedOpenFile'> = {
  projectPath: null,
  dirs: {},
  expanded: {},
  requestedOpenFile: null,
};

function parentDirOf(targetPath: string): string {
  const idx = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
  if (idx < 0) return targetPath;
  // Root-level path (e.g. "/foo") — parent is the root separator, not the path itself.
  if (idx === 0) return targetPath.slice(0, 1);
  return targetPath.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}

export const useFsStore = create<FsStore>()(
  devtools(
    (set, get) => {
      const socketActions = createSocketActions<FsState>(set, 'fs');

      const { initListeners, cleanupListeners } = createSocketListeners<FsStore>(get, set, 'fs', {
        listeners: [
          {
            event: FsEvents.CHANGED,
            handler: (data, get) => {
              const evt = data as FsChangedEvent;
              const { projectPath, dirs } = get();
              if (!projectPath || evt.projectPath !== projectPath) return;

              // Reload every currently-loaded directory that owns a changed path.
              const affected = new Set<string>();
              for (const changed of evt.paths) {
                const parent = parentDirOf(changed);
                if (dirs[parent]?.entries) affected.add(parent);
                // The changed path may itself be a loaded directory.
                if (dirs[changed]?.entries) affected.add(changed);
              }
              for (const dir of affected) {
                get().loadDir(dir);
              }
            },
          },
        ],
        onConnect: get => {
          const { projectPath } = get();
          if (projectPath) {
            get().loadDir(projectPath);
            get().startWatch(projectPath);
          }
        },
      });

      return {
        ...initialSocketState,
        ...initialFsState,
        ...socketActions,
        initListeners,
        cleanupListeners,

        setProject: async (projectPath: string | null) => {
          const previous = get().projectPath;
          if (previous === projectPath) return;
          if (previous) {
            get().stopWatch(previous);
          }
          set({ projectPath, dirs: {}, expanded: {}, error: null }, undefined, 'fs/setProject');
          if (projectPath) {
            await get().loadDir(projectPath);
            set({ expanded: { [projectPath]: true } }, undefined, 'fs/setProjectExpandRoot');
            await get().startWatch(projectPath);
          }
        },

        loadDir: async (dirPath: string) => {
          const { projectPath } = get();
          if (!projectPath) return;
          set(
            state => ({
              dirs: {
                ...state.dirs,
                [dirPath]: { ...state.dirs[dirPath], loading: true, error: undefined },
              },
            }),
            undefined,
            'fs/loadDirStart'
          );
          try {
            const response = await emitAsync<FsReadDirPayload, FsReadDirResponse>(
              FsEvents.READ_DIR,
              { projectPath, target: dirPath }
            );
            if (response.error) {
              set(
                state => ({
                  dirs: {
                    ...state.dirs,
                    [dirPath]: { ...state.dirs[dirPath], loading: false, error: response.error },
                  },
                }),
                undefined,
                'fs/loadDirError'
              );
              return;
            }
            set(
              state => ({
                dirs: {
                  ...state.dirs,
                  [dirPath]: { entries: response.entries ?? [], loading: false, error: undefined },
                },
              }),
              undefined,
              'fs/loadDir'
            );
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to read directory');
            logger.error('loadDir error:', message);
            set(
              state => ({
                dirs: {
                  ...state.dirs,
                  [dirPath]: { ...state.dirs[dirPath], loading: false, error: message },
                },
              }),
              undefined,
              'fs/loadDirError'
            );
          }
        },

        expandDir: async (dirPath: string) => {
          set(
            state => ({ expanded: { ...state.expanded, [dirPath]: true } }),
            undefined,
            'fs/expandDir'
          );
          const node = get().dirs[dirPath];
          if (!node?.entries && !node?.loading) {
            await get().loadDir(dirPath);
          }
        },

        collapseDir: (dirPath: string) => {
          set(
            state => {
              const expanded = { ...state.expanded };
              delete expanded[dirPath];
              return { expanded };
            },
            undefined,
            'fs/collapseDir'
          );
        },

        toggleDir: async (dirPath: string) => {
          if (get().expanded[dirPath]) {
            get().collapseDir(dirPath);
          } else {
            await get().expandDir(dirPath);
          }
        },

        createFile: async (parentDir: string, name: string) => {
          const { projectPath } = get();
          if (!projectPath || !name) return null;
          const target = joinPath(parentDir, name);
          try {
            const res = await emitAsync<FsCreateFilePayload, FsMutateResponse>(
              FsEvents.CREATE_FILE,
              { projectPath, target }
            );
            if (!res.success) {
              set({ error: res.error ?? 'Failed to create file' }, undefined, 'fs/createFileError');
              return null;
            }
            await get().loadDir(parentDir);
            return res.path ?? target;
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to create file');
            set({ error: message }, undefined, 'fs/createFileError');
            return null;
          }
        },

        createDir: async (parentDir: string, name: string) => {
          const { projectPath } = get();
          if (!projectPath || !name) return null;
          const target = joinPath(parentDir, name);
          try {
            const res = await emitAsync<FsCreateDirPayload, FsMutateResponse>(FsEvents.CREATE_DIR, {
              projectPath,
              target,
            });
            if (!res.success) {
              set(
                { error: res.error ?? 'Failed to create folder' },
                undefined,
                'fs/createDirError'
              );
              return null;
            }
            await get().loadDir(parentDir);
            return res.path ?? target;
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to create folder');
            set({ error: message }, undefined, 'fs/createDirError');
            return null;
          }
        },

        rename: async (from: string, to: string) => {
          const { projectPath } = get();
          if (!projectPath) return false;
          try {
            const res = await emitAsync<FsRenamePayload, FsMutateResponse>(FsEvents.RENAME, {
              projectPath,
              from,
              to,
            });
            if (!res.success) {
              set({ error: res.error ?? 'Failed to rename' }, undefined, 'fs/renameError');
              return false;
            }
            // Reload both source and destination parents.
            await Promise.all([get().loadDir(parentDirOf(from)), get().loadDir(parentDirOf(to))]);
            return true;
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to rename');
            set({ error: message }, undefined, 'fs/renameError');
            return false;
          }
        },

        deletePath: async (target: string) => {
          const { projectPath } = get();
          if (!projectPath) return false;
          try {
            const res = await emitAsync<FsDeletePayload, FsMutateResponse>(FsEvents.DELETE, {
              projectPath,
              target,
            });
            if (!res.success) {
              set({ error: res.error ?? 'Failed to delete' }, undefined, 'fs/deleteError');
              return false;
            }
            await get().loadDir(parentDirOf(target));
            return true;
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to delete');
            set({ error: message }, undefined, 'fs/deleteError');
            return false;
          }
        },

        openFile: (path: string) => {
          set({ requestedOpenFile: path }, undefined, 'fs/openFile');
        },

        clearRequestedOpen: () => {
          set({ requestedOpenFile: null }, undefined, 'fs/clearRequestedOpen');
        },

        startWatch: async (projectPath: string) => {
          try {
            await emitAsync<FsWatchPayload, FsWatchResponse>(FsEvents.WATCH, {
              projectPath,
              watchId: `${WATCH_ID_PREFIX}:${projectPath}`,
            });
          } catch (err) {
            // Non-fatal — the tree still works without live refresh.
            logger.warn('startWatch failed:', extractErrorMessage(err, 'watch failed'));
          }
        },

        stopWatch: async (projectPath: string) => {
          try {
            await emitAsync<FsUnwatchPayload, FsWatchResponse>(FsEvents.UNWATCH, {
              projectPath,
              watchId: `${WATCH_ID_PREFIX}:${projectPath}`,
            });
          } catch (err) {
            logger.warn('stopWatch failed:', extractErrorMessage(err, 'unwatch failed'));
          }
        },

        clear: () => {
          set({ ...initialFsState, isLoading: false, error: null }, undefined, 'fs/clear');
        },
      };
    },
    { name: 'fs' }
  )
);

// Selectors
export const selectFsProjectPath = (state: FsStore) => state.projectPath;
export const selectFsError = (state: FsStore) => state.error;
export const selectRequestedOpenFile = (state: FsStore) => state.requestedOpenFile;
export const selectDirNode = (dirPath: string) => (state: FsStore) => state.dirs[dirPath];
export const selectIsExpanded = (dirPath: string) => (state: FsStore) =>
  Boolean(state.expanded[dirPath]);
