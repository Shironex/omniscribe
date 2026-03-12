import { useEffect, useRef } from 'react';
import { PRELAUNCH_SHORTCUT_KEYS } from '@/lib/prelaunch-shortcuts';
import { useAppUIStore } from '@/stores/useAppUIStore';
import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';

interface UseAppKeyboardShortcutsParams {
  canLaunch: boolean;
  isLaunching: boolean;
  hasActiveSessions: boolean;
  terminalSessionCount: number;
  preLaunchSlots: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  activeProjectPath: string | null;
  handleAddSession: () => void;
  handleLaunch: () => void;
  handleLaunchSlot: (slotId: string) => void;
  handleStopAll: () => void;
  handleToggleSettings: () => void;
  handleCloseCurrentTab: () => void;
  handleSelectTabByIndex: (index: number) => void;
}

/**
 * Hook that manages global keyboard shortcuts for the application.
 */
export function useAppKeyboardShortcuts({
  canLaunch,
  isLaunching,
  hasActiveSessions,
  terminalSessionCount,
  preLaunchSlots,
  launchingSlotIds,
  activeProjectPath,
  handleAddSession,
  handleLaunch,
  handleLaunchSlot,
  handleStopAll,
  handleToggleSettings,
  handleCloseCurrentTab,
  handleSelectTabByIndex,
}: UseAppKeyboardShortcutsParams): void {
  // Store frequently-changing values in refs so the keydown listener doesn't
  // need to re-register on every session/slot change.
  const preLaunchSlotsRef = useRef(preLaunchSlots);
  preLaunchSlotsRef.current = preLaunchSlots;
  const terminalSessionCountRef = useRef(terminalSessionCount);
  terminalSessionCountRef.current = terminalSessionCount;
  const launchingSlotIdsRef = useRef(launchingSlotIds);
  launchingSlotIdsRef.current = launchingSlotIds;
  const canLaunchRef = useRef(canLaunch);
  canLaunchRef.current = canLaunch;
  const isLaunchingRef = useRef(isLaunching);
  isLaunchingRef.current = isLaunching;
  const hasActiveSessionsRef = useRef(hasActiveSessions);
  hasActiveSessionsRef.current = hasActiveSessions;
  const activeProjectPathRef = useRef(activeProjectPath);
  activeProjectPathRef.current = activeProjectPath;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const key = e.key.toLowerCase();
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K - Kill all sessions (works even when typing)
      if (isMod && key === 'k' && hasActiveSessionsRef.current) {
        e.preventDefault();
        handleStopAll();
        return;
      }

      // Cmd/Ctrl + , - Toggle settings modal (works even when typing)
      if (isMod && key === ',' && !e.shiftKey) {
        e.preventDefault();
        handleToggleSettings();
        return;
      }

      // Cmd/Ctrl + Shift + H - Toggle session history panel (works even when typing)
      if (isMod && e.shiftKey && key === 'h') {
        e.preventDefault();
        useAppUIStore.getState().toggleHistory();
        return;
      }

      // Cmd/Ctrl + W - Close current tab (works even when typing)
      if (isMod && key === 'w' && !e.shiftKey) {
        e.preventDefault();
        handleCloseCurrentTab();
        return;
      }

      // Cmd/Ctrl + 1-9 - Switch tabs by index (works even when typing)
      if (isMod && key >= '1' && key <= '9') {
        e.preventDefault();
        handleSelectTabByIndex(parseInt(key) - 1);
        return;
      }

      // Below shortcuts only work when not typing and no modifier keys
      if (isTyping || isMod || e.altKey) {
        return;
      }

      // Shift+N - Open launch presets modal
      if (key === 'n' && e.shiftKey && activeProjectPathRef.current) {
        e.preventDefault();
        useAppUIStore.getState().openLaunchModal();
        return;
      }

      // Below shortcuts should not fire with Shift held
      if (e.shiftKey) {
        return;
      }

      // N - Add new session slot (max 12)
      const currentSlots = preLaunchSlotsRef.current;
      const canAddMore = terminalSessionCountRef.current + currentSlots.length < 12;
      if (key === 'n' && canAddMore && activeProjectPathRef.current) {
        e.preventDefault();
        handleAddSession();
        return;
      }

      // L - Launch all pre-launch slots
      if (key === 'l' && canLaunchRef.current && !isLaunchingRef.current) {
        e.preventDefault();
        handleLaunch();
        return;
      }

      // Launch individual slot by assigned shortcut key
      if (PRELAUNCH_SHORTCUT_KEYS.includes(key)) {
        const slot = currentSlots.find(candidate => candidate.shortcutKey === key);
        if (slot && !launchingSlotIdsRef.current?.has(slot.id)) {
          e.preventDefault();
          handleLaunchSlot(slot.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleAddSession,
    handleLaunch,
    handleLaunchSlot,
    handleStopAll,
    handleToggleSettings,
    handleCloseCurrentTab,
    handleSelectTabByIndex,
  ]);
}
