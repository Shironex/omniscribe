import { useCallback, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { Copy, ClipboardPaste, MousePointerClick, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { copyTerminalSelection } from '@/lib/terminal-clipboard';
import { LARGE_PASTE_WARNING_THRESHOLD } from '@/lib/terminal-constants';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface TerminalContextMenuProps {
  children: React.ReactNode;
  xtermRef: React.RefObject<Terminal | null>;
  sessionIdRef: React.MutableRefObject<number>;
}

export function TerminalContextMenu({
  children,
  xtermRef,
  sessionIdRef: _sessionIdRef,
}: TerminalContextMenuProps) {
  const handleCopy = useCallback(() => {
    const terminal = xtermRef.current;
    if (!terminal?.hasSelection()) return;
    copyTerminalSelection(terminal);
  }, [xtermRef]);

  const handlePaste = useCallback(() => {
    navigator.clipboard
      .readText()
      .then(text => {
        if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
          toast.warning('Large paste detected — sending in chunks');
        }
        xtermRef.current?.paste(text);
      })
      .catch(() => {
        toast.error('Failed to read clipboard');
      });
  }, [xtermRef]);

  const handleSelectAll = useCallback(() => {
    xtermRef.current?.selectAll();
  }, [xtermRef]);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
  }, [xtermRef]);

  const [hasSelection, setHasSelection] = useState(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setHasSelection(xtermRef.current?.hasSelection() ?? false);
      }
    },
    [xtermRef]
  );

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[160px]">
        <ContextMenuItem onSelect={handleCopy} disabled={!hasSelection} className="gap-2 text-xs">
          <Copy size={13} />
          Copy
        </ContextMenuItem>
        <ContextMenuItem onSelect={handlePaste} className="gap-2 text-xs">
          <ClipboardPaste size={13} />
          Paste
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleSelectAll} className="gap-2 text-xs">
          <MousePointerClick size={13} />
          Select All
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleClear} className="gap-2 text-xs">
          <Eraser size={13} />
          Clear
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
