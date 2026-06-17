import { useCallback, useState } from 'react';
import { useEditorStore, type OpenFile } from '@/stores/useEditorStore';

/** Extract the trailing path segment for display in the confirm dialog. */
function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export interface DirtyClose {
  /** Path awaiting Save/Discard/Cancel (null ⇒ no dialog open). */
  pendingClose: string | null;
  /** Filename for the confirm dialog, or null when no confirm is pending. */
  pendingFileName: string | null;
  /**
   * Request a close for a file. Closes immediately when the buffer is clean;
   * otherwise opens the confirmation dialog (resolved via the handlers below).
   */
  requestClose: (path: string) => void;
  /** Save the pending file, then close it. */
  handleConfirmSave: () => Promise<void>;
  /** Discard the pending file's changes and close it. */
  handleConfirmDiscard: () => void;
  /** Cancel the pending close (keep the file open). */
  handleConfirmCancel: () => void;
}

/**
 * Shared dirty-close guard. Closing a clean file is immediate; closing a dirty
 * file routes through a single confirmation flow (Save / Don't save / Cancel)
 * backed by {@link CloseConfirmDialog}.
 *
 * Lifted out of EditorPanel so every close path — the WorkspaceTabs strip × and
 * the editor-scoped Cmd/Ctrl+W — shares one guard and one dialog instead of each
 * maintaining its own pending-close state.
 */
export function useDirtyClose(): DirtyClose {
  const closeFile = useEditorStore(state => state.closeFile);
  const save = useEditorStore(state => state.save);

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

  return {
    pendingClose,
    pendingFileName: pendingClose ? basename(pendingClose) : null,
    requestClose,
    handleConfirmSave,
    handleConfirmDiscard,
    handleConfirmCancel,
  };
}
