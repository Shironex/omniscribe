import { describe, it, expect, beforeEach } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import {
  currentContrastRatio,
  registerTerminalForContrast,
} from '@/lib/background/terminalContrast';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { DEFAULT_APPEARANCE_BACKGROUND } from '@omniscribe/shared';

/** Minimal xterm-like stub exposing only the `options` surface we mutate. */
function fakeTerminal(): Terminal {
  return { options: { minimumContrastRatio: 1 } } as unknown as Terminal;
}

function setSurfaceActive(active: boolean) {
  useAppearanceStore.setState({
    background: active
      ? { kind: 'image', imageId: 'x', opacity: 0.5, blur: 0 }
      : { ...DEFAULT_APPEARANCE_BACKGROUND },
    windowEffect: 'none',
  });
}

describe('terminalContrast', () => {
  beforeEach(() => {
    setSurfaceActive(false);
  });

  it('currentContrastRatio is 1 when no surface is active', () => {
    expect(currentContrastRatio()).toBe(1);
  });

  it('currentContrastRatio is 4.5 when a background image is active', () => {
    setSurfaceActive(true);
    expect(currentContrastRatio()).toBe(4.5);
  });

  it('currentContrastRatio is 4.5 when a native window effect is active', () => {
    useAppearanceStore.setState({
      background: { ...DEFAULT_APPEARANCE_BACKGROUND },
      windowEffect: 'vibrancy',
    });
    expect(currentContrastRatio()).toBe(4.5);
  });

  it('seeds a registered terminal with the current ratio', () => {
    setSurfaceActive(true);
    const term = fakeTerminal();
    registerTerminalForContrast(term);
    expect(term.options.minimumContrastRatio).toBe(4.5);
  });

  it('updates live terminals retroactively when the surface toggles', () => {
    const term = fakeTerminal();
    registerTerminalForContrast(term);
    expect(term.options.minimumContrastRatio).toBe(1);

    setSurfaceActive(true);
    expect(term.options.minimumContrastRatio).toBe(4.5);

    setSurfaceActive(false);
    expect(term.options.minimumContrastRatio).toBe(1);
  });

  it('stops updating a terminal after it unregisters', () => {
    const term = fakeTerminal();
    const unregister = registerTerminalForContrast(term);

    unregister();
    setSurfaceActive(true);
    expect(term.options.minimumContrastRatio).toBe(1);
  });
});
