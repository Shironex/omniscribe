import { useEffect, useRef, useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';
import { Copy, ClipboardPaste, MousePointerClick, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { writeToTerminal, writeToTerminalChunked } from '@/lib/terminal';
import { copyTerminalSelection } from '@/lib/terminal-clipboard';
import { LARGE_PASTE_WARNING_THRESHOLD } from '@/lib/terminal-constants';
import { cn } from '@/lib/utils';

interface TerminalContextMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  xtermRef: React.RefObject<Terminal | null>;
  sessionIdRef: React.MutableRefObject<number>;
}

interface MenuAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export function TerminalContextMenu({
  position,
  onClose,
  xtermRef,
  sessionIdRef,
}: TerminalContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    const terminal = xtermRef.current;
    if (!terminal?.hasSelection()) return;
    copyTerminalSelection(terminal);
    onClose();
  }, [xtermRef, onClose]);

  const handlePaste = useCallback(() => {
    navigator.clipboard
      .readText()
      .then(text => {
        if (text.length > LARGE_PASTE_WARNING_THRESHOLD) {
          toast.warning('Large paste detected — sending in chunks');
          writeToTerminalChunked(sessionIdRef.current, text);
        } else {
          writeToTerminal(sessionIdRef.current, text);
        }
      })
      .catch(() => {
        toast.error('Failed to read clipboard');
      })
      .finally(() => {
        onClose();
      });
  }, [sessionIdRef, onClose]);

  const handleSelectAll = useCallback(() => {
    xtermRef.current?.selectAll();
    onClose();
  }, [xtermRef, onClose]);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
    onClose();
  }, [xtermRef, onClose]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  const hasSelection = xtermRef.current?.hasSelection() ?? false;

  const actions: MenuAction[] = [
    {
      label: 'Copy',
      icon: <Copy size={13} />,
      onClick: handleCopy,
      disabled: !hasSelection,
    },
    {
      label: 'Paste',
      icon: <ClipboardPaste size={13} />,
      onClick: handlePaste,
    },
    {
      label: 'Select All',
      icon: <MousePointerClick size={13} />,
      onClick: handleSelectAll,
      separator: true,
    },
    {
      label: 'Clear',
      icon: <Eraser size={13} />,
      onClick: handleClear,
    },
  ];

  // Clamp position to keep menu within viewport
  const menuWidth = 160;
  const separatorCount = actions.filter((a, i) => a.separator && i > 0).length;
  const menuHeight = actions.length * 32 + separatorCount * 9 + 8;
  const x = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 8));
  const y = Math.max(8, Math.min(position.y, window.innerHeight - menuHeight - 8));

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] bg-popover border border-border rounded-md shadow-lg py-1"
      style={{ left: x, top: y }}
    >
      {actions.map((action, i) => (
        <div key={action.label}>
          {action.separator && i > 0 && <div className="h-px bg-border mx-2 my-1" />}
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2',
              action.disabled
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-foreground hover:bg-accent'
            )}
          >
            {action.icon}
            {action.label}
          </button>
        </div>
      ))}
    </div>
  );
}
