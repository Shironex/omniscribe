import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { PreLaunchBar } from './PreLaunchBar';
import type { PreLaunchSlot } from './PreLaunchBar';
import type { Branch } from '@/components/shared/BranchSelector';

interface PreLaunchSectionProps {
  preLaunchSlots: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  branches: Branch[];
  canAddMore: boolean;
  onAddSlot: () => void;
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
  canAddMore,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
}: PreLaunchSectionProps) {
  return (
    <div className="flex-shrink-0 p-2 pt-0 space-y-2">
      {preLaunchSlots.map((slot, index) => (
        <PreLaunchBar
          key={slot.id}
          slot={slot}
          slotIndex={index + 1}
          branches={branches}
          isLaunching={launchingSlotIds?.has(slot.id)}
          onUpdate={onUpdateSlot}
          onLaunch={onLaunch}
          onRemove={onRemoveSlot}
        />
      ))}

      {canAddMore && (
        <button
          type="button"
          onClick={onAddSlot}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2 rounded-lg',
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
          <Plus size={16} className="group-hover:text-primary transition-colors" />
          <span className="text-sm">Add Session</span>
          <kbd className="px-1.5 py-0.5 text-xs bg-muted border border-border rounded">N</kbd>
        </button>
      )}
    </div>
  );
}
