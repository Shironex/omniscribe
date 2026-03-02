import { useShallow } from 'zustand/react/shallow';
import { useTerminalStore } from '@/stores/useTerminalStore';
import type { CursorStyle } from '@/stores/useTerminalStore';
import type { TerminalThemeName } from '@/lib/terminal-themes';

export interface UseTerminalSettingsReturn {
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

/**
 * Hook that selects all terminal settings from the settings store.
 * Uses a single useShallow subscription instead of individual selectors.
 */
export function useTerminalSettings(): UseTerminalSettingsReturn {
  return useTerminalStore(
    useShallow(s => ({
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      cursorStyle: s.cursorStyle,
      cursorBlink: s.cursorBlink,
      scrollback: s.scrollback,
      terminalThemeName: s.terminalThemeName,
    }))
  );
}
