import { create } from 'zustand';
import { arrayMove } from '@dnd-kit/sortable';
import { devtools } from './utils/devtools';
import { createLogger, extractErrorMessage, FsEvents } from '@omniscribe/shared';
import type {
  FsReadFilePayload,
  FsReadFileResponse,
  FsWriteFilePayload,
  FsMutateResponse,
  FsChangedEvent,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';
import { useFsStore } from './useFsStore';
import { useAppUIStore } from './useAppUIStore';
import { useSettingsStore } from './useSettingsStore';

const logger = createLogger('EditorStore');

/**
 * A single open file in the editor stack. Content / savedContent track the
 * dirty diff; binary / tooLarge files are opened as read-only placeholders.
 */
export interface OpenFile {
  /** Absolute path of the file. */
  path: string;
  /** Current (possibly edited) buffer content. */
  content: string;
  /** Last content persisted to disk — `content !== savedContent` ⇒ dirty. */
  savedContent: string;
  /** Convenience flag, kept in sync with content/savedContent on every edit. */
  dirty: boolean;
  /** True when the backend reported the file as binary (NUL-byte sniff). */
  binary?: boolean;
  /** True when the file exceeded the read size cap. */
  tooLarge?: boolean;
  /** A load is in flight (content not yet available). */
  loading: boolean;
  /** Load / save error for this file, if any. */
  error?: string;
  /**
   * The on-disk content changed under us while this buffer was dirty. The UI
   * surfaces a banner offering Reload (take disk) / Keep (keep buffer). Holds
   * the latest disk content so Reload is a local swap (no re-read needed).
   */
  externallyChanged?: boolean;
  /** Disk content captured when an external change arrived while dirty. */
  externalContent?: string;
  /** UI-level read-only guard (e.g. paths under `.git/`). */
  readOnly?: boolean;
}

/** A persisted open-file stack for a single project root. */
interface ProjectStack {
  /** Open files, in tab order. */
  files: OpenFile[];
  /** Path of the focused tab, or null when nothing is open. */
  activePath: string | null;
}

interface EditorState extends SocketStoreState {
  /** The project root the editor is bound to (used for FS scoping). */
  projectPath: string | null;
  /** Open files, in tab order. */
  files: OpenFile[];
  /** Path of the focused tab, or null when nothing is open. */
  activePath: string | null;
  /**
   * Per-project open-file stacks. Switching project roots stashes the active
   * stack here and restores the target's, so A→B→A brings back A's open tabs
   * (including unsaved dirty buffers) instead of wiping them.
   */
  stacks: Record<string, ProjectStack>;
}

interface EditorActions extends SocketStoreActions {
  /**
   * Bind the editor to a project root. Stashes the current project's open stack
   * and restores the target project's previously-open files (reconciling each
   * against disk) so switching projects preserves open tabs.
   */
  setProject: (projectPath: string | null) => void;
  /** Open a file (read via FS); focuses the tab if already open. */
  openFile: (projectPath: string, path: string) => Promise<void>;
  /** Close a file. Dirty-confirm is handled by the UI before calling. */
  closeFile: (path: string) => void;
  /** Reorder the open-file tabs (drag-and-drop), preserving the active tab. */
  reorderFiles: (activePath: string, overPath: string) => void;
  /** Focus an already-open tab. */
  setActivePath: (path: string) => void;
  /** Replace a file's buffer content (recomputes dirty). */
  setContent: (path: string, content: string) => void;
  /** Persist a file to disk (atomic write); updates savedContent. */
  save: (path: string) => Promise<boolean>;
  /** Persist every dirty, writable file. */
  saveAll: () => Promise<void>;
  /** Mark a file as changed on disk while its buffer is dirty (banner trigger). */
  markExternallyChanged: (path: string, diskContent: string) => void;
  /** Resolve an external-change banner by taking disk content. */
  reloadFromDisk: (path: string) => void;
  /** Resolve an external-change banner by keeping the in-memory buffer. */
  keepLocal: (path: string) => void;
  initListeners: () => void;
  cleanupListeners: () => void;
  clear: () => void;
}

type EditorStore = EditorState & EditorActions;

const initialEditorState: Pick<EditorState, 'projectPath' | 'files' | 'activePath' | 'stacks'> = {
  projectPath: null,
  files: [],
  activePath: null,
  stacks: {},
};

/** A path is read-only at the UI level when it lives inside a `.git/` dir. */
function isReadOnlyPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized.includes('/.git/') || normalized.endsWith('/.git');
}

/** Replace one file in the list, preserving order. */
function patchFile(files: OpenFile[], path: string, patch: Partial<OpenFile>): OpenFile[] {
  return files.map(f => (f.path === path ? { ...f, ...patch } : f));
}

