import { useState, useCallback } from 'react';
import type { PreLaunchSlot } from '../components/terminal/TerminalGrid';
import { createSession } from '../lib/session';
import { mapAiModeToBackend } from '../lib/aiMode';

interface UsePreLaunchSlotsReturn {
  /** Pre-launch slots state */
  preLaunchSlots: PreLaunchSlot[];
  /** Whether launch is available */
  canLaunch: boolean;
  /** Handler to add a new session slot */
  handleAddSession: () => void;
  /** Handler to remove a slot */
  handleRemoveSlot: (slotId: string) => void;
  /** Handler to update a slot */
  handleUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
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
  currentBranch: string,
  updateSession: (sessionId: string, updates: { terminalSessionId?: number }) => void
): UsePreLaunchSlotsReturn {
  // Pre-launch slots state (sessions waiting to be launched)
  const [preLaunchSlots, setPreLaunchSlots] = useState<PreLaunchSlot[]>([]);

  // Can launch if we have a project selected and have pre-launch slots
  const canLaunch = activeProjectPath !== null && preLaunchSlots.length > 0;

  // Add session (pre-launch slot) handler
  const handleAddSession = useCallback(() => {
    const newSlot: PreLaunchSlot = {
      id: `slot-${Date.now()}`,
      aiMode: 'claude',
      branch: currentBranch,
    };
    setPreLaunchSlots((prev) => [...prev, newSlot]);
  }, [currentBranch]);

  // Remove pre-launch slot handler
  const handleRemoveSlot = useCallback((slotId: string) => {
    setPreLaunchSlots((prev) => prev.filter((s) => s.id !== slotId));
  }, []);

  // Update pre-launch slot handler
  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>) => {
      setPreLaunchSlots((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot))
      );
    },
    []
  );

  // Launch a single slot handler
  const handleLaunchSlot = useCallback(
    async (slotId: string) => {
      if (!activeProjectPath) {
        console.warn('No active project to launch session');
        return;
      }

      const slot = preLaunchSlots.find((s) => s.id === slotId);
      if (!slot) return;

      try {
        // Create the session via socket (map UI aiMode to backend AiMode)
        const backendAiMode = mapAiModeToBackend(slot.aiMode);
        const session = await createSession(backendAiMode, activeProjectPath, slot.branch);

        // The session:created event arrives before terminalSessionId is set,
        // so we update the store with the complete session from the response
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }

        // Remove the pre-launch slot
        setPreLaunchSlots((prev) => prev.filter((s) => s.id !== slotId));
      } catch (error) {
        console.error('Failed to launch session:', error);
      }
    },
    [activeProjectPath, preLaunchSlots, updateSession]
  );

  // Launch all pre-launch slots
  const handleLaunch = useCallback(async () => {
    for (const slot of preLaunchSlots) {
      await handleLaunchSlot(slot.id);
    }
  }, [preLaunchSlots, handleLaunchSlot]);

  return {
    preLaunchSlots,
    canLaunch,
    handleAddSession,
    handleRemoveSlot,
    handleUpdateSlot,
    handleLaunchSlot,
    handleLaunch,
  };
}
