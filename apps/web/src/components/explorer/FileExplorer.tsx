import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FilePlus, FolderPlus, RefreshCw, PanelLeftClose, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { EDITOR_OPTIONS, extractErrorMessage } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useFsStore } from '@/stores/useFsStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { FileTreeRow } from './FileTreeRow';
import { flattenTree, type TreeRow } from './treeModel';

export interface FileExplorerProps {
  projectPath: string;
  /** Collapse the panel (hide). */
  onClose: () => void;
  /**
   * Git status hook point. The SCM lane owns coloring; defaults to empty so the
   * explorer ships without it. (absolute path → status code)
   */
  statusByPath?: Record<string, string>;
}

const ROW_HEIGHT = 28;

/** Inline-creation draft state (a New file / New folder awaiting a name). */
interface DraftState {
  parentDir: string;
  kind: 'file' | 'dir';
}

export function FileExplorer({ projectPath, onClose, statusByPath = {} }: FileExplorerProps) {
  const setProject = useFsStore(state => state.setProject);
  const loadDir = useFsStore(state => state.loadDir);
  const toggleDir = useFsStore(state => state.toggleDir);
  const expandDir = useFsStore(state => state.expandDir);
  const collapseDir = useFsStore(state => state.collapseDir);
  const openFile = useFsStore(state => state.openFile);
  const createFile = useFsStore(state => state.createFile);
  const createDir = useFsStore(state => state.createDir);
  const renameAction = useFsStore(state => state.rename);
  const deletePath = useFsStore(state => state.deletePath);

  const dirs = useFsStore(useShallow(state => state.dirs));
  const expanded = useFsStore(useShallow(state => state.expanded));
  const rootError = useFsStore(state => state.dirs[projectPath]?.error);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TreeRow | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Bind the store to this project (loads root + starts watching).
  useEffect(() => {
    setProject(projectPath);
  }, [projectPath, setProject]);

  const rows = useMemo(
    () => flattenTree(projectPath, dirs, expanded),
    [projectPath, dirs, expanded]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const selectedIndex = useMemo(
    () => rows.findIndex(r => r.path === selectedPath),
    [rows, selectedPath]
  );

  // -------------------------------------------------------------------------
  // Row interactions
  // -------------------------------------------------------------------------
  const handleSelect = useCallback((row: TreeRow) => setSelectedPath(row.path), []);
  const handleToggle = useCallback((row: TreeRow) => toggleDir(row.path), [toggleDir]);
  const handleOpen = useCallback((row: TreeRow) => openFile(row.path), [openFile]);

  const handleRenameStart = useCallback((row: TreeRow) => {
    setRenamingPath(row.path);
    setSelectedPath(row.path);
  }, []);

  const handleRenameCommit = useCallback(
    async (row: TreeRow, nextName: string | null) => {
      setRenamingPath(null);
      if (!nextName) return;
      const parent = parentDirOf(row.path);
      const ok = await renameAction(row.path, joinPath(parent, nextName));
      if (!ok) {
        toast.error(useFsStore.getState().error ?? 'Failed to rename');
      }
    },
    [renameAction]
  );

  const handleNewFile = useCallback(
    async (row: TreeRow) => {
      const parent = row.isDir ? row.path : parentDirOf(row.path);
      if (row.isDir) await expandDir(row.path);
      setDraft({ parentDir: parent, kind: 'file' });
    },
    [expandDir]
  );

  const handleNewFolder = useCallback(
    async (row: TreeRow) => {
      const parent = row.isDir ? row.path : parentDirOf(row.path);
      if (row.isDir) await expandDir(row.path);
      setDraft({ parentDir: parent, kind: 'dir' });
    },
    [expandDir]
  );

  const handleRootNewFile = useCallback(() => {
    setDraft({ parentDir: projectPath, kind: 'file' });
  }, [projectPath]);

  const handleRootNewFolder = useCallback(() => {
    setDraft({ parentDir: projectPath, kind: 'dir' });
  }, [projectPath]);

  const commitDraft = useCallback(
    async (name: string | null) => {
      const current = draft;
      setDraft(null);
      if (!current || !name) return;
      const created =
        current.kind === 'file'
          ? await createFile(current.parentDir, name)
          : await createDir(current.parentDir, name);
      if (!created) {
        toast.error(useFsStore.getState().error ?? 'Failed to create');
        return;
      }
      setSelectedPath(created);
      if (current.kind === 'file') openFile(created);
    },
    [draft, createFile, createDir, openFile]
  );

  const handleDeleteRequest = useCallback((row: TreeRow) => setPendingDelete(row), []);

  const confirmDelete = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    const ok = await deletePath(target.path);
    if (!ok) {
      toast.error(useFsStore.getState().error ?? 'Failed to delete');
    } else {
      toast.success('Moved to trash');
    }
  }, [pendingDelete, deletePath]);

  const handleRevealInEditor = useCallback(async (row: TreeRow) => {
    const editorProtocol = useTerminalStore.getState().editorProtocol;
    const editor = EDITOR_OPTIONS.find(e => e.id === editorProtocol);
    if (!editor) {
      toast.error('No editor configured. Set one in Settings → Terminal.');
      return;
    }
    try {
      await window.electronAPI?.app?.openInEditor(editorProtocol, row.path);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to open in editor'));
    }
  }, []);

  const handleCopyPath = useCallback(async (row: TreeRow) => {
    try {
      await navigator.clipboard.writeText(row.path);
      toast.success('Path copied');
    } catch {
      toast.error('Failed to copy path');
    }
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (renamingPath || draft) return;
      if (rows.length === 0) return;

      const move = (delta: number) => {
        e.preventDefault();
        const next = Math.min(
          rows.length - 1,
          Math.max(0, selectedIndex < 0 ? 0 : selectedIndex + delta)
        );
        const row = rows[next];
        if (row) {
          setSelectedPath(row.path);
          virtualizer.scrollToIndex(next, { align: 'auto' });
        }
      };

      switch (e.key) {
        case 'ArrowDown':
          move(1);
          break;
        case 'ArrowUp':
          move(-1);
          break;
        case 'ArrowRight': {
          const row = rows[selectedIndex];
          if (row?.isDir && !row.expanded) {
            e.preventDefault();
            expandDir(row.path);
          } else if (row?.isDir && row.expanded) {
            move(1);
          }
          break;
        }
        case 'ArrowLeft': {
          const row = rows[selectedIndex];
          if (row?.isDir && row.expanded) {
            e.preventDefault();
            collapseDir(row.path);
          } else if (row) {
            // Jump to parent.
            const parent = parentDirOf(row.path);
            const parentIdx = rows.findIndex(r => r.path === parent);
            if (parentIdx >= 0) {
              e.preventDefault();
              setSelectedPath(parent);
              virtualizer.scrollToIndex(parentIdx, { align: 'auto' });
            }
          }
          break;
        }
        case 'Enter': {
          const row = rows[selectedIndex];
          if (!row) break;
          e.preventDefault();
          if (row.isDir) {
            toggleDir(row.path);
          } else {
            openFile(row.path);
          }
          break;
        }
        case 'F2': {
          const row = rows[selectedIndex];
          if (row) {
            e.preventDefault();
            handleRenameStart(row);
          }
          break;
        }
        default:
          break;
      }
    },
    [
      rows,
      selectedIndex,
      renamingPath,
      draft,
      virtualizer,
      expandDir,
      collapseDir,
      toggleDir,
      openFile,
      handleRenameStart,
    ]
  );

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/40">
      {/* Header */}
      <div className="flex h-9 items-center justify-between border-b border-border px-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton label="New file" onClick={handleRootNewFile}>
            <FilePlus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="New folder" onClick={handleRootNewFolder}>
            <FolderPlus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Refresh" onClick={() => loadDir(projectPath)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Collapse panel" onClick={onClose}>
            <PanelLeftClose className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Tree */}
      <div
        ref={scrollRef}
        role="tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {rootError ? (
          <div className="flex items-start gap-2 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{rootError}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No files</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualItems.map(virtualItem => {
              const row = rows[virtualItem.index];
              return (
                <div
                  key={row.path}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <FileTreeRow
                    row={row}
                    selected={selectedPath === row.path}
                    renaming={renamingPath === row.path}
                    statusByPath={statusByPath}
                    onSelect={handleSelect}
                    onToggle={handleToggle}
                    onOpen={handleOpen}
                    onRenameStart={handleRenameStart}
                    onRenameCommit={handleRenameCommit}
                    onNewFile={handleNewFile}
                    onNewFolder={handleNewFolder}
                    onDelete={handleDeleteRequest}
                    onRevealInEditor={handleRevealInEditor}
                    onCopyPath={handleCopyPath}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Inline creation draft (rendered at the bottom of the list) */}
        {draft && <DraftInput kind={draft.kind} onCommit={commitDraft} />}
      </div>

      {/* Delete confirmation */}
      <Dialog open={pendingDelete !== null} onOpenChange={open => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
            <DialogDescription>
              This moves “{pendingDelete?.name}” to your system trash. You can restore it from
              there.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Move to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function DraftInput({
  kind,
  onCommit,
}: {
  kind: 'file' | 'dir';
  onCommit: (name: string | null) => void;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const commit = () => onCommit(value.trim().length > 0 ? value.trim() : null);

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <span className="text-xs text-muted-foreground">
        {kind === 'file' ? 'New file' : 'New folder'}:
      </span>
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCommit(null);
          }
        }}
        className="h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-sm outline-none"
        spellCheck={false}
        placeholder={kind === 'file' ? 'filename.ts' : 'folder-name'}
      />
    </div>
  );
}

function parentDirOf(targetPath: string): string {
  const idx = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
  return idx <= 0 ? targetPath : targetPath.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}
