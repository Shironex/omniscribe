import { useState, useCallback, useEffect, useRef } from 'react';
import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';

import { useTerminalStore } from '@/stores/useTerminalStore';
import { useSessionStore, selectRunningSessionCount } from '@/stores/useSessionStore';
import { useDefaultAiMode } from './useDefaultAiMode';
import { toast } from 'sonner';
import {
  getNextAvailablePrelaunchShortcut,
  PRELAUNCH_SHORTCUT_KEYS,
} from '@/lib/prelaunch-shortcuts';

const MAX_PRELAUNCH_SLOTS = 12;

export interface UseSlotStateReturn {
  preLaunchSlots: PreLaunchSlot[];
  /** @internal Used by useSlotLaunch for cross-hook coordination */
  setPreLaunchSlots: React.Dispatch<React.SetStateAction<PreLaunchSlot[]>>;
  /** @internal Used by useSlotLaunch for stale-closure avoidance */
  preLaunchSlotsRef: React.MutableRefObject<PreLaunchSlot[]>;
  canLaunch: boolean;
  handleAddSession: () => void;
  handleRemoveSlot: (slotId: string) => void;
  handleUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
  handleBatchAddSessions: (count: number, aiMode: PreLaunchSlot['aiMode'], branch: string) => void;
}

/**
 * Hook for pre-launch slot CRUD state management.
 * Handles slot creation, removal, updates, branch auto-update, and external add requests.
 */
export function useSlotState(
  activeProjectPath: string | null,
  currentBranch: string
): UseSlotStateReturn {
  const [preLaunchSlots, setPreLaunchSlots] = useState<PreLaunchSlot[]>([]);
  const { defaultAiMode } = useDefaultAiMode();

  // Track previous currentBranch to auto-update stale slots (Bug #3)
  const prevBranchRef = useRef(currentBranch);

  // Ref to always access current slots (avoids stale closures in async callbacks)
  const preLaunchSlotsRef = useRef(preLaunchSlots);
  preLaunchSlotsRef.current = preLaunchSlots;

  const canLaunch = activeProjectPath !== null && preLaunchSlots.length > 0;

  const handleAddSession = useCallback(() => {
    setPreLaunchSlots(prev => {
      if (prev.length >= MAX_PRELAUNCH_SLOTS) {
        return prev;
      }

      const nextShortcut = getNextAvailablePrelaunchShortcut(prev.map(slot => slot.shortcutKey));
      if (!nextShortcut) {
        return prev;
      }

      const newSlot: PreLaunchSlot = {
        id: `slot-${crypto.randomUUID()}`,
        aiMode: defaultAiMode,
        branch: currentBranch,
        shortcutKey: nextShortcut,
      };
      return [...prev, newSlot];
    });
  }, [currentBranch, defaultAiMode]);

  const handleBatchAddSessions = useCallback(
    (count: number, aiMode: PreLaunchSlot['aiMode'], branch: string) => {
      const activeSessionCount = selectRunningSessionCount(useSessionStore.getState());
      const capped = Math.min(count, MAX_PRELAUNCH_SLOTS - activeSessionCount);
      if (capped <= 0) {
        toast.error('Session limit reached (12 max)');
        return;
      }
      const slots: PreLaunchSlot[] = [];
      for (let i = 0; i < capped; i++) {
        const shortcutKey = PRELAUNCH_SHORTCUT_KEYS[i];
        if (!shortcutKey) break;
        slots.push({
          id: `slot-${crypto.randomUUID()}`,
          aiMode,
          branch,
          shortcutKey,
        });
      }
      setPreLaunchSlots(slots);
    },
    []
  );

  // Auto-update pre-launch slots when currentBranch changes (Bug #3: stale branch)
  // Only updates slots that still have the previous current branch (not user-customized ones)
  // Returns same reference when no slots need updating to avoid unnecessary re-render
  useEffect(() => {
    const prevBranch = prevBranchRef.current;
    if (prevBranch !== currentBranch) {
      prevBranchRef.current = currentBranch;
      setPreLaunchSlots(prev => {
        if (!prev.some(slot => slot.branch === prevBranch)) return prev;
        return prev.map(slot =>
          slot.branch === prevBranch ? { ...slot, branch: currentBranch } : slot
        );
      });
    }
  }, [currentBranch]);

  // Listen to external add slot requests (from sidebar + button) via store subscription.
  // Uses subscribe() instead of reactive state + useEffect to avoid intermediate renders.
  useEffect(() => {
    let prevCounter = useTerminalStore.getState().addSlotRequestCounter;
    const unsub = useTerminalStore.subscribe(state => {
      if (state.addSlotRequestCounter === prevCounter) return;
      prevCounter = state.addSlotRequestCounter;
      handleAddSession();
    });
    return unsub;
  }, [handleAddSession]);

  const handleRemoveSlot = useCallback((slotId: string) => {
    setPreLaunchSlots(prev => prev.filter(s => s.id !== slotId));
  }, []);

  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => {
      setPreLaunchSlots(prev =>
        prev.map(slot => (slot.id === slotId ? { ...slot, ...updates } : slot))
      );
    },
    []
  );

  return {
    preLaunchSlots,
    setPreLaunchSlots,
    preLaunchSlotsRef,
    canLaunch,
    handleAddSession,
    handleRemoveSlot,
    handleUpdateSlot,
    handleBatchAddSessions,
  };
}
