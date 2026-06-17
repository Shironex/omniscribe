import { useCallback } from 'react';
import { FileWarning, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { extractErrorMessage, EDITOR_OPTIONS } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { useTerminalStore } from '@/stores/useTerminalStore';
import type { OpenFile } from '@/stores/useEditorStore';

interface BinaryPlaceholderProps {
  file: OpenFile;
}

/**
 * Friendly fallback pane for files Omniscribe can't render inline (binary blobs
 * or files past the read size cap). Offers an "Open externally" action that
 * defers to the user's configured external editor — the same mechanism the
 * session "Open in editor" button uses.
 */
export function BinaryPlaceholder({ file }: BinaryPlaceholderProps) {
  const name = file.path.split(/[\\/]/).pop() ?? file.path;
  const reason = file.tooLarge ? 'File is too large to open inline' : 'Binary file';

  const handleOpenExternally = useCallback(async () => {
    const editorProtocol = useTerminalStore.getState().editorProtocol;
    const editor = EDITOR_OPTIONS.find(e => e.id === editorProtocol);
    if (!editor) {
      toast.error('No editor configured. Set one in Settings → Terminal.');
      return;
    }
    try {
      await window.electronAPI?.app?.openInEditor(editorProtocol, file.path);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to open in editor'));
    }
  }, [file.path]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <FileWarning className="h-8 w-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </div>
      <Button variant="outline" size="sm" onClick={handleOpenExternally} className="gap-1.5">
        <ExternalLink className="h-3.5 w-3.5" />
        Open externally
      </Button>
    </div>
  );
}