export const useEditorStore = create<EditorStore>()(
  devtools(
    (set, get) => {
      const socketActions = createSocketActions<EditorState>(set, 'editor');

      const { initListeners, cleanupListeners } = createSocketListeners<EditorStore>(
        get,
        set,
        'editor',
        {
          listeners: [
            {
              event: FsEvents.CHANGED,
              handler: (data, get) => {
                const evt = data as FsChangedEvent;
                const { projectPath, files } = get();
                if (!projectPath || evt.projectPath !== projectPath) return;

                // Only react to changes that touch a currently-open file.
                const changed = new Set(evt.paths);
                for (const file of files) {
                  if (!changed.has(file.path)) continue;
                  // Placeholder panes (binary/too-large) don't track content.
                  if (file.binary || file.tooLarge) continue;
                  // Re-read the latest disk content; reconcile against dirty state.
                  reloadOpenFile(file.path);
                }
              },
            },
          ],
        }
      );

      /**
       * Re-read an open file's disk content and reconcile:
       *  - clean buffer → silently swap to disk content.
       *  - dirty buffer → stash disk content and raise the externallyChanged banner.
       */
      async function reloadOpenFile(path: string) {
        const { projectPath, files } = get();
        if (!projectPath) return;
        const current = files.find(f => f.path === path);
        if (!current) return;
        try {
          const response = await emitAsync<FsReadFilePayload, FsReadFileResponse>(
            FsEvents.READ_FILE,
            { projectPath, target: path }
          );
          // File became binary/too-large/errored — leave the buffer as-is.
          if (response.error || response.binary || response.tooLarge) return;
          const diskContent = response.content ?? '';
          const latest = get().files.find(f => f.path === path);
          if (!latest) return;
          if (latest.dirty) {
            // Only flag an external change when the on-disk content actually
            // diverged from the baseline the buffer was edited from — re-reading
            // an unchanged file (e.g. when restoring a background project's stack)
            // must not raise a spurious banner. Clear any stale banner otherwise.
            if (diskContent !== latest.savedContent) {
              get().markExternallyChanged(path, diskContent);
            } else if (latest.externallyChanged) {
              get().keepLocal(path);
            }
          } else {
            set(
              state => ({
                files: patchFile(state.files, path, {
                  content: diskContent,
                  savedContent: diskContent,
                  dirty: false,
                  externallyChanged: false,
                  externalContent: undefined,
                }),
              }),
              undefined,
              'editor/reloadSilent'
            );
          }
        } catch (err) {
          logger.warn('reloadOpenFile failed:', extractErrorMessage(err, 'reload failed'));
        }
      }

      return {
        ...initialSocketState,
        ...initialEditorState,
        ...socketActions,
        initListeners,
        cleanupListeners,

        setProject: (projectPath: string | null) => {
          const prevProject = get().projectPath;
          if (prevProject === projectPath) return;

          const { files: prevFiles, activePath: prevActivePath, stacks } = get();

          // Stash the outgoing project's stack so we can restore it later. We
          // keep the in-memory buffers verbatim (including unsaved dirty edits);
          // they are reconciled against disk when the project is restored.
          const nextStacks: Record<string, ProjectStack> = { ...stacks };
          if (prevProject) {
            nextStacks[prevProject] = { files: prevFiles, activePath: prevActivePath };
          }

          // Restore the incoming project's previously-open stack (empty if it
          // was never opened or has no remembered files).
          const restored = (projectPath && nextStacks[projectPath]) || {
            files: [],
            activePath: null,
          };

          set(
            {
              projectPath,
              files: restored.files,
              activePath: restored.activePath,
              stacks: nextStacks,
              error: null,
            },
            undefined,
            'editor/setProject'
          );

          // Reconcile every restored, content-bearing file against disk so a
          // background project's tabs reflect any edits made while it was away:
          //  - clean buffer  → silently take the latest disk content.
          //  - dirty buffer whose disk content changed → raise the
          //    externallyChanged banner (handled inside reloadOpenFile).
          if (projectPath) {
            for (const file of restored.files) {
              if (file.binary || file.tooLarge || file.loading) continue;
              void reloadOpenFile(file.path);
            }
          }
        },

        openFile: async (projectPath: string, path: string) => {
          // Already open → just focus it.
          const existing = get().files.find(f => f.path === path);
          if (existing) {
            set({ activePath: path }, undefined, 'editor/focusExisting');
            return;
          }

          const readOnly = isReadOnlyPath(path);
          // Insert a loading placeholder so the tab appears immediately.
          set(
            state => ({
              projectPath,
              files: [
                ...state.files,
                {
                  path,
                  content: '',
                  savedContent: '',
                  dirty: false,
                  loading: true,
                  readOnly,
                },
              ],
              activePath: path,
            }),
            undefined,
            'editor/openStart'
          );

          try {
            const response = await emitAsync<FsReadFilePayload, FsReadFileResponse>(
              FsEvents.READ_FILE,
              { projectPath, target: path }
            );

            if (response.error) {
              set(
                state => ({
                  files: patchFile(state.files, path, {
                    loading: false,
                    error: response.error,
                  }),
                }),
                undefined,
                'editor/openError'
              );
              return;
            }

            if (response.binary) {
              set(
                state => ({
                  files: patchFile(state.files, path, { loading: false, binary: true }),
                }),
                undefined,
                'editor/openBinary'
              );
              return;
            }

            if (response.tooLarge) {
              set(
                state => ({
                  files: patchFile(state.files, path, { loading: false, tooLarge: true }),
                }),
                undefined,
                'editor/openTooLarge'
              );
              return;
            }

            const content = response.content ?? '';
            set(
              state => ({
                files: patchFile(state.files, path, {
                  content,
                  savedContent: content,
                  dirty: false,
                  loading: false,
                  error: undefined,
                }),
              }),
              undefined,
              'editor/openLoaded'
            );
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to open file');
            logger.error('openFile error:', message);
            set(
              state => ({
                files: patchFile(state.files, path, { loading: false, error: message }),
              }),
              undefined,
              'editor/openError'
            );
          }
        },

        closeFile: (path: string) => {
          set(
            state => {
              const remaining = state.files.filter(f => f.path !== path);
              let activePath = state.activePath;
              if (activePath === path) {
                // Focus the neighbor that took the closed tab's slot.
                const closedIndex = state.files.findIndex(f => f.path === path);
                const next = remaining[Math.min(closedIndex, remaining.length - 1)] ?? remaining[0];
                activePath = next ? next.path : null;
              }
              return { files: remaining, activePath };
            },
            undefined,
            'editor/closeFile'
          );
        },

        reorderFiles: (activePath: string, overPath: string) => {
          if (activePath === overPath) return;
          set(
            state => {
              const oldIndex = state.files.findIndex(f => f.path === activePath);
              const newIndex = state.files.findIndex(f => f.path === overPath);
              if (oldIndex === -1 || newIndex === -1) return state;
              return { files: arrayMove(state.files, oldIndex, newIndex) };
            },
            undefined,
            'editor/reorderFiles'
          );
        },

        setActivePath: (path: string) => {
          if (get().files.some(f => f.path === path)) {
            set({ activePath: path }, undefined, 'editor/setActivePath');
          }
        },

        setContent: (path: string, content: string) => {
          set(
            state => ({
              files: state.files.map(f => {
                if (f.path !== path) return f;
                if (f.readOnly || f.binary || f.tooLarge) return f;
                return { ...f, content, dirty: content !== f.savedContent };
              }),
            }),
            undefined,
            'editor/setContent'
          );
        },

        save: async (path: string) => {
          const { projectPath, files } = get();
          const file = files.find(f => f.path === path);
          if (!projectPath || !file) return false;
          if (file.readOnly || file.binary || file.tooLarge) return false;
          if (!file.dirty) return true;

          const contentToWrite = file.content;
          try {
            const res = await emitAsync<FsWriteFilePayload, FsMutateResponse>(FsEvents.WRITE_FILE, {
              projectPath,
              target: path,
              content: contentToWrite,
            });
            if (!res.success) {
              set(
                state => ({
                  files: patchFile(state.files, path, {
                    error: res.error ?? 'Failed to save file',
                  }),
                }),
                undefined,
                'editor/saveError'
              );
              return false;
            }
            // Reconcile against the buffer as it stands *now* (the user may have
            // typed during the await): dirty only if it diverged from what we wrote.
            set(
              state => ({
                files: state.files.map(f => {
                  if (f.path !== path) return f;
                  return {
                    ...f,
                    savedContent: contentToWrite,
                    dirty: f.content !== contentToWrite,
                    error: undefined,
                    // A successful user-driven save resolves any external banner.
                    externallyChanged: false,
                    externalContent: undefined,
                  };
                }),
              }),
              undefined,
              'editor/saveSuccess'
            );
            return true;
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to save file');
            logger.error('save error:', message);
            set(
              state => ({
                files: patchFile(state.files, path, { error: message }),
              }),
              undefined,
              'editor/saveError'
            );
            return false;
          }
        },

        saveAll: async () => {
          const { files } = get();
          const dirtyWritable = files.filter(
            f => f.dirty && !f.readOnly && !f.binary && !f.tooLarge
          );
          await Promise.all(dirtyWritable.map(f => get().save(f.path)));
        },

        markExternallyChanged: (path: string, diskContent: string) => {
          set(
            state => ({
              files: patchFile(state.files, path, {
                externallyChanged: true,
                externalContent: diskContent,
              }),
            }),
            undefined,
            'editor/markExternallyChanged'
          );
        },

        reloadFromDisk: (path: string) => {
          set(
            state => ({
              files: state.files.map(f => {
                if (f.path !== path) return f;
                const disk = f.externalContent ?? f.savedContent;
                return {
                  ...f,
                  content: disk,
                  savedContent: disk,
                  dirty: false,
                  externallyChanged: false,
                  externalContent: undefined,
                };
              }),
            }),
            undefined,
            'editor/reloadFromDisk'
          );
        },

        keepLocal: (path: string) => {
          set(
            state => ({
              files: patchFile(state.files, path, {
                externallyChanged: false,
                externalContent: undefined,
              }),
            }),
            undefined,
            'editor/keepLocal'
          );
        },

        clear: () => {
          set({ ...initialEditorState, isLoading: false, error: null }, undefined, 'editor/clear');
        },
      };
    },
    { name: 'editor' }
  )
);

