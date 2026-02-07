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
 */
export function useTerminalSettings(): UseTerminalSettingsReturn {
  const fontSize = useTerminalStore(s => s.fontSize);
  const fontFamily = useTerminalStore(s => s.fontFamily);
  const fontWeight = useTerminalStore(s => s.fontWeight);
  const lineHeight = useTerminalStore(s => s.lineHeight);
  const letterSpacing = useTerminalStore(s => s.letterSpacing);
  const cursorStyle = useTerminalStore(s => s.cursorStyle);
  const cursorBlink = useTerminalStore(s => s.cursorBlink);
  const scrollback = useTerminalStore(s => s.scrollback);
  const terminalThemeName = useTerminalStore(s => s.terminalThemeName);

  return {
    fontSize,
    fontFamily,
    fontWeight,
    lineHeight,
    letterSpacing,
    cursorStyle,
    cursorBlink,
    scrollback,
    terminalThemeName,
  };
}
