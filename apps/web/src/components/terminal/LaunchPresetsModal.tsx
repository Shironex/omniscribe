import { useState, useEffect, useRef, useMemo } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { AiModeDropdown } from '@/components/shared/AiModeDropdown';
import { GridPresetCard } from './GridPresetCard';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { useGitStore, selectBranches, selectCurrentBranch } from '@/stores/useGitStore';
import { useSessionStore, selectSessionsForProject } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useDefaultAiMode } from '@/hooks/useDefaultAiMode';
import { DEFAULT_WORKTREE_SETTINGS } from '@omniscribe/shared';
import type { AiMode } from '@omniscribe/shared';

const GRID_PRESETS = [1, 2, 3, 4, 6, 8, 9, 12] as const;

interface LaunchPresetsModalProps {
  projectPath: string | null;
  onCreateSessions: (count: number, aiMode: AiMode, branch: string) => void;
}

export function LaunchPresetsModal({ projectPath, onCreateSessions }: LaunchPresetsModalProps) {
  const open = useAppUIStore(state => state.isLaunchModalOpen);
  const closeLaunchModal = useAppUIStore(state => state.closeLaunchModal);

  const gitBranches = useGitStore(selectBranches);
  const currentGitBranch = useGitStore(selectCurrentBranch);
  const branches = useMemo(
    () => gitBranches.map(b => ({ name: b.name, isRemote: b.isRemote, isCurrent: b.isCurrent })),
    [gitBranches]
  );
  const currentBranch = currentGitBranch?.name ?? 'main';

  const { defaultAiMode } = useDefaultAiMode();

  const sessionsForProject = useSessionStore(
    projectPath ? selectSessionsForProject(projectPath) : () => []
  );
  const existingSessionCount = sessionsForProject.length;

  const worktreeMode = useWorkspaceStore(
    state => (state.preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS).mode
  );

  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>(defaultAiMode);
  const [branch, setBranch] = useState(currentBranch);

  const prevOpenRef = useRef(false);

  const maxNewSlots = 12 - existingSessionCount;

  // Reset state only on the open transition (false -> true)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedCount(null);
      setAiMode(defaultAiMode);
      setBranch(currentBranch);
    }
    prevOpenRef.current = open;
  }, [open, defaultAiMode, currentBranch]);

  const handleCreate = () => {
    if (selectedCount === null) return;
    onCreateSessions(selectedCount, aiMode, branch);
    closeLaunchModal();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) closeLaunchModal();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-lg mx-4',
            'bg-background rounded-2xl shadow-2xl',
            'border border-border',
            'flex flex-col',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                Launch Sessions
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Choose a layout and configure defaults
              </p>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Grid presets */}
            <div className="grid grid-cols-4 gap-3">
              {GRID_PRESETS.map(count => {
                const wouldExceedMax = count > maxNewSlots;
                return (
                  <GridPresetCard
                    key={count}
                    count={count}
                    selected={selectedCount === count}
                    disabled={wouldExceedMax}
                    onClick={() => setSelectedCount(count)}
                  />
                );
              })}
            </div>

            <Separator />

            {/* Default settings */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Default settings</p>

              <div className="flex items-center gap-3">
                {/* AI Mode selector */}
                <AiModeDropdown value={aiMode} onChange={setAiMode} direction="down" />

                {/* Branch selector — hidden when worktrees are disabled */}
                {worktreeMode !== 'never' && (
                  <BranchAutocomplete
                    branches={branches}
                    value={branch}
                    onChange={setBranch}
                    placeholder="Select branch"
                    className="h-8 w-[220px] text-xs"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 pb-6 pt-2">
            <DialogPrimitive.Close asChild>
              <Button variant="outline">Cancel</Button>
            </DialogPrimitive.Close>
            <Button variant="default" onClick={handleCreate} disabled={selectedCount === null}>
              {selectedCount !== null ? `Create ${selectedCount} Sessions` : 'Select a layout'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
