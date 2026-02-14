import { useState, useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Terminal, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import { useClickOutside } from '@/hooks/useClickOutside';
import { GridPresetCard } from './GridPresetCard';
import type { AiMode, WorktreeMode } from '@omniscribe/shared';
import type { Branch } from '@/components/shared/BranchSelector';

const GRID_PRESETS = [1, 2, 3, 4, 6, 8, 9, 12] as const;

interface LaunchPresetsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  claudeAvailable: boolean;
  currentBranch: string;
  defaultAiMode: AiMode;
  existingSessionCount: number;
  /** Worktree mode — hides branch selector when 'never' */
  worktreeMode?: WorktreeMode;
  onCreateSessions: (count: number, aiMode: AiMode, branch: string) => void;
}

export function LaunchPresetsModal({
  open,
  onOpenChange,
  branches,
  claudeAvailable,
  currentBranch,
  defaultAiMode,
  existingSessionCount,
  worktreeMode,
  onCreateSessions,
}: LaunchPresetsModalProps) {
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>(defaultAiMode);
  const [branch, setBranch] = useState(currentBranch);
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);

  const prevOpenRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const maxNewSlots = 12 - existingSessionCount;

  // Reset state only on the open transition (false -> true)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedCount(null);
      setAiMode(defaultAiMode);
      setBranch(currentBranch);
      setIsAIModeOpen(false);
    }
    prevOpenRef.current = open;
  }, [open, defaultAiMode, currentBranch]);

  // Close AI mode dropdown on click outside
  useClickOutside(dropdownRef, () => {
    if (isAIModeOpen) setIsAIModeOpen(false);
  });

  const handleCreate = () => {
    if (selectedCount === null) return;
    onCreateSessions(selectedCount, aiMode, branch);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          onEscapeKeyDown={e => {
            // When the AI mode dropdown is open, close it instead of the dialog
            if (isAIModeOpen) {
              e.preventDefault();
              setIsAIModeOpen(false);
            }
          }}
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
                <div ref={dropdownRef} className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAIModeOpen(!isAIModeOpen)}
                    className="min-w-[110px] text-xs"
                  >
                    {aiMode === 'claude' ? (
                      <ClaudeIcon size={14} className="text-orange-400" />
                    ) : (
                      <Terminal size={14} className="text-muted-foreground" />
                    )}
                    <span>{aiMode === 'claude' ? 'Claude' : 'Plain'}</span>
                    <ChevronDown
                      size={12}
                      className={cn(
                        'text-muted-foreground transition-transform ml-auto',
                        isAIModeOpen && 'rotate-180'
                      )}
                    />
                  </Button>

                  {isAIModeOpen && (
                    <div
                      className={cn(
                        'absolute top-full left-0 mt-1 z-50',
                        'bg-muted border border-border rounded-lg shadow-xl',
                        'overflow-hidden animate-fade-in min-w-[120px]'
                      )}
                    >
                      {(['claude', 'plain'] as const).map(mode => {
                        const isDisabled = mode === 'claude' && !claudeAvailable;
                        return (
                          <Button
                            key={mode}
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (isDisabled) return;
                              setAiMode(mode);
                              setIsAIModeOpen(false);
                            }}
                            disabled={isDisabled}
                            title={isDisabled ? 'Claude CLI is not installed' : undefined}
                            className={cn(
                              'w-full justify-start text-xs',
                              mode === aiMode && 'bg-primary/10 text-primary'
                            )}
                          >
                            {mode === 'claude' ? (
                              <ClaudeIcon size={14} className="text-orange-400" />
                            ) : (
                              <Terminal size={14} className="text-muted-foreground" />
                            )}
                            <span>{mode === 'claude' ? 'Claude' : 'Plain'}</span>
                            {isDisabled && (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                Not installed
                              </span>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>

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
