import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';
import { useSlotState } from './useSlotState';
import { useSlotLaunch } from './useSlotLaunch';

interface UsePreLaunchSlotsReturn {
  /** Pre-launch slots state */
  preLaunchSlots: PreLaunchSlot[];
  /** Whether launch is available */
  canLaunch: boolean;
  /** Whether any launch is in progress (for global launch button) */
  isLaunching: boolean;
  /** Set of slot IDs currently being launched (for individual launch buttons) */
  launchingSlotIds: Set<string>;
  /** Handler to add a new session slot */
  handleAddSession: () => void;
  /** Handler to remove a slot */
  handleRemoveSlot: (slotId: string) => void;
  /** Handler to update a slot */
  handleUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
  /** Handler to batch-create slots with shared defaults */
  handleBatchAddSessions: (count: number, aiMode: PreLaunchSlot['aiMode'], branch: string) => void;
  /** Handler to launch a single slot */
  handleLaunchSlot: (slotId: string) => Promise<void>;
  /** Handler to launch all slots */
  handleLaunch: () => Promise<void>;
}

/**
 * Hook for pre-launch slot management.
 * Orchestrates slot state (CRUD) and launch operations via sub-hooks.
 */
export function usePreLaunchSlots(
  activeProjectPath: string | null,
  currentBranch: string
): UsePreLaunchSlotsReturn {
  const {
    preLaunchSlots,
    setPreLaunchSlots,
    preLaunchSlotsRef,
    canLaunch,
    handleAddSession,
    handleRemoveSlot,
    handleUpdateSlot,
    handleBatchAddSessions,
  } = useSlotState(activeProjectPath, currentBranch);

  const { isLaunching, launchingSlotIds, handleLaunchSlot, handleLaunch } = useSlotLaunch(
    activeProjectPath,
    preLaunchSlotsRef,
    setPreLaunchSlots
  );

  return {
    preLaunchSlots,
    canLaunch,
    isLaunching,
    launchingSlotIds,
    handleAddSession,
    handleBatchAddSessions,
    handleRemoveSlot,
    handleUpdateSlot,
    handleLaunchSlot,
    handleLaunch,
  };
}
