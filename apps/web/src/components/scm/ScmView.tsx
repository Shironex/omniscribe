import { useCallback, useEffect, useState } from 'react';
import { GitCommitVertical, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useScmStore } from '@/stores/useScmStore';
import { ScmPanel } from './ScmPanel';
import { ScmHistory } from './ScmHistory';
import { ScmDiffSheet } from './ScmDiffSheet';

export interface ScmViewProps {
  /** Active project root. */
  projectPath: string | null;
}

type ScmTab = 'changes' | 'history';

/**
 * The Source Control tab body: a Changes ⇄ History sub-toggle over the SCM
 * panel and commit history, plus the maximized diff sheet. Owns binding the
 * store to the active project.
 */
export function ScmView({ projectPath }: ScmViewProps) {
  const setProject = useScmStore(s => s.setProject);
  const selectFileDiff = useScmStore(s => s.selectFileDiff);
  const selectCommitFileDiff = useScmStore(s => s.selectCommitFileDiff);
  const selectedDiff = useScmStore(s => s.selectedDiff);

  const [tab, setTab] = useState<ScmTab>('changes');

  useEffect(() => {
    setProject(projectPath);
  }, [projectPath, setProject]);

  const handleSelectFile = useCallback(
    (path: string, staged: boolean) => {
      selectFileDiff(path, staged);
    },
    [selectFileDiff]
  );

  const handleSelectCommitFile = useCallback(
    (sha: string, path: string) => {
      selectCommitFileDiff(sha, path);
    },
    [selectCommitFileDiff]
  );

  const activePath = selectedDiff?.source.path ?? null;
  const activeSha = selectedDiff?.source.kind === 'commit' ? selectedDiff.source.sha : null;

  if (!projectPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Open a project to use source control.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-sidebar-border px-2 py-1">
        <SubTabButton
          active={tab === 'changes'}
          onClick={() => setTab('changes')}
          icon={<GitCommitVertical className="h-3.5 w-3.5" />}
          label="Changes"
        />
        <SubTabButton
          active={tab === 'history'}
          onClick={() => setTab('history')}
          icon={<History className="h-3.5 w-3.5" />}
          label="History"
        />
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'changes' ? (
          <ScmPanel onSelectFile={handleSelectFile} activePath={activePath} />
        ) : (
          <ScmHistory
            onSelectCommitFile={handleSelectCommitFile}
            activePath={activePath}
            activeSha={activeSha}
          />
        )}
      </div>

      <ScmDiffSheet />
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-7 gap-1.5 text-xs',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </Button>
  );
}
