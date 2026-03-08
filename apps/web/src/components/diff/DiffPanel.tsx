import { useEffect, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DiffFileList } from './DiffFileList';
import { useAppUIStore } from '@/stores/useAppUIStore';
import {
  useDiffStore,
  selectDiff,
  selectDiffLoading,
  selectDiffError,
} from '@/stores/useDiffStore';
import { useSessionStore } from '@/stores/useSessionStore';

interface DiffPanelProps {
  className?: string;
}

export function DiffPanel({ className }: DiffPanelProps) {
  const isOpen = useAppUIStore(state => state.isDiffPanelOpen);
  const sessionId = useAppUIStore(state => state.diffPanelSessionId);
  const closeDiffPanel = useAppUIStore(state => state.closeDiffPanel);

  // Look up session to get projectPath and worktreePath
  const session = useSessionStore(
    useCallback(
      state => (sessionId ? state.sessions.find(s => s.id === sessionId) : undefined),
      [sessionId]
    )
  );

  const projectPath = session?.worktreePath ?? session?.projectPath ?? null;

  const diffData = useDiffStore(selectDiff(projectPath));
  const isLoading = useDiffStore(selectDiffLoading(projectPath));
  const error = useDiffStore(selectDiffError(projectPath));
  const fetchDiff = useDiffStore(state => state.fetchDiff);

  // Fetch diff when panel opens or session changes
  useEffect(() => {
    if (isOpen && projectPath) {
      fetchDiff(projectPath);
    }
  }, [isOpen, projectPath, fetchDiff]);

  const handleRefresh = useCallback(() => {
    if (projectPath) {
      fetchDiff(projectPath);
    }
  }, [projectPath, fetchDiff]);

  const fileCount = diffData?.files.length ?? 0;
  const totalAdditions = diffData?.totalAdditions ?? 0;
  const totalDeletions = diffData?.totalDeletions ?? 0;

  return (
    <div className={cn('h-full overflow-hidden', className)}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={transitions.springSmooth}
            className="h-full w-[480px] border-l border-border bg-muted flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Changes
                </span>
                {fileCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {fileCount} file{fileCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRefresh}
                      disabled={isLoading}
                      className="h-auto w-auto p-1"
                      aria-label="Refresh diff"
                    >
                      <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Refresh</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={closeDiffPanel}
                      className="h-auto w-auto p-1"
                      aria-label="Close diff panel"
                    >
                      <X size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Summary bar */}
            {fileCount > 0 && (
              <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border shrink-0 text-[11px]">
                <span className="text-green-400">+{totalAdditions}</span>
                <span className="text-red-400">-{totalDeletions}</span>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && !diffData && (
                <div className="text-xs text-muted-foreground animate-pulse py-4 text-center">
                  Loading changes...
                </div>
              )}

              {error && <div className="text-xs text-red-400 py-2 px-3">{error}</div>}

              {diffData && <DiffFileList files={diffData.files} />}

              {!isLoading && !error && diffData && diffData.files.length === 0 && (
                <div className="text-xs text-muted-foreground py-8 text-center">
                  No changes detected
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
