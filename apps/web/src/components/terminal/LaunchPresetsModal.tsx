import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Terminal, ChevronDown, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import { GridPresetCard } from './GridPresetCard';
import type { AIMode } from './PreLaunchBar';
import type { Branch } from '@/components/shared/BranchSelector';

const GRID_PRESETS = [1, 2, 3, 4, 6, 8, 9, 12] as const;

interface LaunchPresetsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  claudeAvailable: boolean;
  currentBranch: string;
  defaultAiMode: AIMode;
  existingSessionCount: number;
  onCreateSessions: (count: number, aiMode: AIMode, branch: string) => void;
}

export function LaunchPresetsModal({
  open,
  onOpenChange,
  branches,
  claudeAvailable,
  currentBranch,
  defaultAiMode,
  existingSessionCount,
  onCreateSessions,
}: LaunchPresetsModalProps) {
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [aiMode, setAiMode] = useState<AIMode>(defaultAiMode);
  const [branch, setBranch] = useState(currentBranch);
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);

  const maxNewSlots = 12 - existingSessionCount;

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSelectedCount(null);
      setAiMode(defaultAiMode);
      setBranch(currentBranch);
      setIsAIModeOpen(false);
    }
  }, [open, defaultAiMode, currentBranch]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  const handleCreate = () => {
    if (selectedCount === null) return;
    onCreateSessions(selectedCount, aiMode, branch);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div
        className={clsx(
          'relative w-full max-w-lg mx-4',
          'bg-background rounded-2xl shadow-2xl',
          'border border-border',
          'flex flex-col',
          'animate-in'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div>
            <h2 id="launch-modal-title" className="text-lg font-semibold text-foreground">
              Launch Sessions
            </h2>
            <p className="text-sm text-muted-foreground">Choose a layout and configure defaults</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAIModeOpen(!isAIModeOpen)}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded',
                    'bg-muted border border-border',
                    'text-xs text-foreground',
                    'hover:border-muted-foreground',
                    'transition-colors min-w-[110px]'
                  )}
                >
                  {aiMode === 'claude' ? (
                    <ClaudeIcon size={14} className="text-orange-400" />
                  ) : (
                    <Terminal size={14} className="text-muted-foreground" />
                  )}
                  <span>{aiMode === 'claude' ? 'Claude' : 'Plain'}</span>
                  <ChevronDown
                    size={12}
                    className={clsx(
                      'text-muted-foreground transition-transform ml-auto',
                      isAIModeOpen && 'rotate-180'
                    )}
                  />
                </button>

                {isAIModeOpen && (
                  <div
                    className={clsx(
                      'absolute top-full left-0 mt-1 z-50',
                      'bg-muted border border-border rounded-lg shadow-xl',
                      'overflow-hidden animate-fade-in min-w-[120px]'
                    )}
                  >
                    {(['claude', 'plain'] as const).map(mode => {
                      const isDisabled = mode === 'claude' && !claudeAvailable;
                      return (
                        <button
                          type="button"
                          key={mode}
                          onClick={() => {
                            if (isDisabled) return;
                            setAiMode(mode);
                            setIsAIModeOpen(false);
                          }}
                          disabled={isDisabled}
                          title={isDisabled ? 'Claude CLI is not installed' : undefined}
                          className={clsx(
                            'w-full flex items-center gap-2 px-3 py-1.5',
                            'text-xs text-left transition-colors',
                            isDisabled
                              ? 'opacity-40 cursor-not-allowed'
                              : mode === aiMode
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-card'
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Branch selector */}
              <BranchAutocomplete
                branches={branches}
                value={branch}
                onChange={setBranch}
                placeholder="Select branch"
                className="h-8 w-[220px] text-xs"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={clsx(
              'px-4 py-2 rounded-md text-sm',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted transition-colors'
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={selectedCount === null}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium',
              'transition-colors',
              selectedCount !== null
                ? 'bg-[var(--status-success)] hover:brightness-110 text-white'
                : 'bg-border text-muted-foreground cursor-not-allowed'
            )}
          >
            {selectedCount !== null ? `Create ${selectedCount} Sessions` : 'Select a layout'}
          </button>
        </div>
      </div>
    </div>
  );
}
