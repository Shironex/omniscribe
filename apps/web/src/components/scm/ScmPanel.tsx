import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ScmFileEntry } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useScmStore, selectChangedCount } from '@/stores/useScmStore';
import { statusLetter, statusColorClass } from './scmStatus';

export interface ScmPanelProps {
  /** Click a file row to open its diff. */
  onSelectFile: (path: string, staged: boolean) => void;
  /** The path currently shown in the diff surface, for active-row highlight. */
  activePath?: string | null;
}

/**
 * Source-control panel: branch header with fetch/pull/push, a commit composer,
 * and the staged / changes / untracked / conflicts file sections with per-file
 * and per-section actions.
 */
export function ScmPanel({ onSelectFile, activePath }: ScmPanelProps) {
  const snapshot = useScmStore(s => s.snapshot);
  const isLoading = useScmStore(s => s.isLoading);
  const pending = useScmStore(s => s.pending);
  const changedCount = useScmStore(selectChangedCount);

  const refresh = useScmStore(s => s.refresh);
  const stage = useScmStore(s => s.stage);
  const unstage = useScmStore(s => s.unstage);
  const discard = useScmStore(s => s.discard);
  const commit = useScmStore(s => s.commit);
  const fetchRemote = useScmStore(s => s.fetchRemote);
  const pull = useScmStore(s => s.pull);
  const push = useScmStore(s => s.push);
  const lastError = useScmStore(s => s.error);

  // Surface remote/op errors as toasts (the header buttons map them).
  const prevError = useRef<string | null>(null);
  useEffect(() => {
    if (lastError && lastError !== prevError.current) {
      toast.error(lastError);
    }
    prevError.current = lastError;
  }, [lastError]);

  const [confirmDiscard, setConfirmDiscard] = useState<{ paths: string[]; label: string } | null>(
    null
  );

  const requestDiscard = useCallback((paths: string[], label: string) => {
    setConfirmDiscard({ paths, label });
  }, []);

  const doDiscard = useCallback(async () => {
    if (!confirmDiscard) return;
    const ok = await discard(confirmDiscard.paths);
    if (ok) toast.success('Discarded changes');
    setConfirmDiscard(null);
  }, [confirmDiscard, discard]);

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'No repository'}
      </div>
    );
  }

  if (!snapshot.isRepo) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        This folder is not a git repository.
      </div>
    );
  }

  const hasStaged = snapshot.staged.length > 0;
  const hasConflicts = snapshot.conflicted.length > 0;

  return (
    <div className="flex h-full flex-col">
      <BranchHeader
        branch={snapshot.branch}
        detachedHead={snapshot.detachedHead}
        ahead={snapshot.ahead}
        behind={snapshot.behind}
        upstream={snapshot.upstream}
        pending={pending}
        onFetch={fetchRemote}
        onPull={pull}
        onPush={push}
        onRefresh={() => refresh()}
        isLoading={isLoading}
      />

      <CommitComposer hasStaged={hasStaged} committing={pending.commit} onCommit={commit} />

      <div className="min-h-0 flex-1 overflow-auto">
        {hasConflicts && (
          <FileSection
            title="Merge Conflicts"
            files={snapshot.conflicted}
            staged={false}
            activePath={activePath}
            pendingPaths={pending.paths}
            onSelectFile={onSelectFile}
            tone="conflict"
          />
        )}

        <FileSection
          title="Staged Changes"
          files={snapshot.staged}
          staged
          activePath={activePath}
          pendingPaths={pending.paths}
          onSelectFile={onSelectFile}
          bulkAction={
            snapshot.staged.length > 0
              ? {
                  icon: <Minus className="h-3.5 w-3.5" />,
                  label: 'Unstage all',
                  run: () => unstage(snapshot.staged.map(f => f.path)),
                }
              : undefined
          }
          perFile={{
            unstage: paths => unstage(paths),
          }}
        />

        <FileSection
          title="Changes"
          files={snapshot.unstaged}
          staged={false}
          activePath={activePath}
          pendingPaths={pending.paths}
          onSelectFile={onSelectFile}
          bulkAction={
            snapshot.unstaged.length > 0
              ? {
                  icon: <Plus className="h-3.5 w-3.5" />,
                  label: 'Stage all',
                  run: () => stage(snapshot.unstaged.map(f => f.path)),
                }
              : undefined
          }
          perFile={{
            stage: paths => stage(paths),
            discard: (paths, label) => requestDiscard(paths, label),
          }}
        />

        <FileSection
          title="Untracked"
          files={snapshot.untracked}
          staged={false}
          activePath={activePath}
          pendingPaths={pending.paths}
          onSelectFile={onSelectFile}
          bulkAction={
            snapshot.untracked.length > 0
              ? {
                  icon: <Plus className="h-3.5 w-3.5" />,
                  label: 'Stage all',
                  run: () => stage(snapshot.untracked.map(f => f.path)),
                }
              : undefined
          }
          perFile={{
            stage: paths => stage(paths),
            discard: (paths, label) => requestDiscard(paths, label),
          }}
        />

        {changedCount === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No changes. Your working tree is clean.
          </div>
        )}
      </div>

      <DiscardConfirmDialog
        open={confirmDiscard !== null}
        label={confirmDiscard?.label ?? ''}
        count={confirmDiscard?.paths.length ?? 0}
        onConfirm={doDiscard}
        onCancel={() => setConfirmDiscard(null)}
      />
    </div>
  );
}

