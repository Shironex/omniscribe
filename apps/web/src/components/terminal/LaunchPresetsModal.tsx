import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { Terminal, ChevronDown, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import { useClickOutside } from '@/hooks/useClickOutside';
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

  const prevOpenRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const maxNewSlots = 12 - existingSessionCount;

  // Reset state only on the open transition (false → true)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedCount(null);
      setAiMode(defaultAiMode);
      setBranch(currentBranch);
      setIsAIModeOpen(false);
    }
    prevOpenRef.current = open;
  }, [open, defaultAiMode, currentBranch]);

  // Handle escape key and body scroll lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && open) {
        if (isAIModeOpen) {
          setIsAIModeOpen(false);
        } else {
          onOpenChange(false);
        }
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
  }, [open, onOpenChange, isAIModeOpen]);

  // Close AI mode dropdown on click outside
  useClickOutside(dropdownRef, () => {
    if (isAIModeOpen) setIsAIModeOpen(false);
  });

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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
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
                    className={clsx(
                      'text-muted-foreground transition-transform ml-auto',
                      isAIModeOpen && 'rotate-180'
                    )}
                  />
                </Button>

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
                          className={clsx(
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleCreate} disabled={selectedCount === null}>
            {selectedCount !== null ? `Create ${selectedCount} Sessions` : 'Select a layout'}
          </Button>
        </div>
      </div>
    </div>
  );
}
