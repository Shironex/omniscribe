import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Link2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { getFileIcon } from './fileIcon';
import type { TreeRow } from './treeModel';

export interface FileTreeRowProps {
  row: TreeRow;
  selected: boolean;
  /** Whether this row is being renamed inline. */
  renaming: boolean;
  /** Git status hook point (SCM lane owns coloring). Empty for this wave. */
  statusByPath: Record<string, string>;
  onSelect: (row: TreeRow) => void;
  onToggle: (row: TreeRow) => void;
  onOpen: (row: TreeRow) => void;
  onRenameStart: (row: TreeRow) => void;
  onRenameCommit: (row: TreeRow, nextName: string | null) => void;
  onNewFile: (row: TreeRow) => void;
  onNewFolder: (row: TreeRow) => void;
  onDelete: (row: TreeRow) => void;
  onRevealInEditor: (row: TreeRow) => void;
  onCopyPath: (row: TreeRow) => void;
}

const INDENT_PX = 12;
const BASE_PAD_PX = 8;

/**
 * A single explorer tree row: chevron (dirs), icon, name (or inline rename
 * input), wrapped in a Radix context menu with file/folder operations.
 */
function FileTreeRowImpl({
  row,
  selected,
  renaming,
  statusByPath,
  onSelect,
  onToggle,
  onOpen,
  onRenameStart,
  onRenameCommit,
  onNewFile,
  onNewFolder,
  onDelete,
  onRevealInEditor,
  onCopyPath,
}: FileTreeRowProps) {
  const padLeft = BASE_PAD_PX + row.depth * INDENT_PX;
  // TODO(SCM lane): map statusByPath[row.path] → a color class once git status lands.
  const status = statusByPath[row.path];

  const handleClick = () => {
    onSelect(row);
    if (row.isDir) {
      onToggle(row);
    } else {
      onOpen(row);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-expanded={row.isDir ? row.expanded : undefined}
          aria-selected={selected}
          data-status={status ?? undefined}
          tabIndex={-1}
          className={cn(
            'flex h-7 items-center gap-1 pr-2 text-sm select-none cursor-pointer',
            'hover:bg-accent/50',
            selected && 'bg-accent text-accent-foreground'
          )}
          style={{ paddingLeft: padLeft }}
          onClick={renaming ? undefined : handleClick}
          title={row.path}
        >
          {row.isDir ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
              {row.loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : row.expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}

          <RowIcon row={row} />

          {renaming ? (
            <RenameInput initialName={row.name} onCommit={next => onRenameCommit(row, next)} />
          ) : (
            <span className="truncate">{row.name}</span>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        {row.isDir && (
          <>
            <ContextMenuItem onSelect={() => onNewFile(row)}>New file</ContextMenuItem>
            <ContextMenuItem onSelect={() => onNewFolder(row)}>New folder</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => onRenameStart(row)}>Rename</ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(row)}
        >
          Delete
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onRevealInEditor(row)}>Reveal in editor</ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyPath(row)}>Copy path</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RowIcon({ row }: { row: TreeRow }) {
  if (row.kind === 'symlink') {
    return <Link2 className="h-4 w-4 shrink-0 text-cyan-400" />;
  }
  if (row.isDir) {
    return row.expanded ? (
      <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
    ) : (
      <Folder className="h-4 w-4 shrink-0 text-amber-400" />
    );
  }
  const Icon = getFileIcon(row.name);
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

interface RenameInputProps {
  initialName: string;
  onCommit: (nextName: string | null) => void;
}

function RenameInput({ initialName, onCommit }: RenameInputProps) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Select the basename (without extension) for quick renames.
    const dot = initialName.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : initialName.length);
  }, [initialName]);

  const commit = () => {
    const trimmed = value.trim();
    onCommit(trimmed.length > 0 && trimmed !== initialName ? trimmed : null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCommit(null);
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
      className="h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-sm outline-none"
      spellCheck={false}
    />
  );
}

export const FileTreeRow = memo(FileTreeRowImpl);