// ============================================================================
//  Branch header
// ============================================================================

interface BranchHeaderProps {
  branch?: string;
  detachedHead?: string;
  ahead: number;
  behind: number;
  upstream?: string;
  pending: { fetch: boolean; pull: boolean; push: boolean };
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

function BranchHeader({
  branch,
  detachedHead,
  ahead,
  behind,
  upstream,
  pending,
  onFetch,
  onPull,
  onPush,
  onRefresh,
  isLoading,
}: BranchHeaderProps) {
  const label = branch ?? (detachedHead ? `detached @ ${detachedHead}` : 'no branch');
  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
      <GitCommitHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium" title={upstream ? `↑ ${upstream}` : label}>
        {label}
      </span>
      {(ahead > 0 || behind > 0) && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {behind > 0 && (
            <span className="flex items-center" title={`${behind} behind`}>
              <ArrowDown className="h-3 w-3" />
              {behind}
            </span>
          )}
          {ahead > 0 && (
            <span className="flex items-center" title={`${ahead} ahead`}>
              <ArrowUp className="h-3 w-3" />
              {ahead}
            </span>
          )}
        </span>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <HeaderIconButton
          label="Refresh"
          busy={isLoading}
          onClick={onRefresh}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        />
        <HeaderIconButton
          label="Fetch"
          busy={pending.fetch}
          onClick={onFetch}
          icon={<RotateCcw className="h-3.5 w-3.5" />}
        />
        <HeaderIconButton
          label="Pull"
          busy={pending.pull}
          onClick={onPull}
          icon={<ArrowDown className="h-3.5 w-3.5" />}
        />
        <HeaderIconButton
          label="Push"
          busy={pending.push}
          onClick={onPush}
          icon={<ArrowUp className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  );
}

function HeaderIconButton({
  label,
  busy,
  onClick,
  icon,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={onClick}
          aria-label={label}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
//  Commit composer
// ============================================================================

interface CommitComposerProps {
  hasStaged: boolean;
  committing: boolean;
  onCommit: (message: string, amend: boolean) => Promise<boolean>;
}

function CommitComposer({ hasStaged, committing, onCommit }: CommitComposerProps) {
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);

  // Amend can commit with nothing newly staged (it edits the prior commit).
  const canCommit = (hasStaged || amend) && message.trim().length > 0 && !committing;

  const submit = useCallback(async () => {
    if (!canCommit) return;
    const ok = await onCommit(message.trim(), amend);
    if (ok) {
      toast.success(amend ? 'Amended commit' : 'Committed');
      setMessage('');
      setAmend(false);
    }
  }, [canCommit, message, amend, onCommit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message (⌘/Ctrl+Enter to commit)"
        rows={2}
        spellCheck
        className={cn(
          'w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm',
          'outline-none focus-visible:ring-1 focus-visible:ring-ring'
        )}
      />
      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={amend} onCheckedChange={setAmend} aria-label="Amend last commit" />
          Amend
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-auto">
              <Button size="sm" className="h-7 gap-1.5" disabled={!canCommit} onClick={submit}>
                {committing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Commit
              </Button>
            </span>
          </TooltipTrigger>
          {!hasStaged && !amend && (
            <TooltipContent side="top">Stage changes before committing</TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}

// ============================================================================
//  File sections
// ============================================================================

interface PerFileActions {
  stage?: (paths: string[]) => void;
  unstage?: (paths: string[]) => void;
  discard?: (paths: string[], label: string) => void;
}

interface FileSectionProps {
  title: string;
  files: ScmFileEntry[];
  staged: boolean;
  activePath?: string | null;
  pendingPaths: Set<string>;
  onSelectFile: (path: string, staged: boolean) => void;
  bulkAction?: { icon: React.ReactNode; label: string; run: () => void };
  perFile?: PerFileActions;
  tone?: 'conflict';
}

function FileSection({
  title,
  files,
  staged,
  activePath,
  pendingPaths,
  onSelectFile,
  bulkAction,
  perFile,
  tone,
}: FileSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (files.length === 0) return null;

  return (
    <div className="border-b border-border/40">
      <div className="group flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span className={cn(tone === 'conflict' && 'text-status-error')}>{title}</span>
          <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
            {files.length}
          </span>
        </button>
        {bulkAction && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100"
                onClick={bulkAction.run}
                aria-label={bulkAction.label}
              >
                {bulkAction.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{bulkAction.label}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {!collapsed &&
        files.map(file => (
          <FileRow
            key={`${staged ? 's' : 'w'}:${file.path}`}
            file={file}
            active={activePath === file.path}
            busy={pendingPaths.has(file.path)}
            onSelect={() => onSelectFile(file.path, staged)}
            perFile={perFile}
          />
        ))}
    </div>
  );
}

interface FileRowProps {
  file: ScmFileEntry;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  perFile?: PerFileActions;
}

function FileRow({ file, active, busy, onSelect, perFile }: FileRowProps) {
  const name = file.path.split('/').pop() ?? file.path;
  const dir = file.path.slice(0, file.path.length - name.length).replace(/\/$/, '');

  return (
    <div
      className={cn(
        'group flex h-7 items-center gap-1.5 pl-6 pr-2 text-sm',
        'cursor-pointer hover:bg-accent/50',
        active && 'bg-accent text-accent-foreground'
      )}
      onClick={onSelect}
      title={file.path}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="min-w-0 flex-1 truncate">
        {name}
        {dir && <span className="ml-1.5 text-xs text-muted-foreground">{dir}</span>}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {!busy && perFile?.discard && (
          <RowActionButton
            label="Discard changes"
            onClick={() => perFile.discard?.([file.path], file.path)}
            icon={<Undo2 className="h-3.5 w-3.5" />}
          />
        )}
        {!busy && perFile?.unstage && (
          <RowActionButton
            label="Unstage"
            onClick={() => perFile.unstage?.([file.path])}
            icon={<Minus className="h-3.5 w-3.5" />}
          />
        )}
        {!busy && perFile?.stage && (
          <RowActionButton
            label="Stage"
            onClick={() => perFile.stage?.([file.path])}
            icon={<Plus className="h-3.5 w-3.5" />}
          />
        )}
      </div>

      <span
        className={cn('w-3 shrink-0 text-center text-xs font-bold', statusColorClass(file.status))}
        title={file.status}
      >
        {statusLetter(file.status)}
      </span>
    </div>
  );
}

function RowActionButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={e => {
            e.stopPropagation();
            onClick();
          }}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
//  Discard confirm
// ============================================================================

function DiscardConfirmDialog({
  open,
  label,
  count,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  label: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => (!o ? onCancel() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>
            {count > 1
              ? `Discard changes to ${count} files? This cannot be undone.`
              : `Discard changes to ${label}? This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
