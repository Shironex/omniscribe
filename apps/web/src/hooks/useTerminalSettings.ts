import { useTerminalSettingsStore } from '@/stores/useTerminalSettingsStore';
import type { CursorStyle } from '@/stores/useTerminalSettingsStore';
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
  const fontSize = useTerminalSettingsStore(s => s.fontSize);
  const fontFamily = useTerminalSettingsStore(s => s.fontFamily);
  const fontWeight = useTerminalSettingsStore(s => s.fontWeight);
  const lineHeight = useTerminalSettingsStore(s => s.lineHeight);
  const letterSpacing = useTerminalSettingsStore(s => s.letterSpacing);
  const cursorStyle = useTerminalSettingsStore(s => s.cursorStyle);
  const cursorBlink = useTerminalSettingsStore(s => s.cursorBlink);
  const scrollback = useTerminalSettingsStore(s => s.scrollback);
  const terminalThemeName = useTerminalSettingsStore(s => s.terminalThemeName);

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
