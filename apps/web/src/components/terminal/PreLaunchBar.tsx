import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Play, X, Bot, Sparkles, ChevronDown, GitBranch } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Branch } from '../shared/BranchSelector';

export type AIMode = 'claude' | 'gemini' | 'codex' | 'plain';

export interface PreLaunchSlot {
  id: string;
  aiMode: AIMode;
  branch: string;
}

interface PreLaunchBarProps {
  slot: PreLaunchSlot;
  branches: Branch[];
  onUpdate: (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => void;
  onLaunch: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  className?: string;
}

const aiModeOptions: { value: AIMode; label: string; icon: typeof Bot; color: string }[] = [
  { value: 'claude', label: 'Claude', icon: Bot, color: 'text-orange-400' },
  { value: 'gemini', label: 'Gemini', icon: Sparkles, color: 'text-blue-400' },
  { value: 'codex', label: 'Codex', icon: Sparkles, color: 'text-green-400' },
  { value: 'plain', label: 'Plain', icon: Bot, color: 'text-muted-foreground' },
];

export function PreLaunchBar({
  slot,
  branches,
  onUpdate,
  onLaunch,
  onRemove,
  className,
}: PreLaunchBarProps) {
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const aiModeRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (aiModeRef.current && !aiModeRef.current.contains(event.target as Node)) {
        setIsAIModeOpen(false);
      }
      if (branchRef.current && !branchRef.current.contains(event.target as Node)) {
        setIsBranchOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedMode = aiModeOptions.find((m) => m.value === slot.aiMode) || aiModeOptions[0];
  const SelectedIcon = selectedMode.icon;

  // Filter branches for display (show max 10 in dropdown)
  const displayBranches = branches.slice(0, 10);
  const currentBranchDisplay = slot.branch.length > 20
    ? slot.branch.substring(0, 17) + '...'
    : slot.branch;

  return (
    <div
      className={twMerge(
        clsx(
          'flex items-center gap-2 px-3 py-2',
          'bg-card border border-border rounded-lg',
          className
        )
      )}
    >
      {/* AI Mode selector */}
      <div ref={aiModeRef} className="relative">
        <button
          onClick={() => setIsAIModeOpen(!isAIModeOpen)}
          className={clsx(
            'flex items-center gap-2 px-2 py-1 rounded',
            'bg-muted border border-border',
            'text-xs text-foreground',
            'hover:border-muted-foreground',
            'transition-colors min-w-[100px]'
          )}
        >
          <SelectedIcon size={14} className={selectedMode.color} />
          <span>{selectedMode.label}</span>
          <ChevronDown
            size={12}
            className={clsx(
              'text-muted-foreground transition-transform ml-auto',
              isAIModeOpen && 'rotate-180'
            )}
          />
        </button>

        {/* AI Mode dropdown */}
        {isAIModeOpen && (
          <div
            className={clsx(
              'absolute bottom-full left-0 mb-1 z-50',
              'bg-muted border border-border rounded-lg shadow-xl',
              'overflow-hidden animate-fade-in min-w-[120px]'
            )}
          >
            {aiModeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    onUpdate(slot.id, { aiMode: option.value });
                    setIsAIModeOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-1.5',
                    'text-xs text-left transition-colors',
                    option.value === slot.aiMode
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-card'
                  )}
                >
                  <Icon size={14} className={option.color} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Branch selector */}
      <div ref={branchRef} className="relative">
        <button
          onClick={() => setIsBranchOpen(!isBranchOpen)}
          className={clsx(
            'flex items-center gap-2 px-2 py-1 rounded',
            'bg-muted border border-border',
            'text-xs text-foreground',
            'hover:border-muted-foreground',
            'transition-colors min-w-[120px] max-w-[180px]'
          )}
        >
          <GitBranch size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="truncate">{currentBranchDisplay}</span>
          <ChevronDown
            size={12}
            className={clsx(
              'text-muted-foreground transition-transform ml-auto flex-shrink-0',
              isBranchOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Branch dropdown */}
        {isBranchOpen && (
          <div
            className={clsx(
              'absolute bottom-full left-0 mb-1 z-50',
              'bg-muted border border-border rounded-lg shadow-xl',
              'overflow-hidden animate-fade-in min-w-[180px] max-h-[200px] overflow-y-auto'
            )}
          >
            {displayBranches.map((branch) => (
              <button
                key={branch.name}
                onClick={() => {
                  onUpdate(slot.id, { branch: branch.name });
                  setIsBranchOpen(false);
                }}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-1.5',
                  'text-xs text-left transition-colors',
                  branch.name === slot.branch
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-card'
                )}
              >
                <GitBranch size={12} className="text-muted-foreground flex-shrink-0" />
                <span className="truncate">{branch.name}</span>
                {branch.isCurrent && (
                  <span className="text-2xs text-muted-foreground ml-auto">(current)</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Launch button */}
      <button
        onClick={() => onLaunch(slot.id)}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1 rounded',
          'bg-primary hover:bg-primary/80',
          'text-xs font-medium text-white',
          'transition-colors'
        )}
      >
        <Play size={12} fill="currentColor" />
        <span>Launch</span>
      </button>

      {/* Remove button */}
      <button
        onClick={() => onRemove(slot.id)}
        className={clsx(
          'p-1 rounded',
          'text-muted-foreground hover:text-red-400',
          'hover:bg-red-400/10 transition-colors'
        )}
        aria-label="Remove"
      >
        <X size={14} />
      </button>
    </div>
  );
}
