import { useCallback, useEffect } from 'react';
import { useEditorStore, selectActiveFile } from '@/stores/useEditorStore';
import { EditorPane } from './EditorPane';
import { ExternalChangeBanner } from './ExternalChangeBanner';

interface EditorPanelProps {
  /**
   * Shared dirty-close guard. Called for the editor-scoped Cmd/Ctrl+W; closing
   * a clean file is immediate, a dirty file routes through the confirm dialog
   * owned by the host (App) so the strip × and Cmd+W share one flow.
   */
  onRequestClose: (path: string) => void;
}

/**
 * The editor surface: active pane + conflict banner. The tab strip now lives in
 * {@link WorkspaceTabs} (in the content toolbar) and the dirty-close confirm
 * dialog is owned by the host, so this component renders only the focused
 * editor and its external-change banner.
 *
 * Self-contained wiring: initializes the editor store's `fs:changed` listener on
 * mount (external-change detection for open files), tearing it down on unmount.
 * Save (Cmd/Ctrl+S) and close (Cmd/Ctrl+W) are driven from {@link EditorPane}'s
 * editor-scoped key handler.
 */
export function EditorPanel({ onRequestClose }: EditorPanelProps) {
  const files = useEditorStore(state => state.files);
  const activeFile = useEditorStore(selectActiveFile);

  const setContent = useEditorStore(state => state.setContent);
  const save = useEditorStore(state => state.save);
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

  // Save / close the active file (driven by the editor-scoped keymap).
  const handleSaveActive = useCallback(() => {
    const path = useEditorStore.getState().activePath;
    if (path) void save(path);
  }, [save]);

  const handleCloseActive = useCallback(() => {
    const path = useEditorStore.getState().activePath;
    if (path) onRequestClose(path);
  }, [onRequestClose]);

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
    </div>
  );
}
