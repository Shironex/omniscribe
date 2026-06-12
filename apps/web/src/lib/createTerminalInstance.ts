import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import type { UseTerminalSettingsReturn } from '@/hooks/useTerminalSettings';
import { currentContrastRatio } from '@/lib/background/terminalContrast';

/**
 * Create a configured xterm.js Terminal instance from settings and theme.
 * Pure factory function — no React hooks. Reads the current appearance state
 * once to seed `minimumContrastRatio` (bumped when a translucent surface is
 * active so glyphs stay legible over the background-blend layer).
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
    minimumContrastRatio: currentContrastRatio(),
    theme,
    allowProposedApi: true,
  });
}
