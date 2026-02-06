import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isWindows, isMacOS } from '@/lib/os-detection';
import type { TerminalThemeName } from '@/lib/terminal-themes';

export type CursorStyle = 'block' | 'underline' | 'bar';

interface TerminalSettings {
  fontSize: number;
  fontFamily: string[];
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  terminalThemeName: TerminalThemeName;
}

interface TerminalSettingsActions {
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
}

type TerminalSettingsStore = TerminalSettings & TerminalSettingsActions;

function getDefaultSettings(): TerminalSettings {
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

export const useTerminalSettingsStore = create<TerminalSettingsStore>()(
  persist(
    set => ({
      ...defaults,

      setFontSize: size => set({ fontSize: Math.max(8, Math.min(24, size)) }),
      setFontFamily: family => set({ fontFamily: family }),
      setFontWeight: weight => set({ fontWeight: weight }),
      setLineHeight: height => set({ lineHeight: height }),
      setLetterSpacing: spacing => set({ letterSpacing: spacing }),
      setCursorStyle: style => set({ cursorStyle: style }),
      setCursorBlink: blink => set({ cursorBlink: blink }),
      setScrollback: lines => set({ scrollback: Math.max(1000, Math.min(100000, lines)) }),
      setTerminalThemeName: name => set({ terminalThemeName: name }),
      resetToDefaults: () => set(getDefaultSettings()),
    }),
    {
      name: 'omniscribe-terminal-settings',
      version: 1,
    }
  )
);
