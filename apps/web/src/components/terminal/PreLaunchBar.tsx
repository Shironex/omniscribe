import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Play, X, Terminal, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, type ComponentType } from 'react';
import type { Branch } from '@/components/shared/BranchSelector';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import { getPrelaunchShortcutForIndex } from '@/lib/prelaunch-shortcuts';

export type AIMode = 'claude' | 'plain';

export interface PreLaunchSlot {
  id: string;
  aiMode: AIMode;
  branch: string;
  shortcutKey: string;
}

interface PreLaunchBarProps {
  slot: PreLaunchSlot;
  slotIndex?: number;
  branches: Branch[];
  isLaunching?: boolean;
  /** Whether Claude CLI is available (controls Claude mode option) */
  claudeAvailable?: boolean;
  onUpdate: (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => void;
  onLaunch: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  onCreateBranch?: (branchName: string) => void;
  className?: string;
}

interface AIModeOption {
  value: AIMode;
  label: string;
  icon: ComponentType<{ size?: string | number; className?: string }>;
  color: string;
}

const aiModeOptions: AIModeOption[] = [
  { value: 'claude', label: 'Claude', icon: ClaudeIcon, color: 'text-orange-400' },
  { value: 'plain', label: 'Plain', icon: Terminal, color: 'text-muted-foreground' },
];

export function PreLaunchBar({
  slot,
  slotIndex,
  branches,
  isLaunching = false,
  claudeAvailable = true,
  onUpdate,
  onLaunch,
  onRemove,
  onCreateBranch,
  className,
}: PreLaunchBarProps) {
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);
  const aiModeRef = useRef<HTMLDivElement>(null);

  // Close AI mode dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (aiModeRef.current && !aiModeRef.current.contains(event.target as Node)) {
        setIsAIModeOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedMode = aiModeOptions.find(m => m.value === slot.aiMode) || aiModeOptions[0];
  const SelectedIcon = selectedMode.icon;
  const shortcutKey =
    slot.shortcutKey || (slotIndex ? getPrelaunchShortcutForIndex(slotIndex - 1) : null);

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
          <span data-testid="ai-mode-label">{selectedMode.label}</span>
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
            {aiModeOptions.map(option => {
              const Icon = option.icon;
              const isDisabled = option.value === 'claude' && !claudeAvailable;
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    if (isDisabled) return;
                    onUpdate(slot.id, { aiMode: option.value });
                    setIsAIModeOpen(false);
                  }}
                  disabled={isDisabled}
                  title={isDisabled ? 'Claude CLI is not installed' : undefined}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-1.5',
                    'text-xs text-left transition-colors',
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : option.value === slot.aiMode
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-card'
                  )}
                >
                  <Icon size={14} className={option.color} />
                  <span>{option.label}</span>
                  {isDisabled && (
                    <span className="ml-auto text-[10px] text-muted-foreground">Not installed</span>
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
        value={slot.branch}
        onChange={branchName => onUpdate(slot.id, { branch: branchName })}
        onCreateBranch={onCreateBranch}
        placeholder="Select branch"
        side="top"
        className="h-8 w-[240px] text-xs"
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Launch button */}
      <button
        onClick={() => onLaunch(slot.id)}
        disabled={isLaunching}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1 rounded',
          'text-xs font-medium',
          'transition-colors',
          isLaunching
            ? 'bg-border text-muted-foreground cursor-not-allowed opacity-60'
            : 'bg-primary hover:brightness-110 text-primary-foreground'
        )}
        title={shortcutKey ? `Press ${shortcutKey} to launch` : undefined}
      >
        <Play size={12} fill="currentColor" />
        <span>{isLaunching ? 'Launching...' : 'Launch'}</span>
        {shortcutKey && !isLaunching && (
          <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-white/20 rounded">{shortcutKey}</kbd>
        )}
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
