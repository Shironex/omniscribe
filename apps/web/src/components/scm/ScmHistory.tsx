import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Loader2, Tag } from 'lucide-react';
import type { ScmCommitFile, ScmLogEntry } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScmStore } from '@/stores/useScmStore';
import { statusLetter, statusColorClass } from './scmStatus';
import { formatRelativeDate } from './relativeDate';

export interface ScmHistoryProps {
  /** Open a commit file's diff in the diff surface. */
  onSelectCommitFile: (sha: string, path: string) => void;
  /** Path currently shown in the diff surface (for active-row highlight). */
  activePath?: string | null;
  /** Sha currently shown in the diff surface. */
  activeSha?: string | null;
}

/**
 * Paginated commit-history rail. Each commit shows its subject, author, and
 * relative date with ref decorations as badges; expanding a commit lazily loads
 * its changed files, and clicking a file opens its diff.
 */
export function ScmHistory({ onSelectCommitFile, activePath, activeSha }: ScmHistoryProps) {
  const log = useScmStore(s => s.log);
  const logLoading = useScmStore(s => s.logLoading);
  const nextBeforeSha = useScmStore(s => s.logNextBeforeSha);
  const loadLog = useScmStore(s => s.loadLog);
  const loadMoreLog = useScmStore(s => s.loadMoreLog);
  const commitFiles = useScmStore(s => s.commitFiles);
  const loadCommitFiles = useScmStore(s => s.loadCommitFiles);

  const [expanded, setExpanded] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  // Load the first page once on mount if the log is empty.
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    if (log.length === 0 && !logLoading) loadLog(true);
  }, [log.length, logLoading, loadLog]);

  const toggle = (sha: string) => {
    if (expanded === sha) {
      setExpanded(null);
      return;
    }
    setExpanded(sha);
    if (!commitFiles[sha]) loadCommitFiles(sha);
  };

  if (log.length === 0 && logLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (log.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No commits yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      {log.map(commit => (
        <CommitRow
          key={commit.hash}
          commit={commit}
          expanded={expanded === commit.hash}
          files={commitFiles[commit.hash]}
          activePath={activeSha === commit.hash ? activePath : null}
          onToggle={() => toggle(commit.hash)}
          onSelectFile={path => onSelectCommitFile(commit.hash, path)}
        />
      ))}

      {nextBeforeSha && (
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={logLoading}
            onClick={loadMoreLog}
          >
            {logLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

interface CommitRowProps {
  commit: ScmLogEntry;
  expanded: boolean;
  files?: ScmCommitFile[];
  activePath?: string | null;
  onToggle: () => void;
  onSelectFile: (path: string) => void;
}

function CommitRow({
  commit,
  expanded,
  files,
  activePath,
  onToggle,
  onSelectFile,
}: CommitRowProps) {
  return (
    <div className="border-b border-sidebar-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm" title={commit.subject}>
              {commit.subject}
            </span>
            {commit.refs.map(ref => (
              <RefBadge key={ref} refName={ref} />
            ))}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{commit.shortHash}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{commit.authorName}</span>
            <span aria-hidden>·</span>
            <span title={commit.authoredDate}>{formatRelativeDate(commit.authoredDate)}</span>
          </span>
        </span>
      </button>

      {expanded && (
        <div className="pb-1">
          {files === undefined ? (
            <div className="flex items-center gap-2 py-2 pl-7 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading files…
            </div>
          ) : files.length === 0 ? (
            <div className="py-1 pl-7 text-xs text-muted-foreground">No files changed.</div>
          ) : (
            files.map(file => (
              <CommitFileRow
                key={file.path}
                file={file}
                active={activePath === file.path}
                onSelect={() => onSelectFile(file.path)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CommitFileRow({
  file,
  active,
  onSelect,
}: {
  file: ScmCommitFile;
  active: boolean;
  onSelect: () => void;
}) {
  const name = file.path.split('/').pop() ?? file.path;
  const dir = file.path.slice(0, file.path.length - name.length).replace(/\/$/, '');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'flex h-6 cursor-pointer items-center gap-1.5 pl-7 pr-2 text-xs hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        active && 'bg-accent text-accent-foreground'
      )}
      title={file.path}
    >
      <span className={cn('w-3 shrink-0 text-center font-bold', statusColorClass(file.status))}>
        {statusLetter(file.status)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {name}
        {dir && <span className="ml-1.5 text-muted-foreground">{dir}</span>}
      </span>
      {!file.isBinary && (
        <span className="shrink-0 font-mono text-[10px]">
          <span className="text-status-success">+{file.additions}</span>{' '}
          <span className="text-status-error">−{file.deletions}</span>
        </span>
      )}
    </div>
  );
}

/** Render a ref decoration (HEAD/branch/tag) as a small badge. */
function RefBadge({ refName }: { refName: string }) {
  const isTag = refName.startsWith('tag: ');
  const label = isTag ? refName.slice('tag: '.length) : refName;
  return (
    <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[10px] font-normal">
      {isTag ? <Tag className="h-2.5 w-2.5" /> : <GitBranch className="h-2.5 w-2.5" />}
      {label}
    </Badge>
  );
}