// ---------------------------------------------------------------------------
// Store-to-store subscription: consume the explorer's open-file requests.
//
// The file explorer records a requested-open path on `useFsStore`
// (`requestedOpenFile`, set by Enter / double-click). We subscribe at module
// scope — mirroring the useSettingsStore ↔ usePluginStore pattern — so opening
// a file from the tree drives the editor without coupling the explorer to it.
// After consuming, we clear the slot via the FS store's `clearRequestedOpen`.
// ---------------------------------------------------------------------------
useFsStore.subscribe((state, prevState) => {
  if (state.requestedOpenFile && state.requestedOpenFile !== prevState.requestedOpenFile) {
    const projectPath = state.projectPath;
    const path = state.requestedOpenFile;
    if (projectPath) {
      useEditorStore.getState().setProject(projectPath);
      void useEditorStore.getState().openFile(projectPath, path);
      // Opening a file surfaces the editor (closing settings if it was open).
      if (useSettingsStore.getState().isOpen) {
        useSettingsStore.getState().closeSettings();
      }
      useAppUIStore.getState().setShellView('editor');
    }
    // Clear the one-shot slot so re-opening the same file later re-triggers.
    useFsStore.getState().clearRequestedOpen();
  }
});

// Keep the editor's project root in lockstep with the explorer's so closing a
// project (or switching tabs) resets the open stack appropriately.
useFsStore.subscribe((state, prevState) => {
  if (state.projectPath !== prevState.projectPath) {
    useEditorStore.getState().setProject(state.projectPath);
  }
});

