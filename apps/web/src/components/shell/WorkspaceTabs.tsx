import { forwardRef, useCallback } from 'react';
import { Terminal as TerminalIcon, Settings as SettingsIcon, X, Lock } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/components/explorer/fileIcon';
import { useEditorStore, type OpenFile } from '@/stores/useEditorStore';
import { useAppUIStore, selectShellView } from '@/stores/useAppUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';

interface WorkspaceTabsProps {
  /**
   * Shared dirty-close guard. Closing a clean file is immediate; a dirty file
   * routes through the host-owned confirm dialog so the strip × and the
   * editor-scoped Cmd/Ctrl+W share one flow.
   */
  onRequestClose: (path: string) => void;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The unified workspace tab strip. Lives in the center of the content toolbar
 * and selects the active workspace surface:
 *
 *  - a pinned, non-closable **Terminal** tab (session grids),
 *  - one tab per open editor file (dirty dot ● swaps to a close × on hover),
 *    drag-reorderable amongst themselves,
 *  - a **Settings** tab, shown only while settings is open.
 *
 * The Terminal tab stays first and Settings stays last — only the file tabs
 * reorder (they live inside the dnd `SortableContext`). Reordering reuses the
 * same `@dnd-kit` pattern as the sidebar project list for consistency.
 *
 * Compact, scrollable, theme-token only. Every interactive child is `no-drag`
 * so the surrounding toolbar stays a draggable window region.
 */
export function WorkspaceTabs({ onRequestClose }: WorkspaceTabsProps) {
  const shellView = useAppUIStore(selectShellView);
  const setShellView = useAppUIStore(state => state.setShellView);

  const files = useEditorStore(useShallow(state => state.files));
  const activePath = useEditorStore(state => state.activePath);
  const setActivePath = useEditorStore(state => state.setActivePath);
  const reorderFiles = useEditorStore(state => state.reorderFiles);

  const isSettingsOpen = useSettingsStore(state => state.isOpen);
  const closeSettings = useSettingsStore(state => state.closeSettings);

  // PointerSensor with a small activation distance so a plain click still
  // selects the tab — only a deliberate drag past the threshold reorders.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSelectTerminal = useCallback(() => {
    setShellView('terminal');
  }, [setShellView]);

  const handleSelectFile = useCallback(
    (path: string) => {
      setActivePath(path);
      setShellView('editor');
    },
    [setActivePath, setShellView]
  );

  const handleAuxClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      // Middle-click closes a tab (editor/browser convention).
      if (e.button === 1) {
        e.preventDefault();
        onRequestClose(path);
      }
    },
    [onRequestClose]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderFiles(String(active.id), String(over.id));
    },
    [reorderFiles]
  );

  const terminalActive = shellView === 'terminal';
  const settingsActive = shellView === 'settings';

  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="no-drag flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden px-1 scrollbar-thin"
    >
      {/* Pinned Terminal tab — never closable, never reorderable; stays first. */}
      <TabPill
        active={terminalActive}
        onClick={handleSelectTerminal}
        title="Terminal"
        label="Terminal"
        icon={<TerminalIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      />

      {/* File tabs — the only reorderable group. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={files.map(f => f.path)} strategy={horizontalListSortingStrategy}>
          {files.map(file => (
            <SortableFileTab
              key={file.path}
              file={file}
              active={shellView === 'editor' && file.path === activePath}
              onSelect={() => handleSelectFile(file.path)}
              onAuxClick={e => handleAuxClose(e, file.path)}
              onClose={() => onRequestClose(file.path)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Settings tab — present only while settings is open; stays last. */}
      {isSettingsOpen && (
        <TabPill
          active={settingsActive}
          onClick={() => setShellView('settings')}
          title="Settings"
          label="Settings"
          icon={<SettingsIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          trailing={
            <button
              type="button"
              aria-label="Close settings"
              onClick={e => {
                e.stopPropagation();
                closeSettings();
              }}
              className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          }
        />
      )}
    </div>
  );
}

interface SortableFileTabProps {
  file: OpenFile;
  active: boolean;
  onSelect: () => void;
  onAuxClick: (e: React.MouseEvent) => void;
  onClose: () => void;
}

/**
 * A single draggable file tab. Wires `@dnd-kit`'s `useSortable` so file tabs
 * reorder amongst themselves; the drag listeners ride on the pill while clicks
 * (below the activation distance) still select the tab.
 */
function SortableFileTab({ file, active, onSelect, onAuxClick, onClose }: SortableFileTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.path,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = getFileIcon(basename(file.path));

  return (
    <TabPill
      ref={setNodeRef}
      style={style}
      dragAttributes={attributes}
      dragListeners={listeners}
      active={active}
      onClick={onSelect}
      onAuxClick={onAuxClick}
      title={file.path}
      label={basename(file.path)}
      icon={<Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />}
      trailing={<FileTrailing file={file} onClose={onClose} />}
    />
  );
}

interface TabPillProps {
  active: boolean;
  onClick: () => void;
  onAuxClick?: (e: React.MouseEvent) => void;
  title: string;
  label: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  style?: React.CSSProperties;
  dragAttributes?: DraggableAttributes;
  dragListeners?: ReturnType<typeof useSortable>['listeners'];
}

const TabPill = forwardRef<HTMLDivElement, TabPillProps>(function TabPill(
  {
    active,
    onClick,
    onAuxClick,
    title,
    label,
    icon,
    trailing,
    style,
    dragAttributes,
    dragListeners,
  },
  ref
) {
  return (
    <div
      ref={ref}
      style={style}
      title={title}
      onClick={onClick}
      onAuxClick={onAuxClick}
      {...dragAttributes}
      {...dragListeners}
      // role / aria-selected come AFTER the drag attributes so the tab semantics
      // win over dnd-kit's default `role="button"` (it injects one via attributes).
      role="tab"
      aria-selected={active}
      className={cn(
        'group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
        'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {icon}
      <span className="max-w-[160px] truncate">{label}</span>
      {trailing}
    </div>
  );
});

/**
 * Trailing affordance for a file tab: a read-only lock, then either the dirty
 * dot (which swaps to a × on hover, VS Code-style) or a hover-revealed ×.
 */
function FileTrailing({ file, onClose }: { file: OpenFile; onClose: () => void }) {
  return (
    <span className="ml-0.5 flex items-center">
      {file.readOnly && (
        <Lock className="mr-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Read-only" />
      )}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {file.dirty ? (
          <>
            <span
              className="h-2 w-2 rounded-full bg-current opacity-70 group-hover:hidden"
              aria-label="Unsaved changes"
            />
            <button
              type="button"
              aria-label={`Close ${basename(file.path)}`}
              onClick={e => {
                e.stopPropagation();
                onClose();
              }}
              className="hidden rounded-sm p-0.5 hover:bg-muted group-hover:flex focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              onClose();
            }}
            className="rounded-sm p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    </span>
  );
}
