import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TerminalSection } from './TerminalSection';

/**
 * Fixed terminal-store snapshot. `useTerminalStore` is selector-based, so the
 * mock applies the selector to a static state object.
 */
const terminalState = {
  fontSize: 14,
  lineHeight: 1.2,
  cursorStyle: 'block' as const,
  cursorBlink: true,
  scrollback: 10000,
  terminalThemeName: 'midnight' as const,
  setFontSize: vi.fn(),
  setCursorStyle: vi.fn(),
  setCursorBlink: vi.fn(),
  setScrollback: vi.fn(),
  setLineHeight: vi.fn(),
  setTerminalThemeName: vi.fn(),
  resetToDefaults: vi.fn(),
};

vi.mock('@/stores/useTerminalStore', () => ({
  useTerminalStore: (selector: (s: typeof terminalState) => unknown) => selector(terminalState),
}));

// The live preview pulls from the terminal store internals — render a stub so
// the responsive structure under test stays the focus.
vi.mock('@/components/settings/previews/TerminalPreview', () => ({
  TerminalPreview: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('TerminalSection responsive layout', () => {
  it('declares the settings container context on its root', () => {
    const { container } = render(<TerminalSection />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('@container/settings');
  });

  it('wraps the terminal-theme swatches via container queries, not a fixed 3-up grid', () => {
    const { getByRole } = render(<TerminalSection />);
    const radiogroup = getByRole('radiogroup', { name: 'Terminal theme' });
    const cls = radiogroup.className;
    // Two columns at the narrowest dock width, three only when there's room.
    expect(cls).toContain('grid-cols-2');
    expect(cls).toContain('@lg/settings:grid-cols-3');
    // Regression guard: a hard `grid-cols-3` crammed the swatches narrow.
    expect(cls).not.toMatch(/(^|\s)grid-cols-3(\s|$)/);
  });

  it('keeps every terminal theme option reachable as a radio', () => {
    const { getAllByRole } = render(<TerminalSection />);
    const radios = getAllByRole('radio');
    // 9 curated terminal themes — none dropped by the layout change.
    expect(radios.length).toBeGreaterThanOrEqual(9);
  });
});
