import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { isWindows, isMacOS } from '@/lib/os-detection';
import type { TerminalThemeName } from '@/lib/terminal-themes';

export type CursorStyle = 'block' | 'underline' | 'bar';

interface TerminalState {
  // Settings
  fontSize: number;
  fontFamily: string[];
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  terminalThemeName: TerminalThemeName;
  // Control
  focusedSessionId: string | null;
  addSlotRequestCounter: number;
  sessionOrder: string[];
}

interface TerminalActions {
  // Settings actions
  setFontSize: (size: number) => void;
  setFontFamily: (family: string[]) => void;
  setFontWeight: (weight: number) => void;
  setLineHeight: (height: number) => void;
  setLetterSpacing: (spacing: number) => void;
  setCursorStyle: (style: CursorStyle) => void;
  setCursorBlink: (blink: boolean) => void;
  setScrollback: (lines: number) => void;
  setTerminalThemeName: (name: TerminalThemeName) => void;
  resetToDefaults: () => void;
  // Control actions
  setFocusedSessionId: (sessionId: string | null) => void;
  requestAddSlot: () => void;
  setSessionOrder: (order: string[]) => void;
  reorderSessions: (activeId: string, overId: string) => void;
}

type TerminalStore = TerminalState & TerminalActions;

function getDefaultSettings(): Omit<
  TerminalState,
  'focusedSessionId' | 'addSlotRequestCounter' | 'sessionOrder'
> {
  if (isWindows()) {
    return {
      fontSize: 14,
      fontFamily: ['Cascadia Code', 'Consolas', 'Courier New', 'monospace'],
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 10000,
      terminalThemeName: 'tokyonight',
    };
  }
  if (isMacOS()) {
    return {
      fontSize: 13,
      fontFamily: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 10000,
      terminalThemeName: 'tokyonight',
    };
  }
  // Linux
  return {
    fontSize: 13,
    fontFamily: ['Ubuntu Mono', 'DejaVu Sans Mono', 'monospace'],
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
    cursorStyle: 'block',
    cursorBlink: true,
    scrollback: 10000,
    terminalThemeName: 'tokyonight',
  };
}

const defaults = getDefaultSettings();

// Clean up old localStorage key from the previous useTerminalSettingsStore
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('omniscribe-terminal-settings');
  } catch {
    // Ignore errors in environments without localStorage
  }
}

export const useTerminalStore = create<TerminalStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Settings state (from defaults)
        ...defaults,

        // Control state
        focusedSessionId: null,
        addSlotRequestCounter: 0,
        sessionOrder: [],

        // Settings actions
        setFontSize: size =>
          set({ fontSize: Math.max(8, Math.min(24, size)) }, undefined, 'terminal/setFontSize'),
        setFontFamily: family => set({ fontFamily: family }, undefined, 'terminal/setFontFamily'),
        setFontWeight: weight => set({ fontWeight: weight }, undefined, 'terminal/setFontWeight'),
        setLineHeight: height => set({ lineHeight: height }, undefined, 'terminal/setLineHeight'),
        setLetterSpacing: spacing =>
          set({ letterSpacing: spacing }, undefined, 'terminal/setLetterSpacing'),
        setCursorStyle: style => set({ cursorStyle: style }, undefined, 'terminal/setCursorStyle'),
        setCursorBlink: blink => set({ cursorBlink: blink }, undefined, 'terminal/setCursorBlink'),
        setScrollback: lines =>
          set(
            { scrollback: Math.max(1000, Math.min(100000, lines)) },
            undefined,
            'terminal/setScrollback'
          ),
        setTerminalThemeName: name =>
          set({ terminalThemeName: name }, undefined, 'terminal/setTerminalThemeName'),
        resetToDefaults: () => set(getDefaultSettings(), undefined, 'terminal/resetToDefaults'),

        // Control actions
        setFocusedSessionId: sessionId =>
          set({ focusedSessionId: sessionId }, undefined, 'terminal/setFocusedSessionId'),
        requestAddSlot: () =>
          set(
            state => ({ addSlotRequestCounter: state.addSlotRequestCounter + 1 }),
            undefined,
            'terminal/requestAddSlot'
          ),
        setSessionOrder: order =>
          set({ sessionOrder: order }, undefined, 'terminal/setSessionOrder'),
        reorderSessions: (activeId, overId) => {
          const { sessionOrder } = get();
          const oldIndex = sessionOrder.indexOf(activeId);
          const newIndex = sessionOrder.indexOf(overId);
          if (oldIndex === -1 || newIndex === -1) return;

          const newOrder = [...sessionOrder];
          const [removed] = newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, removed);
          set({ sessionOrder: newOrder }, undefined, 'terminal/reorderSessions');
        },
      }),
      {
        name: 'omniscribe-terminal',
        version: 1,
        partialize: state => ({
          fontSize: state.fontSize,
          fontFamily: state.fontFamily,
          fontWeight: state.fontWeight,
          lineHeight: state.lineHeight,
          letterSpacing: state.letterSpacing,
          cursorStyle: state.cursorStyle,
          cursorBlink: state.cursorBlink,
          scrollback: state.scrollback,
          terminalThemeName: state.terminalThemeName,
        }),
      }
    ),
    { name: 'terminal' }
  )
);
