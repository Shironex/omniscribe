import { useCallback } from 'react';
import { X, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/components/explorer/fileIcon';
import type { OpenFile } from '@/stores/useEditorStore';

interface EditorTabsProps {
  files: OpenFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Horizontal tab strip for open editor files. Each tab shows the file icon,
 * filename, a dirty dot, and a close affordance. Middle-click closes a tab; the
 * strip scrolls horizontally on overflow.
 */
export function EditorTabs({ files, activePath, onSelect, onClose }: EditorTabsProps) {
  const handleAuxClick = useCallback(
    (e: React.MouseEvent, path: string) => {
      // Middle mouse button closes the tab (browser/editor convention).
      if (e.button === 1) {
        e.preventDefault();
        onClose(path);
      }
    },
    [onClose]
  );

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-card/30 scrollbar-thin"
    >
      {files.map(file => {
        const isActive = file.path === activePath;
        const Icon = getFileIcon(basename(file.path));
        return (
          <div
            key={file.path}
            role="tab"
            aria-selected={isActive}
            title={file.path}
            onClick={() => onSelect(file.path)}
            onAuxClick={e => handleAuxClick(e, file.path)}
            className={cn(
              'group flex min-w-0 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs transition-colors',
              isActive
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">{basename(file.path)}</span>
            {file.readOnly && (
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Read-only" />
            )}
            <span className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {file.dirty ? (
                // Dirty dot — swaps to a close × on hover of the tab.
                <>
                  <span
                    className="h-2 w-2 rounded-full bg-foreground/70 group-hover:hidden"
                    aria-label="Unsaved changes"
                  />
                  <button
                    type="button"
                    aria-label={`Close ${basename(file.path)}`}
                    onClick={e => {
                      e.stopPropagation();
                      onClose(file.path);
                    }}
                    className="hidden rounded-sm p-0.5 hover:bg-muted group-hover:flex"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  aria-label={`Close ${basename(file.path)}`}
                  onClick={e => {
                    e.stopPropagation();
                    onClose(file.path);
                  }}
                  className="rounded-sm p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
