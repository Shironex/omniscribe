import { useEffect } from 'react';
import { PRELAUNCH_SHORTCUT_KEYS } from '@/lib/prelaunch-shortcuts';
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
  handleOpenLaunchModal: () => void;
  handleLaunch: () => void;
  handleLaunchSlot: (slotId: string) => void;
  handleStopAll: () => void;
  handleToggleSettings: () => void;
  handleToggleHistory: () => void;
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
  handleOpenLaunchModal,
  handleLaunch,
  handleLaunchSlot,
  handleStopAll,
  handleToggleSettings,
  handleToggleHistory,
  handleCloseCurrentTab,
  handleSelectTabByIndex,
}: UseAppKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const key = e.key.toLowerCase();
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K - Kill all sessions (works even when typing)
      if (isMod && key === 'k' && hasActiveSessions) {
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
        handleToggleHistory();
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
      if (key === 'n' && e.shiftKey && activeProjectPath) {
        e.preventDefault();
        handleOpenLaunchModal();
        return;
      }

      // Below shortcuts should not fire with Shift held
      if (e.shiftKey) {
        return;
      }

      // N - Add new session slot (max 12)
      const canAddMore = terminalSessionCount + preLaunchSlots.length < 12;
      if (key === 'n' && canAddMore && activeProjectPath) {
        e.preventDefault();
        handleAddSession();
        return;
      }

      // L - Launch all pre-launch slots
      if (key === 'l' && canLaunch && !isLaunching) {
        e.preventDefault();
        handleLaunch();
        return;
      }

      // Launch individual slot by assigned shortcut key
      if (PRELAUNCH_SHORTCUT_KEYS.includes(key)) {
        const slot = preLaunchSlots.find(candidate => candidate.shortcutKey === key);
        if (slot && !launchingSlotIds?.has(slot.id)) {
          e.preventDefault();
          handleLaunchSlot(slot.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canLaunch,
    isLaunching,
    hasActiveSessions,
    terminalSessionCount,
    preLaunchSlots,
    launchingSlotIds,
    activeProjectPath,
    handleAddSession,
    handleOpenLaunchModal,
    handleLaunch,
    handleLaunchSlot,
    handleStopAll,
    handleToggleSettings,
    handleToggleHistory,
    handleCloseCurrentTab,
    handleSelectTabByIndex,
  ]);
}
