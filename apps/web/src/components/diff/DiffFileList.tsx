import { memo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, FileText, FilePlus, FileX, FileEdit } from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import type { GitFileDiff } from '@omniscribe/shared';

interface DiffFileListProps {
  files: GitFileDiff[];
}

function getFileIcon(file: GitFileDiff) {
  if (file.deletions > 0 && file.additions === 0 && file.hunks.length === 0) {
    return <FileX size={12} className="text-red-400" />;
  }
  if (file.additions > 0 && file.deletions === 0) {
    return <FilePlus size={12} className="text-green-400" />;
  }
  if (file.additions > 0 || file.deletions > 0) {
    return <FileEdit size={12} className="text-yellow-400" />;
  }
  return <FileText size={12} className="text-muted-foreground" />;
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

function getFileDir(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/') + '/';
}

function FileDiffItem({ file }: { file: GitFileDiff }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = useCallback(() => setIsExpanded(prev => !prev), []);

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-accent/50 transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn(
            'text-muted-foreground shrink-0 transition-transform duration-150',
            isExpanded && 'rotate-90'
          )}
        />
        {getFileIcon(file)}
        <span className="text-[10px] text-muted-foreground/70 truncate">
          {getFileDir(file.path)}
        </span>
        <span className="text-xs text-foreground truncate">{getFileName(file.path)}</span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {file.additions > 0 && (
            <span className="text-[10px] text-green-400">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-[10px] text-red-400">-{file.deletions}</span>
          )}
        </span>
      </button>
      {isExpanded && (
        <div className="bg-background/50">
          {file.isBinary ? (
            <div className="text-xs text-muted-foreground px-3 py-2 italic">Binary file</div>
          ) : (
            <DiffViewer hunks={file.hunks} />
          )}
        </div>
      )}
    </div>
  );
}

export const DiffFileList = memo(function DiffFileList({ files }: DiffFileListProps) {
  if (files.length === 0) {
    return <div className="text-xs text-muted-foreground py-8 text-center">No file changes</div>;
  }

  return (
    <div>
      {files.map(file => (
        <FileDiffItem key={file.path} file={file} />
      ))}
    </div>
  );
});
