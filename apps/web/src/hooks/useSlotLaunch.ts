import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';
import { createSession } from '@/lib/session';
import { useSessionStore } from '@/stores/useSessionStore';
import type { FrontendSessionConfig } from '@/stores/useSessionStore';

const logger = createLogger('PreLaunchSlots');

export interface UseSlotLaunchReturn {
  isLaunching: boolean;
  launchingSlotIds: Set<string>;
  handleLaunchSlot: (slotId: string) => Promise<void>;
  handleLaunch: () => Promise<void>;
}

/**
 * Hook for pre-launch slot launch orchestration.
 * Handles launching individual slots and batch launching all slots.
 */
export function useSlotLaunch(
  activeProjectPath: string | null,
  preLaunchSlotsRef: React.MutableRefObject<PreLaunchSlot[]>,
  setPreLaunchSlots: React.Dispatch<React.SetStateAction<PreLaunchSlot[]>>
): UseSlotLaunchReturn {
  const updateSession: (sessionId: string, updates: Partial<FrontendSessionConfig>) => void =
    useSessionStore(state => state.updateSession);

  const [launchingSlotIds, setLaunchingSlotIds] = useState<Set<string>>(new Set());

  const launchingSlotIdsRef = useRef(launchingSlotIds);
  launchingSlotIdsRef.current = launchingSlotIds;

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
    [activeProjectPath, updateSession, preLaunchSlotsRef, setPreLaunchSlots]
  );

  // Launch all pre-launch slots (reads from ref to avoid stale closure)
  const handleLaunch = useCallback(async () => {
    const slots = preLaunchSlotsRef.current;
    logger.info('Launching all slots:', slots.length);
    for (const slot of slots) {
      await handleLaunchSlot(slot.id);
    }
  }, [handleLaunchSlot, preLaunchSlotsRef]);

  const isLaunching = launchingSlotIds.size > 0;

  return {
    isLaunching,
    launchingSlotIds,
    handleLaunchSlot,
    handleLaunch,
  };
}
