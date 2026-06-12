import { useCallback } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useScmStore } from '@/stores/useScmStore';
import { ScmDiffView } from './ScmDiffView';

/**
 * Maximized diff surface for the SCM panel — a Radix Dialog filling most of the
 * viewport, driven entirely by `useScmStore.selectedDiff`. Stage/unstage hunk
 * actions are only offered for working-tree file diffs (not commit diffs).
 *
 * Kept independent of the main editor area (owned by the editor lane): this is
 * a self-contained overlay so it never collides with that layout.
 */
export function ScmDiffSheet() {
  const selected = useScmStore(s => s.selectedDiff);
  const clear = useScmStore(s => s.clearSelectedDiff);
  const stageHunk = useScmStore(s => s.stageHunk);
  const unstageHunk = useScmStore(s => s.unstageHunk);
  const pendingPaths = useScmStore(s => s.pending.paths);

  const fileSource = selected?.source.kind === 'file' ? selected.source : null;
  const isFileDiff = fileSource !== null;
  const staged = fileSource ? fileSource.staged : undefined;
  const filePath = selected?.file?.path ?? selected?.source.path;
  const hunkBusy = filePath ? pendingPaths.has(filePath) : false;

  const handleStage = useCallback(
    (patch: string) => {
      if (filePath) stageHunk(filePath, patch);
    },
    [filePath, stageHunk]
  );
  const handleUnstage = useCallback(
    (patch: string) => {
      if (filePath) unstageHunk(filePath, patch);
    },
    [filePath, unstageHunk]
  );

  const title = selected
    ? selected.source.kind === 'commit'
      ? `${selected.source.path} @ ${selected.source.sha.slice(0, 7)}`
      : `${selected.source.path}${selected.source.staged ? ' (staged)' : ''}`
    : '';

  return (
    <Dialog open={selected !== null} onOpenChange={o => (!o ? clear() : undefined)}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          // Title doubles as the description (file path + ref) — suppress
          // Radix's missing-Description console warning.
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex h-[90vh] w-[92vw] max-w-6xl -translate-x-1/2 -translate-y-1/2',
            'flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg',
            'duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out'
          )}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <DialogPrimitive.Title className="truncate font-mono text-sm">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                aria-label="Close diff"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1">
            <ScmDiffView
              file={selected?.file ?? null}
              loading={selected?.loading}
              error={selected?.error}
              staged={staged}
              hunkBusy={hunkBusy}
              onStageHunk={isFileDiff && staged === false ? handleStage : undefined}
              onUnstageHunk={isFileDiff && staged === true ? handleUnstage : undefined}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
