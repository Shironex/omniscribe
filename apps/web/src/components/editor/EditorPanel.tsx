import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, selectActiveFile, type OpenFile } from '@/stores/useEditorStore';
import { EditorTabs } from './EditorTabs';
import { EditorPane } from './EditorPane';
import { CloseConfirmDialog } from './CloseConfirmDialog';
import { ExternalChangeBanner } from './ExternalChangeBanner';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The editor surface: tab strip + active pane + conflict banner + dirty-close
 * confirmation. Rendered by {@link EditorSplit} only when ≥1 file is open, so
 * it owns no visibility logic of its own.
 *
 * Self-contained wiring:
 *  - initializes the editor store's `fs:changed` listener on mount (external
 *    change detection for open files), tearing it down on unmount.
 *  - drives save (Cmd/Ctrl+S) and close (Cmd/Ctrl+W) from {@link EditorPane}'s
 *    editor-scoped key handler.
 */
export function EditorPanel() {
  const files = useEditorStore(useShallow(state => state.files));
  const activePath = useEditorStore(state => state.activePath);
  const activeFile = useEditorStore(selectActiveFile);

  const setActivePath = useEditorStore(state => state.setActivePath);
  const setContent = useEditorStore(state => state.setContent);
  const save = useEditorStore(state => state.save);
  const closeFile = useEditorStore(state => state.closeFile);
  const reloadFromDisk = useEditorStore(state => state.reloadFromDisk);
  const keepLocal = useEditorStore(state => state.keepLocal);

  // External-change detection only matters while files are open — scope the
  // listener to this component's lifetime so it isn't globally registered.
  useEffect(() => {
    const store = useEditorStore.getState();
    store.initListeners();
    return () => {
      useEditorStore.getState().cleanupListeners();
    };
  }, []);

  // Pending dirty-close confirmation (path awaiting Save/Discard/Cancel).
  const [pendingClose, setPendingClose] = useState<string | null>(null);

  const requestClose = useCallback(
    (path: string) => {
      const file = useEditorStore.getState().files.find((f: OpenFile) => f.path === path);
      if (file?.dirty) {
        setPendingClose(path);
      } else {
        closeFile(path);
      }
    },
    [closeFile]
  );

  const handleConfirmSave = useCallback(async () => {
    if (!pendingClose) return;
    const path = pendingClose;
    setPendingClose(null);
    const ok = await save(path);
    if (ok) closeFile(path);
  }, [pendingClose, save, closeFile]);

  const handleConfirmDiscard = useCallback(() => {
    if (!pendingClose) return;
    closeFile(pendingClose);
    setPendingClose(null);
  }, [pendingClose, closeFile]);

  const handleConfirmCancel = useCallback(() => setPendingClose(null), []);

  // Save / close the active file (driven by the editor-scoped keymap).
  const handleSaveActive = useCallback(() => {
    const path = useEditorStore.getState().activePath;
    if (path) void save(path);
  }, [save]);

  const handleCloseActive = useCallback(() => {
    const path = useEditorStore.getState().activePath;
    if (path) requestClose(path);
  }, [requestClose]);

  const handleChange = useCallback(
    (content: string) => {
      const path = useEditorStore.getState().activePath;
      if (path) setContent(path, content);
    },
    [setContent]
  );

  if (files.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <EditorTabs
        files={files}
        activePath={activePath}
        onSelect={setActivePath}
        onClose={requestClose}
      />

      {activeFile?.externallyChanged && (
        <ExternalChangeBanner
          onReload={() => reloadFromDisk(activeFile.path)}
          onKeep={() => keepLocal(activeFile.path)}
        />
      )}

      <div className="min-h-0 flex-1">
        {activeFile ? (
          <EditorPane
            // Re-key on path so switching tabs remounts a fresh CodeMirror state.
            key={activeFile.path}
            file={activeFile}
            onChange={handleChange}
            onSave={handleSaveActive}
            onClose={handleCloseActive}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No file selected
          </div>
        )}
      </div>

      <CloseConfirmDialog
        fileName={pendingClose ? basename(pendingClose) : null}
        onSave={handleConfirmSave}
        onDiscard={handleConfirmDiscard}
        onCancel={handleConfirmCancel}
      />
    </div>
  );
}
