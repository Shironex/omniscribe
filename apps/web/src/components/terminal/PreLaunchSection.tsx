import { PreLaunchBar } from './PreLaunchBar';
import type { PreLaunchSlot } from './PreLaunchBar';
import type { Branch } from '@/components/shared/BranchSelector';

interface PreLaunchSectionProps {
  preLaunchSlots: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  branches: Branch[];
  /** Whether Claude CLI is available (controls Claude mode option) */
  claudeAvailable?: boolean;
  /** Project path for GitHub issue fetching */
  projectPath: string | null;
  /** Whether GitHub CLI is installed and authenticated */
  ghCliAvailable?: boolean;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch' | 'issue'>>
  ) => void;
  onLaunch: (slotId: string) => void;
}

export function PreLaunchSection({
  preLaunchSlots,
  launchingSlotIds,
  branches,
  claudeAvailable,
  projectPath,
  ghCliAvailable,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
}: PreLaunchSectionProps) {
  if (preLaunchSlots.length === 0) return null;

  return (
    <div className="shrink-0 p-2 pt-0 space-y-2">
      {preLaunchSlots.map((slot, index) => (
        <PreLaunchBar
          key={slot.id}
          slot={slot}
          slotIndex={index + 1}
          branches={branches}
          isLaunching={launchingSlotIds?.has(slot.id)}
          claudeAvailable={claudeAvailable}
          projectPath={projectPath}
          ghCliAvailable={ghCliAvailable}
          onUpdate={onUpdateSlot}
          onLaunch={onLaunch}
          onRemove={onRemoveSlot}
        />
      ))}
    </div>
  );
}
