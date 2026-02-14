import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import type { UseTerminalSettingsReturn } from './useTerminalSettings';

/**
 * Create a configured xterm.js Terminal instance from settings and theme.
 * Pure factory function — no React hooks or side effects.
 */
export function createTerminalInstance(
  settings: UseTerminalSettingsReturn,
  theme: ITheme
): Terminal {
  return new Terminal({
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily.join(', '),
    fontWeight: settings.fontWeight,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    cursorBlink: settings.cursorBlink,
    cursorStyle: settings.cursorStyle,
    scrollback: settings.scrollback,
    theme,
    allowProposedApi: true,
  });
}
