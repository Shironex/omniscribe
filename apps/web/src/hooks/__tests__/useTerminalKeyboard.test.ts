import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useTerminalKeyboard } from '../useTerminalKeyboard';
import * as terminalApi from '@/lib/terminal';

// Mock the terminal lib so we can assert no raw socket writes happen
vi.mock('@/lib/terminal', () => ({
  writeToTerminal: vi.fn(),
  writeToTerminalChunked: vi.fn(),
  resizeTerminal: vi.fn(),
}));

// Mock platform so tests are deterministic regardless of OS
vi.mock('@/lib/platform', () => ({
  IS_MAC: false,
}));

// Mock terminal-clipboard (used by copy path, not paste — silence import)
vi.mock('@/lib/terminal-clipboard', () => ({
  copyTerminalSelection: vi.fn(),
}));

describe('useTerminalKeyboard paste', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('line1\nline2\nline3') },
    });
    vi.clearAllMocks();
  });

  it('routes paste through terminal.paste() (bracketed) not raw socket write', async () => {
    const writeSpy = vi.spyOn(terminalApi, 'writeToTerminal');
    const writeChunkedSpy = vi.spyOn(terminalApi, 'writeToTerminalChunked');
    const paste = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const term: any = {
      attachCustomKeyEventHandler: (h: (e: KeyboardEvent) => boolean) => {
        term.__handler = h;
      },
      paste,
      hasSelection: () => false,
    };

    const sessionIdRef = { current: 1 };
    const setShowSearch = vi.fn();
    const { result } = renderHook(() =>
      useTerminalKeyboard(sessionIdRef as React.MutableRefObject<number>, setShowSearch)
    );
    result.current(term);

    // Simulate Ctrl+V
    const e = {
      key: 'v',
      type: 'keydown',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    term.__handler(e);

    // Allow the clipboard promise to resolve through the microtask queue
    await Promise.resolve();
    await Promise.resolve();

    expect(e.preventDefault).toHaveBeenCalled(); // #194 double-paste stays fixed
    expect(paste).toHaveBeenCalledWith('line1\nline2\nline3'); // full multi-line, bracketed by xterm
    expect(writeSpy).not.toHaveBeenCalled(); // no raw byte-stream paste
    expect(writeChunkedSpy).not.toHaveBeenCalled(); // chunking is now in onData, not here
  });
});
