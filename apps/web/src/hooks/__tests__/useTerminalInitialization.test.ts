import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// --- Mocks ---

// Capture the handler passed to WebLinksAddon
let capturedWebLinksHandler: ((event: MouseEvent, uri: string) => void) | undefined;

const mockTerminal = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  registerLinkProvider: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => mockTerminal),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({})),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn((handler?: (event: MouseEvent, uri: string) => void) => {
    capturedWebLinksHandler = handler;
    return {};
  }),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(() => ({})),
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn(() => ({
    onContextLoss: vi.fn(),
  })),
}));

vi.mock('@/lib/terminal', () => ({
  writeToTerminal: vi.fn(),
  resizeTerminal: vi.fn(),
}));

vi.mock('@/lib/terminal-themes', () => ({
  getTerminalTheme: vi.fn(() => ({})),
}));

vi.mock('@/lib/terminal-link-provider', () => ({
  FilePathLinkProvider: vi.fn(),
}));

vi.mock('../useTerminalResize', () => ({
  safeFit: vi.fn(() => ({ cols: 80, rows: 24 })),
}));

// Mock ResizeObserver
vi.stubGlobal(
  'ResizeObserver',
  vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
);

// Mock requestAnimationFrame to run callbacks synchronously
vi.stubGlobal(
  'requestAnimationFrame',
  vi.fn((cb: () => void) => {
    cb();
    return 1;
  })
);

import { useTerminalInitialization } from '../useTerminalInitialization';
import { WebLinksAddon } from '@xterm/addon-web-links';

// --- Helpers ---

function createRefs() {
  const container = document.createElement('div');
  Object.defineProperty(container, 'offsetWidth', { value: 800 });
  Object.defineProperty(container, 'offsetHeight', { value: 600 });

  return {
    terminalRef: { current: container },
    xtermRef: { current: null },
    fitAddonRef: { current: null },
    searchAddonRef: { current: null },
    resizeObserverRef: { current: null },
    connectionRef: { current: null },
    isDisposedRef: { current: false },
    isReadyRef: { current: false },
    resizeDebounceRef: { current: null },
  };
}

const defaultSettings = {
  fontSize: 14,
  fontFamily: ['monospace'],
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  cursorBlink: true,
  cursorStyle: 'block' as const,
  scrollback: 1000,
  terminalThemeName: 'default',
};

// --- Tests ---

describe('useTerminalInitialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWebLinksHandler = undefined;
  });

  describe('WebLinksAddon custom handler', () => {
    it('should pass a custom handler to WebLinksAddon', () => {
      const refs = createRefs();

      renderHook(() =>
        useTerminalInitialization(1, defaultSettings, refs, vi.fn(), vi.fn(), vi.fn())
      );

      expect(WebLinksAddon).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should call window.open with the URL and _blank target when handler is invoked', () => {
      const refs = createRefs();
      const mockWindowOpen = vi.fn();
      vi.stubGlobal('open', mockWindowOpen);

      renderHook(() =>
        useTerminalInitialization(1, defaultSettings, refs, vi.fn(), vi.fn(), vi.fn())
      );

      expect(capturedWebLinksHandler).toBeDefined();

      // Simulate clicking a link in the terminal
      capturedWebLinksHandler!(new MouseEvent('click'), 'https://github.com/owner/repo');

      expect(mockWindowOpen).toHaveBeenCalledWith('https://github.com/owner/repo', '_blank');
    });

    it('should handle non-http URLs through the handler', () => {
      const refs = createRefs();
      const mockWindowOpen = vi.fn();
      vi.stubGlobal('open', mockWindowOpen);

      renderHook(() =>
        useTerminalInitialization(1, defaultSettings, refs, vi.fn(), vi.fn(), vi.fn())
      );

      capturedWebLinksHandler!(new MouseEvent('click'), 'https://example.com/path?q=1');

      expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/path?q=1', '_blank');
    });
  });
});
