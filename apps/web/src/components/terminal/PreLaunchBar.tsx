import React from 'react';
import { cn } from '@/lib/utils';
import { Play, X } from 'lucide-react';
import type { Branch } from '@/components/shared/BranchSelector';
import { BranchAutocomplete } from '@/components/shared/BranchAutocomplete';
import { AiModeDropdown } from '@/components/shared/AiModeDropdown';
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

export const PreLaunchBar = React.memo(function PreLaunchBar({
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
  const shortcutKey =
    slot.shortcutKey || (slotIndex ? getPrelaunchShortcutForIndex(slotIndex - 1) : null);

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        'bg-muted/50 border border-border/60 rounded-lg backdrop-blur-sm',
        className
      )}
    >
      {/* AI Mode selector */}
      <AiModeDropdown
        value={slot.aiMode}
        onChange={mode => onUpdate(slot.id, { aiMode: mode })}
        direction="up"
      />

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
});

PreLaunchBar.displayName = 'PreLaunchBar';
