import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Files, GitBranch, PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useScmStore, selectStatusByPath, selectChangedCount } from '@/stores/useScmStore';
import { statusColorClass } from '@/components/scm/scmStatus';
import { ScmView } from '@/components/scm';
import { FileExplorer } from '@/components/explorer';
import {
  loadExplorerLayout,
  saveExplorerLayout,
  clampWidth,
  EXPLORER_MIN_WIDTH,
  EXPLORER_MAX_WIDTH,
  type ExplorerTab,
} from '@/components/explorer/explorerLayout';

export interface SidePanelProps {
  /** Active project root, or null when no project is selected. */
  projectPath: string | null;
  /** Whether the panel is open (lifted to the shell so the rail can reopen it). */
  open: boolean;
  /** Toggle open/closed (collapse button + rail toggle drive this). */
  onOpenChange: (open: boolean) => void;
}

/** Derive a display name (folder basename) from a project root path. */
function projectName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).pop() || trimmed;
}

/**
 * Full-height side panel attached to the project rail — together they read as a
 * single sidebar unit (shared `bg-sidebar` + one right border). Tabbed into
 * Files and Source Control via a terax-style segmented switcher at the BOTTOM.
 *
 * Owns its width (persisted to localStorage under `omniscribe-explorer`),
 * renders a drag-to-resize handle, and keeps both views mounted (only the
 * active one shown) so the explorer tree + SCM listeners stay warm. Open/closed
 * state is lifted to the shell (a footer rail button reopens it when collapsed).
 * Width/tab changes dispatch `terminal-refit-all` so terminals refit.
 */
export function SidePanel({ projectPath, open, onOpenChange }: SidePanelProps) {
  const initial = useRef(loadExplorerLayout());
  const [width, setWidth] = useState(initial.current.width);
  const [tab, setTab] = useState<ExplorerTab>(initial.current.tab);
  const draggingRef = useRef(false);

  // Derive git-status colors for the explorer tree from the SCM snapshot.
  const statusByPathRaw = useScmStore(selectStatusByPath);
  const changedCount = useScmStore(selectChangedCount);

  const statusByPath = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [path, status] of Object.entries(statusByPathRaw)) {
      out[path] = statusColorClass(status);
    }
    return out;
  }, [statusByPathRaw]);

  // Persist whenever open/width/tab settles.
  useEffect(() => {
    saveExplorerLayout({ open, width, tab });
  }, [open, width, tab]);

  // Notify terminals to refit when the panel toggles or resizes (the grid's
  // available width changes). Two rAFs so the DOM has settled.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open, width]);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        setWidth(clampWidth(startWidth + (moveEvent.clientX - startX)));
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width]
  );

  // No project, or collapsed → render nothing (the rail's footer toggle reopens).
  if (!projectPath || !open) return null;

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ width, minWidth: EXPLORER_MIN_WIDTH, maxWidth: EXPLORER_MAX_WIDTH }}
    >
      {/* Header: project folder name + collapse. */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-sidebar-border/60 px-2">
        <span
          className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          title={projectPath}
        >
          {projectName(projectPath)}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Collapse side panel"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Collapse</TooltipContent>
        </Tooltip>
      </div>

      {/* Body: both views stay mounted; only the active one is shown. */}
      <div className="min-h-0 flex-1">
        <div className={cn('h-full', tab === 'files' ? 'block' : 'hidden')}>
          <FileExplorer
            projectPath={projectPath}
            onClose={() => onOpenChange(false)}
            statusByPath={statusByPath}
            hideHeader
          />
        </div>
        <div className={cn('h-full', tab === 'scm' ? 'block' : 'hidden')}>
          <ScmView projectPath={projectPath} />
        </div>
      </div>

      {/* Bottom switcher: two equal-width segmented buttons (terax-style). */}
      <BottomSwitcher tab={tab} onChange={setTab} changedCount={changedCount} />

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        onMouseDown={startResize}
        className={cn(
          'absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize',
          'hover:bg-ring/50 active:bg-ring'
        )}
      />
    </div>
  );
}

interface BottomSwitcherProps {
  tab: ExplorerTab;
  onChange: (tab: ExplorerTab) => void;
  changedCount: number;
}

function BottomSwitcher({ tab, onChange, changedCount }: BottomSwitcherProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(tab === 'files' ? 'scm' : 'files');
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Side panel"
      onKeyDown={handleKeyDown}
      className="flex shrink-0 items-stretch border-t border-sidebar-border/60"
    >
      <SwitcherButton
        active={tab === 'files'}
        onClick={() => onChange('files')}
        icon={<Files className="h-3.5 w-3.5" />}
        label="Files"
      />
      <SwitcherButton
        active={tab === 'scm'}
        onClick={() => onChange('scm')}
        icon={<GitBranch className="h-3.5 w-3.5" />}
        label="Source Control"
        badge={changedCount > 0 ? changedCount : undefined}
      />
    </div>
  );
}

function SwitcherButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      title={label}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
