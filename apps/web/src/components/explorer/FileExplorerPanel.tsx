import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Files, GitBranch, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useScmStore, selectStatusByPath, selectChangedCount } from '@/stores/useScmStore';
import { statusColorClass } from '@/components/scm/scmStatus';
import { ScmView } from '@/components/scm';
import { FileExplorer } from './FileExplorer';
import {
  loadExplorerLayout,
  saveExplorerLayout,
  clampWidth,
  EXPLORER_MIN_WIDTH,
  EXPLORER_MAX_WIDTH,
  type ExplorerTab,
} from './explorerLayout';

export interface FileExplorerPanelProps {
  /** Active project root, or null when no project is selected. */
  projectPath: string | null;
}

/**
 * Collapsible left-side panel for the project view, tabbed into Files and
 * Source Control.
 *
 * Self-contained: owns its open/closed state, width, and active tab (persisted
 * to localStorage under `omniscribe-explorer`), renders a drag-to-resize
 * handle, and shows a thin reveal rail when collapsed. The Source Control tab
 * binds itself to the active project; the Files tab receives git-status colors
 * derived from the SCM snapshot so the surrounding layout needs to mount only
 * this one component.
 */
export function FileExplorerPanel({ projectPath }: FileExplorerPanelProps) {
  const initial = useRef(loadExplorerLayout());
  const [open, setOpen] = useState(initial.current.open);
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

  // Notify terminals to refit when the panel toggles or resizes (layout width
  // of the grid changes). Two rAFs so the DOM has settled.
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

  // No project → nothing to explore.
  if (!projectPath) return null;

  if (!open) {
    return (
      <div className="flex w-8 shrink-0 flex-col items-center border-r border-border bg-card/30 pt-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)}
              aria-label="Open side panel"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Open side panel</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-border"
      style={{ width, minWidth: EXPLORER_MIN_WIDTH, maxWidth: EXPLORER_MAX_WIDTH }}
    >
      <PanelTabs
        tab={tab}
        onChange={setTab}
        changedCount={changedCount}
        onClose={() => setOpen(false)}
      />

      <div className="min-h-0 flex-1">
        {/* Both tabs stay mounted; only the active one is shown — keeps the
            explorer tree + SCM listeners warm across tab switches. */}
        <div className={cn('h-full', tab === 'files' ? 'block' : 'hidden')}>
          <FileExplorer
            projectPath={projectPath}
            onClose={() => setOpen(false)}
            statusByPath={statusByPath}
            hideHeader
          />
        </div>
        <div className={cn('h-full', tab === 'scm' ? 'block' : 'hidden')}>
          <ScmView projectPath={projectPath} />
        </div>
      </div>

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

interface PanelTabsProps {
  tab: ExplorerTab;
  onChange: (tab: ExplorerTab) => void;
  changedCount: number;
  onClose: () => void;
}

function PanelTabs({ tab, onChange, changedCount, onClose }: PanelTabsProps) {
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
      className="flex items-center gap-0.5 border-b border-border px-1.5 py-1"
    >
      <TabButton
        active={tab === 'files'}
        onClick={() => onChange('files')}
        icon={<Files className="h-3.5 w-3.5" />}
        label="Files"
      />
      <TabButton
        active={tab === 'scm'}
        onClick={() => onChange('scm')}
        icon={<GitBranch className="h-3.5 w-3.5" />}
        label="Source Control"
        badge={changedCount > 0 ? changedCount : undefined}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Collapse side panel"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Collapse</TooltipContent>
      </Tooltip>
    </div>
  );
}

function TabButton({
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
        'relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
