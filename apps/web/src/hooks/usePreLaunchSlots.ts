import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createLogger, DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';
import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';
import { createSession } from '@/lib/session';
import { mapAiModeToBackend } from '@/lib/aiMode';
import { useTerminalStore, useWorkspaceStore, useSettingsStore } from '@/stores';
import { getNextAvailablePrelaunchShortcut } from '@/lib/prelaunch-shortcuts';

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

  // Track which slots are currently being launched (prevents spam clicking)
  const [launchingSlotIds, setLaunchingSlotIds] = useState<Set<string>>(new Set());

  // Read Claude CLI status from settings store
  const claudeCliStatus = useSettingsStore(state => state.claudeCliStatus);

  // Read configured default AI mode from workspace preferences
  const configuredDefaultAiMode = useWorkspaceStore(
    state => state.preferences.session?.defaultMode ?? DEFAULT_SESSION_SETTINGS.defaultMode
  );

  // Fall back to 'plain' when CLI status unknown (null) or not installed
  const defaultAiMode = claudeCliStatus?.installed ? configuredDefaultAiMode : 'plain';

  // Listen to add slot requests from other components (e.g., sidebar + button)
  const addSlotRequestCounter = useTerminalStore(state => state.addSlotRequestCounter);
  const prevCounterRef = useRef(addSlotRequestCounter);

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
        id: `slot-${Date.now()}`,
        aiMode: defaultAiMode,
        branch: currentBranch,
        shortcutKey: nextShortcut,
      };
      return [...prev, newSlot];
    });
  }, [currentBranch, defaultAiMode]);

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

  // Launch a single slot handler
  const handleLaunchSlot = useCallback(
    async (slotId: string) => {
      if (!activeProjectPath) {
        logger.warn('No active project to launch session');
        return;
      }

      const slot = preLaunchSlots.find(s => s.id === slotId);
      if (!slot) return;

      // Prevent double-launch: skip if this slot is already being launched
      if (launchingSlotIds.has(slotId)) {
        return;
      }

      // Mark slot as launching
      setLaunchingSlotIds(prev => new Set(prev).add(slotId));

      try {
        logger.info('Launching slot', slotId, slot.aiMode);
        // Create the session via socket (map UI aiMode to backend AiMode)
        const backendAiMode = mapAiModeToBackend(slot.aiMode);
        const session = await createSession(backendAiMode, activeProjectPath, slot.branch);

        logger.info('Session created', session.id);
        // The session:created event arrives before terminalSessionId is set,
        // so we update the store with the complete session from the response
        if (session.terminalSessionId !== undefined) {
          updateSession(session.id, { terminalSessionId: session.terminalSessionId });
        }

        // Remove the pre-launch slot
        setPreLaunchSlots(prev => prev.filter(s => s.id !== slotId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to launch session';
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
    [activeProjectPath, preLaunchSlots, launchingSlotIds, updateSession]
  );

  // Launch all pre-launch slots
  const handleLaunch = useCallback(async () => {
    logger.info('Launching all slots:', preLaunchSlots.length);
    for (const slot of preLaunchSlots) {
      await handleLaunchSlot(slot.id);
    }
  }, [preLaunchSlots, handleLaunchSlot]);

  // Compute if any launch is in progress
  const isLaunching = launchingSlotIds.size > 0;

  return {
    preLaunchSlots,
    canLaunch,
    isLaunching,
    launchingSlotIds,
    handleAddSession,
    handleRemoveSlot,
    handleUpdateSlot,
    handleLaunchSlot,
    handleLaunch,
  };
}
