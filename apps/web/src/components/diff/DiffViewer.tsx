import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { GitDiffHunk, GitDiffLine } from '@omniscribe/shared';

interface DiffViewerProps {
  hunks: GitDiffHunk[];
}

const DiffLineRow = memo(function DiffLineRow({ line }: { line: GitDiffLine }) {
  const bgClass =
    line.type === 'addition'
      ? 'bg-status-success-bg'
      : line.type === 'deletion'
        ? 'bg-status-error-bg'
        : '';

  const textClass =
    line.type === 'addition'
      ? 'text-status-success'
      : line.type === 'deletion'
        ? 'text-status-error'
        : 'text-muted-foreground';

  const prefix = line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';

  return (
    <tr className={bgClass}>
      <td className="w-10 text-right pr-2 text-[10px] text-muted-foreground/50 select-none shrink-0 align-top">
        {line.oldLineNumber ?? ''}
      </td>
      <td className="w-10 text-right pr-2 text-[10px] text-muted-foreground/50 select-none shrink-0 align-top">
        {line.newLineNumber ?? ''}
      </td>
      <td className={cn('pl-1 text-xs font-mono whitespace-pre-wrap break-all', textClass)}>
        {prefix}
        {line.content}
      </td>
    </tr>
  );
});

function HunkHeader({ hunk }: { hunk: GitDiffHunk }) {
  return (
    <tr className="bg-status-info-bg">
      <td colSpan={3} className="text-[10px] text-status-info/70 font-mono px-2 py-0.5">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.header}
      </td>
    </tr>
  );
}

export const DiffViewer = memo(function DiffViewer({ hunks }: DiffViewerProps) {
  if (hunks.length === 0) {
    return <div className="text-xs text-muted-foreground px-3 py-2">No changes in this file</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <tbody>
          {hunks.map((hunk, hunkIdx) => (
            <HunkGroup key={hunkIdx} hunk={hunk} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

function HunkGroup({ hunk }: { hunk: GitDiffHunk }) {
  return (
    <>
      <HunkHeader hunk={hunk} />
      {hunk.lines.map((line, lineIdx) => (
        <DiffLineRow key={lineIdx} line={line} />
      ))}
    </>
  );
}
