import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Play, Trash2, Bot, Sparkles, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { BranchSelector, Branch } from '../shared/BranchSelector';

export type AIMode = 'claude' | 'gemini' | 'codex' | 'plain';

export interface PreLaunchSlot {
  id: string;
  aiMode: AIMode;
  branch: string;
}

interface PreLaunchCardProps {
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
  { value: 'plain', label: 'Plain', icon: Bot, color: 'text-omniscribe-text-muted' },
];

export function PreLaunchCard({
  slot,
  branches,
  onUpdate,
  onLaunch,
  onRemove,
  className,
}: PreLaunchCardProps) {
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

  const selectedMode = aiModeOptions.find((m) => m.value === slot.aiMode) || aiModeOptions[0];
  const SelectedIcon = selectedMode.icon;

  return (
    <div
      className={twMerge(
        clsx(
          'flex flex-col h-full',
          'bg-omniscribe-card border border-omniscribe-border rounded-lg',
          'overflow-hidden',
          className
        )
      )}
    >
      {/* Card header */}
      <div className="h-7 bg-omniscribe-surface border-b border-omniscribe-border flex items-center justify-between px-2">
        <span className="text-xs font-medium text-omniscribe-text-secondary">
          New Session
        </span>
        <button
          onClick={() => onRemove(slot.id)}
          className={clsx(
            'p-1 rounded',
            'text-omniscribe-text-muted hover:text-red-400',
            'hover:bg-red-400/10 transition-colors'
          )}
          aria-label="Remove slot"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Card content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {/* AI Mode selector */}
        <div ref={aiModeRef} className="relative w-full max-w-48">
          <label className="block text-2xs font-medium text-omniscribe-text-muted uppercase tracking-wide mb-1.5">
            AI Mode
          </label>
          <button
            onClick={() => setIsAIModeOpen(!isAIModeOpen)}
            className={clsx(
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded',
              'bg-omniscribe-surface border border-omniscribe-border',
              'text-sm text-omniscribe-text-primary',
              'hover:bg-omniscribe-border hover:border-omniscribe-text-muted',
              'transition-colors'
            )}
          >
            <div className="flex items-center gap-2">
              <SelectedIcon size={16} className={selectedMode.color} />
              <span>{selectedMode.label}</span>
            </div>
            <ChevronDown
              size={14}
              className={clsx(
                'text-omniscribe-text-muted transition-transform',
                isAIModeOpen && 'rotate-180'
              )}
            />
          </button>

          {/* AI Mode dropdown */}
          {isAIModeOpen && (
            <div
              className={clsx(
                'absolute top-full left-0 right-0 mt-1 z-50',
                'bg-omniscribe-surface border border-omniscribe-border rounded-lg shadow-xl',
                'overflow-hidden animate-fade-in'
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
                      'w-full flex items-center gap-2 px-3 py-2',
                      'text-sm text-left transition-colors',
                      option.value === slot.aiMode
                        ? 'bg-omniscribe-accent-primary/10 text-omniscribe-accent-primary'
                        : 'text-omniscribe-text-primary hover:bg-omniscribe-card'
                    )}
                  >
                    <Icon size={16} className={option.color} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Branch selector */}
        <div className="w-full max-w-48">
          <label className="block text-2xs font-medium text-omniscribe-text-muted uppercase tracking-wide mb-1.5">
            Branch
          </label>
          <BranchSelector
            branches={branches}
            currentBranch={slot.branch}
            onSelect={(branchName) => onUpdate(slot.id, { branch: branchName })}
            className="w-full"
          />
        </div>

        {/* Launch button */}
        <button
          onClick={() => onLaunch(slot.id)}
          className={clsx(
            'flex items-center justify-center gap-2 px-6 py-2 rounded-lg',
            'bg-omniscribe-accent-primary hover:bg-omniscribe-accent-primary/80',
            'text-sm font-medium text-white',
            'transition-colors shadow-lg shadow-omniscribe-accent-primary/20',
            'hover:shadow-xl hover:shadow-omniscribe-accent-primary/30'
          )}
        >
          <Play size={16} fill="currentColor" />
          <span>Launch</span>
        </button>
      </div>
    </div>
  );
}
