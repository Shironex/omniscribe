import { useEffect, useMemo, useState } from 'react';
import {
  Eraser,
  Loader2,
  Trash2,
  Check,
  FileCog,
  Webhook,
  FileCode,
  GitBranch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import {
  useFootprintStore,
  selectFootprintEntries,
  selectFootprintPassiveMode,
  selectFootprintLoading,
  selectFootprintRemoving,
  selectFootprintError,
} from '@/stores/useFootprintStore';
import type { FootprintEntry, FootprintKind } from '@omniscribe/shared';

/** Per-kind icon for the preview list. */
const KIND_ICON: Record<FootprintKind, LucideIcon> = {
  'mcp-config': FileCog,
  'claude-hooks': Webhook,
  'hook-script': FileCode,
  worktrees: GitBranch,
};

export function ProjectFootprintCard() {
  const activeTab = useWorkspaceStore(selectActiveTab);
  const projectPath = activeTab?.projectPath ?? null;

  const entries = useFootprintStore(selectFootprintEntries);
  const passiveMode = useFootprintStore(selectFootprintPassiveMode);
  const isLoading = useFootprintStore(selectFootprintLoading);
  const isRemoving = useFootprintStore(selectFootprintRemoving);
  const error = useFootprintStore(selectFootprintError);
  const fetchFootprint = useFootprintStore(state => state.fetchFootprint);
  const setPassiveMode = useFootprintStore(state => state.setPassiveMode);
  const removeFootprint = useFootprintStore(state => state.removeFootprint);
  const initListeners = useFootprintStore(state => state.initListeners);
  const cleanupListeners = useFootprintStore(state => state.cleanupListeners);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<FootprintKind>>(new Set());

  // Initialize this store's socket listeners lazily from the UI that uses it.
  useEffect(() => {
    initListeners();
    return () => cleanupListeners();
  }, [initListeners, cleanupListeners]);

  useEffect(() => {
    if (projectPath) {
      void fetchFootprint(projectPath);
    }
  }, [projectPath, fetchFootprint]);

  const hasFootprint = entries.length > 0;

  // When opening the dialog, pre-select every detected kind.
  const openDialog = () => {
    setSelected(new Set(entries.map(e => e.kind)));
    setDialogOpen(true);
  };

  const toggleKind = (kind: FootprintKind) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const selectedCount = selected.size;

  const handleConfirmRemove = async () => {
    if (!projectPath || selectedCount === 0) {
      return;
    }
    const kinds = Array.from(selected);
    try {
      const results = await removeFootprint(projectPath, kinds);
      const failed = results.filter(r => !r.ok);
      const succeeded = results.filter(r => r.ok);

      if (failed.length === 0) {
        toast.success(
          `Removed ${succeeded.length} ${succeeded.length === 1 ? 'item' : 'items'} from this project`
        );
      } else if (succeeded.length === 0) {
        toast.error(`Failed to remove: ${failed.map(r => kindLabel(r.kind)).join(', ')}`);
      } else {
        toast.warning(
          `Removed ${succeeded.length}; failed: ${failed.map(r => kindLabel(r.kind)).join(', ')}`
        );
      }
      setDialogOpen(false);
    } catch {
      toast.error('Failed to remove Omniscribe from this project');
    }
  };

  return (
    <SettingsCard
      icon={Eraser}
      tone="orange"
      title="Project Footprint"
      subtitle="Control and clean up what Omniscribe writes into this project."
    >
      {!projectPath && (
        <div className="text-center text-muted-foreground py-6">
          <Eraser className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Open a project to manage its Omniscribe footprint.</p>
        </div>
      )}

      {projectPath && (
        <>
          <SettingsToggleRow
            title="Don't write anything into this project"
            description="Passive mode — Omniscribe won't add MCP config or Claude hooks when you start a session. Session status falls back to terminal markers."
            checked={passiveMode}
            disabled={isLoading}
            onCheckedChange={next => {
              void setPassiveMode(projectPath, next);
            }}
          />

          <FootprintSummary
            entries={entries}
            isLoading={isLoading}
            error={error}
            onRemove={openDialog}
            disabled={isRemoving}
          />
        </>
      )}

      <RemovalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entries={entries}
        selected={selected}
        onToggle={toggleKind}
        onConfirm={handleConfirmRemove}
        isRemoving={isRemoving}
        canConfirm={hasFootprint && selectedCount > 0}
      />
    </SettingsCard>
  );
}

function FootprintSummary({
  entries,
  isLoading,
  error,
  onRemove,
  disabled,
}: {
  entries: FootprintEntry[];
  isLoading: boolean;
  error: string | null;
  onRemove: () => void;
  disabled: boolean;
}) {
  const hasFootprint = entries.length > 0;

  return (
    <div className="border-t border-border-glass/50 pt-3.5 space-y-3">
      {error && (
        <div className="rounded-lg border border-status-error/40 bg-status-error-bg/30 p-3 text-xs text-status-error">
          {error}
        </div>
      )}

      {isLoading && entries.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Scanning project…</span>
        </div>
      ) : hasFootprint ? (
        <p className="text-[12px] text-muted-foreground/85 leading-snug">
          Omniscribe has written{' '}
          <span className="font-medium text-foreground">
            {entries.length} {entries.length === 1 ? 'item' : 'items'}
          </span>{' '}
          into this project.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground/85 leading-snug">
          Omniscribe hasn't written anything into this project.
        </p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="text-status-error hover:text-status-error"
        disabled={!hasFootprint || disabled}
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4" />
        Remove Omniscribe from this project
      </Button>
    </div>
  );
}

function RemovalDialog({
  open,
  onOpenChange,
  entries,
  selected,
  onToggle,
  onConfirm,
  isRemoving,
  canConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: FootprintEntry[];
  selected: Set<FootprintKind>;
  onToggle: (kind: FootprintKind) => void;
  onConfirm: () => void;
  isRemoving: boolean;
  canConfirm: boolean;
}) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.kind.localeCompare(b.kind)),
    [entries]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Omniscribe from this project</DialogTitle>
          <DialogDescription>
            Select what to remove. Only Omniscribe-owned artifacts are touched — your own files, MCP
            servers, and Claude hooks are preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {sortedEntries.map(entry => {
            const Icon = KIND_ICON[entry.kind];
            const isSelected = selected.has(entry.kind);
            return (
              <button
                key={entry.kind}
                type="button"
                onClick={() => onToggle(entry.kind)}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/[0.06]'
                    : 'border-border-glass bg-card/30 hover:bg-card/50'
                )}
              >
                <span
                  className={cn(
                    'grid place-items-center size-5 shrink-0 rounded border transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border-glass bg-background/40'
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </span>
                <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">
                    {kindLabel(entry.kind)}
                  </span>
                  <span className="block text-[12px] text-muted-foreground/85 truncate">
                    {entry.description}
                  </span>
                </span>
              </button>
            );
          })}
          {sortedEntries.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">Nothing to remove.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!canConfirm || isRemoving}>
            {isRemoving && <Loader2 className="w-4 h-4 animate-spin" />}
            Remove selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Human-readable label for a footprint kind. */
function kindLabel(kind: FootprintKind): string {
  switch (kind) {
    case 'mcp-config':
      return 'MCP configuration';
    case 'claude-hooks':
      return 'Claude hooks';
    case 'hook-script':
      return 'Hook script';
    case 'worktrees':
      return 'Worktrees';
    default:
      return kind;
  }
}
