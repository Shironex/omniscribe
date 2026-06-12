import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { FileExplorer } from './FileExplorer';
import {
  loadExplorerLayout,
  saveExplorerLayout,
  clampWidth,
  EXPLORER_MIN_WIDTH,
  EXPLORER_MAX_WIDTH,
} from './explorerLayout';

export interface FileExplorerPanelProps {
  /** Active project root, or null when no project is selected. */
  projectPath: string | null;
  /**
   * Git status hook point (SCM lane owns coloring). Defaults to empty so the
   * explorer ships without it.
   */
  statusByPath?: Record<string, string>;
}

/**
 * Collapsible left-side file-explorer panel for the project view.
 *
 * Self-contained: owns its open/closed state and width (persisted to
 * localStorage under `omniscribe-explorer`), renders a drag-to-resize handle,
 * and shows a thin reveal rail with a PanelLeft button when collapsed — so the
 * surrounding layout only needs to mount this one component.
 */
export function FileExplorerPanel({ projectPath, statusByPath }: FileExplorerPanelProps) {
  const initial = useRef(loadExplorerLayout());
  const [open, setOpen] = useState(initial.current.open);
  const [width, setWidth] = useState(initial.current.width);
  const draggingRef = useRef(false);

  // Persist whenever open/width settles.
  useEffect(() => {
    saveExplorerLayout({ open, width });
  }, [open, width]);

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
              aria-label="Open file explorer"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Open file explorer</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-border"
      style={{ width, minWidth: EXPLORER_MIN_WIDTH, maxWidth: EXPLORER_MAX_WIDTH }}
    >
      <FileExplorer
        projectPath={projectPath}
        onClose={() => setOpen(false)}
        statusByPath={statusByPath}
      />
      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file explorer"
        onMouseDown={startResize}
        className={cn(
          'absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize',
          'hover:bg-ring/50 active:bg-ring'
        )}
      />
    </div>
  );
}
