import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';
import { createSession } from '@/lib/session';

import { useTerminalStore, useSessionStore, selectRunningSessionCount } from '@/stores';
import type { FrontendSessionConfig } from '@/stores/useSessionStore';
import { useDefaultAiMode } from './useDefaultAiMode';
import {
  getNextAvailablePrelaunchShortcut,
  PRELAUNCH_SHORTCUT_KEYS,
} from '@/lib/prelaunch-shortcuts';

const logger = createLogger('PreLaunchSlots');
const MAX_PRELAUNCH_SLOTS = 12;

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
 * Handles slot state and all slot operations.
 */
export function usePreLaunchSlots(
  activeProjectPath: string | null,
  currentBranch: string
): UsePreLaunchSlotsReturn {
  const updateSession: (sessionId: string, updates: Partial<FrontendSessionConfig>) => void =
    useSessionStore(state => state.updateSession);
  // Pre-launch slots state (sessions waiting to be launched)
  const [preLaunchSlots, setPreLaunchSlots] = useState<PreLaunchSlot[]>([]);

  // Track which slots are currently being launched (prevents spam clicking)
  const [launchingSlotIds, setLaunchingSlotIds] = useState<Set<string>>(new Set());

  // Derived default AI mode (shared with App.tsx)
  const { defaultAiMode } = useDefaultAiMode();

  // Track previous currentBranch to auto-update stale slots (Bug #3)
  const prevBranchRef = useRef(currentBranch);

  // Listen to add slot requests from other components (e.g., sidebar + button)
  const addSlotRequestCounter = useTerminalStore(state => state.addSlotRequestCounter);
  const prevCounterRef = useRef(addSlotRequestCounter);

  // Ref to always access current slots (avoids stale closures in async callbacks)
  const preLaunchSlotsRef = useRef(preLaunchSlots);
  preLaunchSlotsRef.current = preLaunchSlots;

  const launchingSlotIdsRef = useRef(launchingSlotIds);
  launchingSlotIdsRef.current = launchingSlotIds;

  // Can launch if we have a project selected and have pre-launch slots
  const canLaunch = activeProjectPath !== null && preLaunchSlots.length > 0;

  // Add session (pre-launch slot) handler
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

  // Batch-create N slots with shared defaults (replaces existing pre-launch slots)
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

  // Listen to external add slot requests (from sidebar + button)
  useEffect(() => {
    if (addSlotRequestCounter > prevCounterRef.current) {
      handleAddSession();
    }
    prevCounterRef.current = addSlotRequestCounter;
  }, [addSlotRequestCounter, handleAddSession]);

  // Remove pre-launch slot handler
  const handleRemoveSlot = useCallback((slotId: string) => {
    setPreLaunchSlots(prev => prev.filter(s => s.id !== slotId));
  }, []);

  // Update pre-launch slot handler
  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => {
      setPreLaunchSlots(prev =>
        prev.map(slot => (slot.id === slotId ? { ...slot, ...updates } : slot))
      );
    },
    []
  );

  // Launch a single slot handler (reads from refs to avoid stale closures)
  const handleLaunchSlot = useCallback(
    async (slotId: string) => {
      if (!activeProjectPath) {
        logger.warn('No active project to launch session');
        return;
      }

      const slot = preLaunchSlotsRef.current.find(s => s.id === slotId);
      if (!slot) return;

      // Prevent double-launch: skip if this slot is already being launched
      if (launchingSlotIdsRef.current.has(slotId)) {
        return;
      }

      // Mark slot as launching
      setLaunchingSlotIds(prev => new Set(prev).add(slotId));

      try {
        logger.info('Launching slot', slotId, slot.aiMode);
        // Create the session via socket (map UI aiMode to backend AiMode)
        const session = await createSession(slot.aiMode, activeProjectPath, slot.branch);

        logger.info('Session created', session.id);
        // The session:created event arrives before terminalSessionId is set,
        // so we update the store with the complete session from the response
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }

        // Remove the pre-launch slot
        setPreLaunchSlots(prev => prev.filter(s => s.id !== slotId));
      } catch (error) {
        const message = extractErrorMessage(error, 'Failed to launch session');
        logger.error('Failed to launch session:', error);
        toast.error(message);
      } finally {
        // Clear launching state (whether success or failure)
        setLaunchingSlotIds(prev => {
          const next = new Set(prev);
          next.delete(slotId);
          return next;
        });
      }
    },
    [activeProjectPath, updateSession]
  );

  // Launch all pre-launch slots (reads from ref to avoid stale closure)
  const handleLaunch = useCallback(async () => {
    const slots = preLaunchSlotsRef.current;
    logger.info('Launching all slots:', slots.length);
    for (const slot of slots) {
      await handleLaunchSlot(slot.id);
    }
  }, [handleLaunchSlot]);

  // Compute if any launch is in progress
  const isLaunching = launchingSlotIds.size > 0;

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
