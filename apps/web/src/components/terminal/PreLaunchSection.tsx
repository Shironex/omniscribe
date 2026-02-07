import { clsx } from 'clsx';
import { LayoutGrid, Plus } from 'lucide-react';
import { PreLaunchBar } from './PreLaunchBar';
import type { PreLaunchSlot } from './PreLaunchBar';
import type { Branch } from '@/components/shared/BranchSelector';

interface PreLaunchSectionProps {
  preLaunchSlots: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  branches: Branch[];
  /** Whether Claude CLI is available (controls Claude mode option) */
  claudeAvailable?: boolean;
  canAddMore: boolean;
  onAddSlot: () => void;
  onOpenLaunchModal: () => void;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
  onLaunch: (slotId: string) => void;
}

export function PreLaunchSection({
  preLaunchSlots,
  launchingSlotIds,
  branches,
  claudeAvailable,
  canAddMore,
  onAddSlot,
  onOpenLaunchModal,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
}: PreLaunchSectionProps) {
  const hasSlots = preLaunchSlots.length > 0;

  return (
    <div className="flex-shrink-0 p-2 pt-0 space-y-2">
      {preLaunchSlots.map((slot, index) => (
        <PreLaunchBar
          key={slot.id}
          slot={slot}
          slotIndex={index + 1}
          branches={branches}
          isLaunching={launchingSlotIds?.has(slot.id)}
          claudeAvailable={claudeAvailable}
          onUpdate={onUpdateSlot}
          onLaunch={onLaunch}
          onRemove={onRemoveSlot}
        />
      ))}

      {canAddMore && (
        <div className={clsx('flex gap-2', hasSlots ? 'justify-center' : '')}>
          {/* Primary action: open launch modal */}
          <button
            data-testid="setup-sessions-button"
            type="button"
            onClick={onOpenLaunchModal}
            className={clsx(
              hasSlots ? 'flex-1' : 'w-full',
              'flex items-center justify-center gap-2 py-2 rounded-lg',
              'border border-dashed border-border',
              'bg-card/30 hover:bg-card/50',
              'text-muted-foreground hover:text-foreground-secondary',
              'transition-all duration-150',
              'hover:border-primary/50',
              'group'
            )}
            aria-label="Set up sessions"
            title="Press Shift+N to set up sessions"
          >
            <LayoutGrid size={16} className="group-hover:text-primary transition-colors" />
            <span className="text-sm">Set Up Sessions</span>
            <kbd className="px-1.5 py-0.5 text-xs bg-muted border border-border rounded">
              Shift+N
            </kbd>
          </button>

          {/* Secondary action: add one more slot */}
          {hasSlots && (
            <button
              data-testid="add-session-button"
              type="button"
              onClick={onAddSlot}
              className={clsx(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg',
                'border border-dashed border-border',
                'bg-card/30 hover:bg-card/50',
                'text-muted-foreground hover:text-foreground-secondary',
                'transition-all duration-150',
                'hover:border-primary/50',
                'group'
              )}
              aria-label="Add session"
              title="Press N to add session"
            >
              <Plus size={14} className="group-hover:text-primary transition-colors" />
              <span className="text-xs">Add One</span>
              <kbd className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded">N</kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