// ---------------------------------------------------------------------------
// shellView wiring: keep the workspace surface (terminal / editor / settings)
// in lockstep with the editor stack and the settings modal. Mirrors the
// store-to-store subscription pattern above so the shell stays decoupled from
// the individual stores that drive it.
// ---------------------------------------------------------------------------

// Switching project roots always returns to the terminal grid — even when the
// target project has restored open files — so a project switch never auto-jumps
// the user into the editor. (The file tabs stay in the strip; clicking one
// re-enters the editor view.)
useEditorStore.subscribe((state, prevState) => {
  if (state.projectPath !== prevState.projectPath) {
    useAppUIStore.getState().setShellView('terminal');
  }
});

// Closing the last open file while focused on the editor falls back to the
// terminal grid (there is no editor surface left to show).
useEditorStore.subscribe((state, prevState) => {
  // Ignore stack swaps caused by a project switch (handled above); only react
  // to the open stack genuinely emptying within the same project.
  if (state.projectPath !== prevState.projectPath) return;
  const wentEmpty = prevState.files.length > 0 && state.files.length === 0;
  if (wentEmpty && useAppUIStore.getState().shellView === 'editor') {
    useAppUIStore.getState().setShellView('terminal');
  }
});

// Settings open ⇒ 'settings'. Settings close ⇒ back to the editor if a file is
// still focused, otherwise the terminal grid.
useSettingsStore.subscribe((state, prevState) => {
  if (state.isOpen === prevState.isOpen) return;
  if (state.isOpen) {
    useAppUIStore.getState().setShellView('settings');
  } else {
    const hasActiveFile = useEditorStore.getState().activePath !== null;
    useAppUIStore.getState().setShellView(hasActiveFile ? 'editor' : 'terminal');
  }
});

// Selectors
export const selectEditorFiles = (state: EditorStore) => state.files;
export const selectActivePath = (state: EditorStore) => state.activePath;
export const selectActiveFile = (state: EditorStore) =>
  state.files.find(f => f.path === state.activePath) ?? null;
export const selectHasOpenFiles = (state: EditorStore) => state.files.length > 0;
export const selectDirtyCount = (state: EditorStore) =>
  state.files.reduce((n, f) => (f.dirty ? n + 1 : n), 0);
