import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock platform detection before importing the store
vi.mock('@/lib/platform', () => ({
  IS_WINDOWS: false,
  IS_MAC: true,
  IS_LINUX: false,
}));

// Mock zustand/middleware to bypass persist (which needs localStorage.setItem,
// broken by vitest's clearMocks in jsdom). devtools is also replaced with a
// pass-through so the store initialiser runs without side-effects.
vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    // devtools: pass-through
    devtools: (fn: (...args: unknown[]) => unknown) => fn,
    // persist: pass-through (ignore config)
    persist: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

import { useTerminalStore } from '../useTerminalStore';
import type { CursorStyle } from '../useTerminalStore';

const initialState = {
  fontSize: 13,
  fontFamily: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  cursorStyle: 'block' as const,
  cursorBlink: true,
  scrollback: 10000,
  terminalThemeName: 'tokyonight' as const,
  focusedSessionId: null,
  addSlotRequestCounter: 0,
  sessionOrder: [],
  backpressured: {},
};

describe('useTerminalStore', () => {
  beforeEach(() => {
    useTerminalStore.setState(initialState);
  });

  describe('initial state', () => {
    it('has macOS default font size of 13', () => {
      expect(useTerminalStore.getState().fontSize).toBe(13);
    });

    it('has macOS default font family', () => {
      expect(useTerminalStore.getState().fontFamily).toEqual([
        'SF Mono',
        'Menlo',
        'Monaco',
        'monospace',
      ]);
    });

    it('has default font weight of 400', () => {
      expect(useTerminalStore.getState().fontWeight).toBe(400);
    });

    it('has default line height of 1.2', () => {
      expect(useTerminalStore.getState().lineHeight).toBe(1.2);
    });

    it('has default letter spacing of 0', () => {
      expect(useTerminalStore.getState().letterSpacing).toBe(0);
    });

    it('has default cursor style of block', () => {
      expect(useTerminalStore.getState().cursorStyle).toBe('block');
    });

    it('has cursor blink enabled by default', () => {
      expect(useTerminalStore.getState().cursorBlink).toBe(true);
    });

    it('has default scrollback of 10000', () => {
      expect(useTerminalStore.getState().scrollback).toBe(10000);
    });

    it('has default terminal theme of tokyonight', () => {
      expect(useTerminalStore.getState().terminalThemeName).toBe('tokyonight');
    });

    it('has null focused session id', () => {
      expect(useTerminalStore.getState().focusedSessionId).toBeNull();
    });

    it('has add slot request counter at 0', () => {
      expect(useTerminalStore.getState().addSlotRequestCounter).toBe(0);
    });

    it('has empty session order', () => {
      expect(useTerminalStore.getState().sessionOrder).toEqual([]);
    });
  });

  describe('setFontSize', () => {
    it('sets font size to a valid value', () => {
      useTerminalStore.getState().setFontSize(16);
      expect(useTerminalStore.getState().fontSize).toBe(16);
    });

    it('clamps font size to minimum of 8', () => {
      useTerminalStore.getState().setFontSize(4);
      expect(useTerminalStore.getState().fontSize).toBe(8);
    });

    it('clamps font size to maximum of 24', () => {
      useTerminalStore.getState().setFontSize(30);
      expect(useTerminalStore.getState().fontSize).toBe(24);
    });

    it('allows exact minimum value of 8', () => {
      useTerminalStore.getState().setFontSize(8);
      expect(useTerminalStore.getState().fontSize).toBe(8);
    });

    it('allows exact maximum value of 24', () => {
      useTerminalStore.getState().setFontSize(24);
      expect(useTerminalStore.getState().fontSize).toBe(24);
    });
  });

  describe('setScrollback', () => {
    it('sets scrollback to a valid value', () => {
      useTerminalStore.getState().setScrollback(5000);
      expect(useTerminalStore.getState().scrollback).toBe(5000);
    });

    it('clamps scrollback to minimum of 1000', () => {
      useTerminalStore.getState().setScrollback(500);
      expect(useTerminalStore.getState().scrollback).toBe(1000);
    });

    it('clamps scrollback to maximum of 100000', () => {
      useTerminalStore.getState().setScrollback(200000);
      expect(useTerminalStore.getState().scrollback).toBe(100000);
    });

    it('allows exact minimum value of 1000', () => {
      useTerminalStore.getState().setScrollback(1000);
      expect(useTerminalStore.getState().scrollback).toBe(1000);
    });

    it('allows exact maximum value of 100000', () => {
      useTerminalStore.getState().setScrollback(100000);
      expect(useTerminalStore.getState().scrollback).toBe(100000);
    });
  });

  describe('other setters', () => {
    it('sets font family', () => {
      const newFamily = ['Fira Code', 'monospace'];
      useTerminalStore.getState().setFontFamily(newFamily);
      expect(useTerminalStore.getState().fontFamily).toEqual(newFamily);
    });

    it('sets font weight', () => {
      useTerminalStore.getState().setFontWeight(700);
      expect(useTerminalStore.getState().fontWeight).toBe(700);
    });

    it('sets line height', () => {
      useTerminalStore.getState().setLineHeight(1.5);
      expect(useTerminalStore.getState().lineHeight).toBe(1.5);
    });

    it('sets letter spacing', () => {
      useTerminalStore.getState().setLetterSpacing(0.5);
      expect(useTerminalStore.getState().letterSpacing).toBe(0.5);
    });

    it('sets cursor style to underline', () => {
      useTerminalStore.getState().setCursorStyle('underline');
      expect(useTerminalStore.getState().cursorStyle).toBe('underline');
    });

    it('sets cursor style to bar', () => {
      useTerminalStore.getState().setCursorStyle('bar');
      expect(useTerminalStore.getState().cursorStyle).toBe('bar');
    });

    it('sets cursor blink to false', () => {
      useTerminalStore.getState().setCursorBlink(false);
      expect(useTerminalStore.getState().cursorBlink).toBe(false);
    });

    it('sets cursor blink to true', () => {
      useTerminalStore.getState().setCursorBlink(false);
      useTerminalStore.getState().setCursorBlink(true);
      expect(useTerminalStore.getState().cursorBlink).toBe(true);
    });

    it('sets terminal theme name', () => {
      useTerminalStore.getState().setTerminalThemeName('dracula' as CursorStyle);
      expect(useTerminalStore.getState().terminalThemeName).toBe('dracula');
    });
  });

  describe('resetToDefaults', () => {
    it('resets all settings to macOS defaults after modification', () => {
      // Modify all settings
      useTerminalStore.getState().setFontSize(20);
      useTerminalStore.getState().setFontFamily(['Courier New', 'monospace']);
      useTerminalStore.getState().setFontWeight(700);
      useTerminalStore.getState().setLineHeight(1.8);
      useTerminalStore.getState().setLetterSpacing(2);
      useTerminalStore.getState().setCursorStyle('underline');
      useTerminalStore.getState().setCursorBlink(false);
      useTerminalStore.getState().setScrollback(50000);
      useTerminalStore.getState().setTerminalThemeName('dracula' as CursorStyle);

      // Reset
      useTerminalStore.getState().resetToDefaults();

      const state = useTerminalStore.getState();
      expect(state.fontSize).toBe(13);
      expect(state.fontFamily).toEqual(['SF Mono', 'Menlo', 'Monaco', 'monospace']);
      expect(state.fontWeight).toBe(400);
      expect(state.lineHeight).toBe(1.2);
      expect(state.letterSpacing).toBe(0);
      expect(state.cursorStyle).toBe('block');
      expect(state.cursorBlink).toBe(true);
      expect(state.scrollback).toBe(10000);
      expect(state.terminalThemeName).toBe('tokyonight');
    });

    it('does not reset control state', () => {
      useTerminalStore.getState().setFocusedSessionId('session-1');
      useTerminalStore.getState().requestAddSlot();
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);

      useTerminalStore.getState().resetToDefaults();

      const state = useTerminalStore.getState();
      expect(state.focusedSessionId).toBe('session-1');
      expect(state.addSlotRequestCounter).toBe(1);
      expect(state.sessionOrder).toEqual(['a', 'b', 'c']);
    });
  });

  describe('control actions', () => {
    it('sets focused session id', () => {
      useTerminalStore.getState().setFocusedSessionId('session-123');
      expect(useTerminalStore.getState().focusedSessionId).toBe('session-123');
    });

    it('clears focused session id with null', () => {
      useTerminalStore.getState().setFocusedSessionId('session-123');
      useTerminalStore.getState().setFocusedSessionId(null);
      expect(useTerminalStore.getState().focusedSessionId).toBeNull();
    });

    it('increments add slot request counter', () => {
      expect(useTerminalStore.getState().addSlotRequestCounter).toBe(0);

      useTerminalStore.getState().requestAddSlot();
      expect(useTerminalStore.getState().addSlotRequestCounter).toBe(1);

      useTerminalStore.getState().requestAddSlot();
      expect(useTerminalStore.getState().addSlotRequestCounter).toBe(2);

      useTerminalStore.getState().requestAddSlot();
      expect(useTerminalStore.getState().addSlotRequestCounter).toBe(3);
    });

    it('sets session order', () => {
      const order = ['session-a', 'session-b', 'session-c'];
      useTerminalStore.getState().setSessionOrder(order);
      expect(useTerminalStore.getState().sessionOrder).toEqual(order);
    });

    it('replaces session order entirely', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);
      useTerminalStore.getState().setSessionOrder(['x', 'y']);
      expect(useTerminalStore.getState().sessionOrder).toEqual(['x', 'y']);
    });
  });

  describe('setBackpressure', () => {
    it('marks a terminal session as backpressured', () => {
      useTerminalStore.getState().setBackpressure(1, true);
      expect(useTerminalStore.getState().backpressured).toEqual({ 1: true });
    });

    it('removes backpressure when paused is false', () => {
      useTerminalStore.getState().setBackpressure(1, true);
      useTerminalStore.getState().setBackpressure(1, false);
      expect(useTerminalStore.getState().backpressured).toEqual({});
    });

    it('handles multiple backpressured sessions independently', () => {
      useTerminalStore.getState().setBackpressure(1, true);
      useTerminalStore.getState().setBackpressure(2, true);
      expect(useTerminalStore.getState().backpressured).toEqual({ 1: true, 2: true });

      useTerminalStore.getState().setBackpressure(1, false);
      expect(useTerminalStore.getState().backpressured).toEqual({ 2: true });
    });

    it('is a no-op when removing backpressure from a non-pressured terminal', () => {
      useTerminalStore.getState().setBackpressure(99, false);
      expect(useTerminalStore.getState().backpressured).toEqual({});
    });
  });

  describe('reorderSessions', () => {
    it('moves a session forward in the order', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c', 'd']);

      // Move 'a' to where 'c' is
      useTerminalStore.getState().reorderSessions('a', 'c');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves a session backward in the order', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c', 'd']);

      // Move 'c' to where 'a' is
      useTerminalStore.getState().reorderSessions('c', 'a');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['c', 'a', 'b', 'd']);
    });

    it('swaps adjacent sessions', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);

      // Move 'a' to where 'b' is
      useTerminalStore.getState().reorderSessions('a', 'b');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['b', 'a', 'c']);
    });

    it('is a no-op when activeId is not in the order', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);

      useTerminalStore.getState().reorderSessions('x', 'b');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['a', 'b', 'c']);
    });

    it('is a no-op when overId is not in the order', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);

      useTerminalStore.getState().reorderSessions('a', 'x');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['a', 'b', 'c']);
    });

    it('is a no-op when both ids are not in the order', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);

      useTerminalStore.getState().reorderSessions('x', 'y');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['a', 'b', 'c']);
    });

    it('handles reordering with same activeId and overId', () => {
      useTerminalStore.getState().setSessionOrder(['a', 'b', 'c']);

      // Moving 'b' to where 'b' is should result in no change
      useTerminalStore.getState().reorderSessions('b', 'b');

      expect(useTerminalStore.getState().sessionOrder).toEqual(['a', 'b', 'c']);
    });

    it('does not mutate the original array', () => {
      const original = ['a', 'b', 'c'];
      useTerminalStore.getState().setSessionOrder(original);

      useTerminalStore.getState().reorderSessions('a', 'c');

      // The original array reference in state should be a new array
      expect(useTerminalStore.getState().sessionOrder).not.toBe(original);
    });
  });
});
