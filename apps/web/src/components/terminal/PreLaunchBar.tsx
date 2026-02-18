import { cn } from '@/lib/utils';
import { Play, X, Terminal, Bot, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, useMemo, type ComponentType } from 'react';
import type { Branch } from '@/components/shared/BranchSelector';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { usePluginStore } from '@/stores/usePluginStore';
import { getPrelaunchShortcutForIndex } from '@/lib/prelaunch-shortcuts';
import { Button } from '@/components/ui/button';
import type { AiMode, WorktreeMode } from '@omniscribe/shared';

export interface PreLaunchSlot {
  id: string;
  aiMode: AiMode;
  branch: string;
  shortcutKey: string;
}

interface PreLaunchBarProps {
  slot: PreLaunchSlot;
  slotIndex?: number;
  branches: Branch[];
  isLaunching?: boolean;
  /** Whether Claude CLI is available (kept for backward compat, overridden by provider cliStatus) */
  claudeAvailable?: boolean;
  /** Worktree mode -- hides branch selector when 'never' */
  worktreeMode?: WorktreeMode;
  onUpdate: (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => void;
  onLaunch: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  onCreateBranch?: (branchName: string) => void;
  className?: string;
}

interface AIModeOption {
  value: AiMode;
  label: string;
  icon: ComponentType<{ size?: string | number; className?: string }>;
  color: string;
}

export function PreLaunchBar({
  slot,
  slotIndex,
  branches,
  isLaunching = false,
  claudeAvailable: _claudeAvailable = true,
  worktreeMode,
  onUpdate,
  onLaunch,
  onRemove,
  onCreateBranch,
  className,
}: PreLaunchBarProps) {
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);
  const aiModeRef = useRef<HTMLDivElement>(null);
  const providers = usePluginStore(s => s.providers);
  const statusRenderers = usePluginStore(s => s.statusRenderers);

  // Build AI mode options dynamically from registered providers
  const aiModeOptions: AIModeOption[] = useMemo(() => {
    const options: AIModeOption[] = [];

    // Add provider-contributed modes with icons from status renderers
    for (const provider of providers) {
      let icon: ComponentType<{ size?: string | number; className?: string }> = Bot;
      for (const [, reg] of statusRenderers) {
        if (reg.aiMode === provider.aiMode) {
          icon = reg.component as ComponentType<{ size?: string | number; className?: string }>;
          break;
        }
      }
      options.push({
        value: provider.aiMode as AiMode,
        label: provider.displayName,
        icon,
        color: 'text-primary',
      });
    }

    // Always add plain mode (built-in, not a plugin)
    options.push({
      value: 'plain',
      label: 'Plain',
      icon: Terminal,
      color: 'text-muted-foreground',
    });

    return options;
  }, [providers, statusRenderers]);

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
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        'bg-card border border-border rounded-lg',
        className
      )}
    >
      {/* AI Mode selector */}
      <div ref={aiModeRef} className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAIModeOpen(!isAIModeOpen)}
          className="min-w-[100px] text-xs"
        >
          <SelectedIcon size={14} className={selectedMode.color} />
          <span data-testid="ai-mode-label">{selectedMode.label}</span>
          <ChevronDown
            size={12}
            className={cn(
              'text-muted-foreground transition-transform ml-auto',
              isAIModeOpen && 'rotate-180'
            )}
          />
        </Button>

        {/* AI Mode dropdown */}
        {isAIModeOpen && (
          <div
            className={cn(
              'absolute bottom-full left-0 mb-1 z-50',
              'bg-muted border border-border rounded-lg shadow-xl',
              'overflow-hidden animate-fade-in min-w-[120px]'
            )}
          >
            {aiModeOptions.map(option => {
              const Icon = option.icon;
              // Disable non-plain modes whose provider CLI is not installed
              const isDisabled =
                option.value !== 'plain' &&
                !providers.find(p => p.aiMode === option.value)?.cliStatus?.installed;
              return (
                <Button
                  key={option.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (isDisabled) return;
                    onUpdate(slot.id, { aiMode: option.value });
                    setIsAIModeOpen(false);
                  }}
                  disabled={isDisabled}
                  title={isDisabled ? 'CLI is not installed' : undefined}
                  className={cn(
                    'w-full justify-start text-xs',
                    option.value === slot.aiMode && 'bg-primary/10 text-primary'
                  )}
                >
                  <Icon size={14} className={option.color} />
                  <span>{option.label}</span>
                  {isDisabled && (
                    <span className="ml-auto text-[10px] text-muted-foreground">Not installed</span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Branch selector -- hidden when worktrees are disabled */}
      {worktreeMode !== 'never' && (
        <BranchAutocomplete
          branches={branches}
          value={slot.branch}
          onChange={branchName => onUpdate(slot.id, { branch: branchName })}
          onCreateBranch={onCreateBranch}
          placeholder="Select branch"
          side="top"
          className="h-8 w-[240px] text-xs"
        />
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Launch button */}
      <Button
        variant="default"
        size="sm"
        onClick={() => onLaunch(slot.id)}
        disabled={isLaunching}
        className="text-xs"
        title={shortcutKey ? `Press ${shortcutKey} to launch` : undefined}
      >
        <Play size={12} fill="currentColor" />
        <span>{isLaunching ? 'Launching...' : 'Launch'}</span>
        {shortcutKey && !isLaunching && (
          <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-white/20 rounded">{shortcutKey}</kbd>
        )}
      </Button>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(slot.id)}
        className="text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
        aria-label="Remove"
      >
        <X size={14} />
      </Button>
    </div>
  );
}
