import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppKeyboardShortcuts } from '../useAppKeyboardShortcuts';
import { useAppUIStore } from '@/stores/useAppUIStore';
import type { PreLaunchSlot } from '@/components/terminal/TerminalGrid';

function fireKey(
  key: string,
  options: Partial<KeyboardEvent> = {},
  target?: HTMLElement
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });

  if (target) {
    Object.defineProperty(event, 'target', { value: target, configurable: true });
  }

  window.dispatchEvent(event);
  return event;
}

type ShortcutParams = Parameters<typeof useAppKeyboardShortcuts>[0];

function createDefaultParams(overrides: Partial<ShortcutParams> = {}): ShortcutParams {
  return {
    canLaunch: false,
    isLaunching: false,
    hasActiveSessions: false,
    terminalSessionCount: 0,
    preLaunchSlots: [],
    launchingSlotIds: new Set<string>(),
    activeProjectPath: '/project',
    handleAddSession: vi.fn(),
    handleLaunch: vi.fn(),
    handleLaunchSlot: vi.fn(),
    handleStopAll: vi.fn(),
    handleToggleSettings: vi.fn(),
    handleCloseCurrentTab: vi.fn(),
    handleSelectTabByIndex: vi.fn(),
    ...overrides,
  };
}

describe('useAppKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('modifier shortcuts (work while typing)', () => {
    it('Ctrl+K calls handleStopAll when hasActiveSessions', () => {
      const params = createDefaultParams({ hasActiveSessions: true });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('k', { ctrlKey: true });
      expect(params.handleStopAll).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+K does not call handleStopAll when hasActiveSessions is false', () => {
      const params = createDefaultParams({ hasActiveSessions: false });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('k', { ctrlKey: true });
      expect(params.handleStopAll).not.toHaveBeenCalled();
    });

    it('Ctrl+, calls handleToggleSettings', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey(',', { ctrlKey: true });
      expect(params.handleToggleSettings).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+Shift+, does not call handleToggleSettings', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey(',', { ctrlKey: true, shiftKey: true });
      expect(params.handleToggleSettings).not.toHaveBeenCalled();
    });

    it('Ctrl+Shift+H calls toggleHistory on store', () => {
      const toggleSpy = vi.spyOn(useAppUIStore.getState(), 'toggleHistory');
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('h', { ctrlKey: true, shiftKey: true });
      expect(toggleSpy).toHaveBeenCalledTimes(1);
      toggleSpy.mockRestore();
    });

    it('Ctrl+W calls handleCloseCurrentTab', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('w', { ctrlKey: true });
      expect(params.handleCloseCurrentTab).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+1 calls handleSelectTabByIndex(0)', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('1', { ctrlKey: true });
      expect(params.handleSelectTabByIndex).toHaveBeenCalledWith(0);
    });

    it('Ctrl+9 calls handleSelectTabByIndex(8)', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('9', { ctrlKey: true });
      expect(params.handleSelectTabByIndex).toHaveBeenCalledWith(8);
    });

    it('modifier shortcuts call preventDefault', () => {
      const params = createDefaultParams({ hasActiveSessions: true });
      renderHook(() => useAppKeyboardShortcuts(params));

      const event = fireKey('k', { ctrlKey: true });
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('non-modifier shortcuts (blocked while typing)', () => {
    it('N adds session when conditions met', () => {
      const params = createDefaultParams({
        activeProjectPath: '/project',
        terminalSessionCount: 0,
        preLaunchSlots: [],
      });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n');
      expect(params.handleAddSession).toHaveBeenCalledTimes(1);
    });

    it('N does not fire when target is INPUT', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      const input = document.createElement('input');
      fireKey('n', {}, input);
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });

    it('N does not fire when target is TEXTAREA', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      const textarea = document.createElement('textarea');
      fireKey('n', {}, textarea);
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });

    it('N does not fire when target is contentEditable', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      const div = document.createElement('div');
      Object.defineProperty(div, 'isContentEditable', { value: true });
      fireKey('n', {}, div);
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });

    it('N does not fire when activeProjectPath is null', () => {
      const params = createDefaultParams({ activeProjectPath: null });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n');
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });

    it('N does not fire when at max capacity (12)', () => {
      const params = createDefaultParams({
        terminalSessionCount: 10,
        preLaunchSlots: [
          { id: '1', aiMode: 'claude', branch: 'main', shortcutKey: '1' },
          { id: '2', aiMode: 'claude', branch: 'main', shortcutKey: '2' },
        ] satisfies PreLaunchSlot[],
      });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n');
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });

    it('N does not fire with shift held (Shift+N is a different shortcut)', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n', { shiftKey: true });
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });

    it('Shift+N opens launch modal via store', () => {
      const openSpy = vi.spyOn(useAppUIStore.getState(), 'openLaunchModal');
      const params = createDefaultParams({ activeProjectPath: '/project' });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n', { shiftKey: true });
      expect(openSpy).toHaveBeenCalledTimes(1);
      openSpy.mockRestore();
    });

    it('Shift+N does not fire when activeProjectPath is null', () => {
      const openSpy = vi.spyOn(useAppUIStore.getState(), 'openLaunchModal');
      const params = createDefaultParams({ activeProjectPath: null });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n', { shiftKey: true });
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });

    it('L launches when canLaunch and not isLaunching', () => {
      const params = createDefaultParams({ canLaunch: true, isLaunching: false });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('l');
      expect(params.handleLaunch).toHaveBeenCalledTimes(1);
    });

    it('L does not fire when isLaunching is true', () => {
      const params = createDefaultParams({ canLaunch: true, isLaunching: true });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('l');
      expect(params.handleLaunch).not.toHaveBeenCalled();
    });

    it('L does not fire when canLaunch is false', () => {
      const params = createDefaultParams({ canLaunch: false });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('l');
      expect(params.handleLaunch).not.toHaveBeenCalled();
    });

    it('slot shortcut key fires handleLaunchSlot for matching slot', () => {
      const slots: PreLaunchSlot[] = [
        { id: 'slot-1', aiMode: 'claude', branch: 'main', shortcutKey: '1' },
        { id: 'slot-2', aiMode: 'plain', branch: 'dev', shortcutKey: '2' },
      ];
      const params = createDefaultParams({ preLaunchSlots: slots });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('1');
      expect(params.handleLaunchSlot).toHaveBeenCalledWith('slot-1');
    });

    it('slot shortcut does not fire when slot is in launchingSlotIds', () => {
      const slots: PreLaunchSlot[] = [
        { id: 'slot-1', aiMode: 'claude', branch: 'main', shortcutKey: '1' },
      ];
      const params = createDefaultParams({
        preLaunchSlots: slots,
        launchingSlotIds: new Set(['slot-1']),
      });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('1');
      expect(params.handleLaunchSlot).not.toHaveBeenCalled();
    });

    it('slot shortcut does not fire for unmatched key', () => {
      const slots: PreLaunchSlot[] = [
        { id: 'slot-1', aiMode: 'claude', branch: 'main', shortcutKey: '1' },
      ];
      const params = createDefaultParams({ preLaunchSlots: slots });
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('5');
      expect(params.handleLaunchSlot).not.toHaveBeenCalled();
    });
  });

  describe('non-modifier shortcuts blocked with alt key', () => {
    it('Alt+N does not add session', () => {
      const params = createDefaultParams();
      renderHook(() => useAppKeyboardShortcuts(params));

      fireKey('n', { altKey: true });
      expect(params.handleAddSession).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes keydown listener on unmount', () => {
      const params = createDefaultParams({ hasActiveSessions: true });
      const { unmount } = renderHook(() => useAppKeyboardShortcuts(params));

      unmount();

      fireKey('k', { ctrlKey: true });
      expect(params.handleStopAll).not.toHaveBeenCalled();
    });
  });
});
