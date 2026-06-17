// ---- Mocks ----

// handleCallbacks: request/response via ipcMain.handle (invoke/handle pattern)
const handleCallbacks: Record<string, (...args: unknown[]) => unknown> = {};
// onListeners: fire-and-forget via ipcMain.on (send/on pattern)
const onListeners: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handleCallbacks[channel] = handler as (...args: unknown[]) => unknown;
    }),
    on: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      onListeners[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

// `../window` pulls in the full main-process bootstrap chain; mock it down to
// just the shared opaque-background constant the effect handler restores.
const WINDOW_BACKGROUND_COLOR = '#0a0a0f';
jest.mock('../window', () => ({ WINDOW_BACKGROUND_COLOR: '#0a0a0f' }));

/** Override the read-only `process.platform` for a single test. */
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

// ---- Tests ----

import { ipcMain } from 'electron';
import { registerWindowHandlers, cleanupWindowHandlers } from './window';

describe('IPC:Window', () => {
  const mockWebContentsSend = jest.fn();
  const windowEventHandlers: Record<string, (...args: unknown[]) => void> = {};

  const mockMainWindow = {
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    close: jest.fn(),
    isMaximized: jest.fn(),
    setVibrancy: jest.fn(),
    setBackgroundColor: jest.fn(),
    setBackgroundMaterial: jest.fn(),
    on: jest.fn((event: string, handler: (...a: unknown[]) => unknown) => {
      windowEventHandlers[event] = handler;
    }),
    webContents: {
      send: mockWebContentsSend,
    },
  } as unknown as Electron.BrowserWindow;

  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handleCallbacks)) delete handleCallbacks[key];
    for (const key of Object.keys(onListeners)) delete onListeners[key];
    for (const key of Object.keys(windowEventHandlers)) delete windowEventHandlers[key];
    registerWindowHandlers(mockMainWindow);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerWindowHandlers', () => {
    it('should register ipcMain.on handlers for minimize, maximize, close', () => {
      expect(ipcMain.on).toHaveBeenCalledWith('window:minimize', expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith('window:maximize', expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith('window:close', expect.any(Function));
    });

    it('should register ipcMain.handle for is-maximized', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('window:is-maximized', expect.any(Function));
    });

    it('should register ipcMain.handle for background-effect handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'window:set-background-effect',
        expect.any(Function)
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'window:get-background-effect-support',
        expect.any(Function)
      );
    });

    it('should register mainWindow event listeners for maximize/unmaximize', () => {
      expect(mockMainWindow.on).toHaveBeenCalledWith('maximize', expect.any(Function));
      expect(mockMainWindow.on).toHaveBeenCalledWith('unmaximize', expect.any(Function));
    });
  });

  // ================================================================
  // window:minimize
  // ================================================================
  describe('window:minimize', () => {
    it('should minimize the window', () => {
      onListeners['window:minimize']();
      expect(mockMainWindow.minimize).toHaveBeenCalled();
    });
  });

  // ================================================================
  // window:maximize
  // ================================================================
  describe('window:maximize', () => {
    it('should unmaximize when window is maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(true);
      onListeners['window:maximize']();
      expect(mockMainWindow.unmaximize).toHaveBeenCalled();
      expect(mockMainWindow.maximize).not.toHaveBeenCalled();
    });

    it('should maximize when window is not maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(false);
      onListeners['window:maximize']();
      expect(mockMainWindow.maximize).toHaveBeenCalled();
      expect(mockMainWindow.unmaximize).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // window:close
  // ================================================================
  describe('window:close', () => {
    it('should close the window', () => {
      onListeners['window:close']();
      expect(mockMainWindow.close).toHaveBeenCalled();
    });
  });

  // ================================================================
  // window:is-maximized
  // ================================================================
  describe('window:is-maximized', () => {
    it('should return true when window is maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(true);
      const result = handleCallbacks['window:is-maximized']();
      expect(result).toBe(true);
    });

    it('should return false when window is not maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(false);
      const result = handleCallbacks['window:is-maximized']();
      expect(result).toBe(false);
    });
  });

  // ================================================================
  // Window state change forwarding
  // ================================================================
  describe('window state change forwarding', () => {
    it('should forward maximize event to renderer with true', () => {
      windowEventHandlers['maximize']();
      expect(mockWebContentsSend).toHaveBeenCalledWith('window:maximized-change', true);
    });

    it('should forward unmaximize event to renderer with false', () => {
      windowEventHandlers['unmaximize']();
      expect(mockWebContentsSend).toHaveBeenCalledWith('window:maximized-change', false);
    });
  });

  // ================================================================
  // window:set-background-effect
  // ================================================================
  describe('window:set-background-effect', () => {
    const invoke = (effect: unknown) =>
      handleCallbacks['window:set-background-effect'](undefined, effect);

    it('rejects invalid effect values without throwing', () => {
      setPlatform('darwin');
      expect(invoke('bogus')).toEqual({ ok: false, reason: 'unsupported' });
      expect(invoke(undefined)).toEqual({ ok: false, reason: 'unsupported' });
      expect(mockMainWindow.setVibrancy).not.toHaveBeenCalled();
    });

    describe('macOS (darwin)', () => {
      beforeEach(() => setPlatform('darwin'));

      it('applies under-window vibrancy and a transparent background', () => {
        const result = invoke('vibrancy');
        expect(result).toEqual({ ok: true });
        expect(mockMainWindow.setVibrancy).toHaveBeenCalledWith('under-window');
        expect(mockMainWindow.setBackgroundColor).toHaveBeenCalledWith('#00000000');
      });

      it('clears vibrancy and restores the opaque background on none', () => {
        const result = invoke('none');
        expect(result).toEqual({ ok: true });
        expect(mockMainWindow.setVibrancy).toHaveBeenCalledWith(null);
        expect(mockMainWindow.setBackgroundColor).toHaveBeenCalledWith(WINDOW_BACKGROUND_COLOR);
      });

      it('rejects acrylic as unsupported on macOS', () => {
        expect(invoke('acrylic')).toEqual({ ok: false, reason: 'unsupported' });
        expect(mockMainWindow.setBackgroundMaterial).not.toHaveBeenCalled();
      });

      it('does not throw when the native call throws', () => {
        (mockMainWindow.setVibrancy as jest.Mock).mockImplementationOnce(() => {
          throw new Error('legacy macOS');
        });
        expect(invoke('vibrancy')).toEqual({ ok: false, reason: 'unsupported' });
      });
    });

    describe('Windows (win32)', () => {
      beforeEach(() => setPlatform('win32'));

      it('applies the acrylic material', () => {
        const result = invoke('acrylic');
        expect(result).toEqual({ ok: true });
        expect(mockMainWindow.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
      });

      it('clears the material on none', () => {
        const result = invoke('none');
        expect(result).toEqual({ ok: true });
        expect(mockMainWindow.setBackgroundMaterial).toHaveBeenCalledWith('none');
      });

      it('rejects vibrancy as unsupported on Windows', () => {
        expect(invoke('vibrancy')).toEqual({ ok: false, reason: 'unsupported' });
        expect(mockMainWindow.setVibrancy).not.toHaveBeenCalled();
      });
    });

    describe('Linux', () => {
      beforeEach(() => setPlatform('linux'));

      it('treats none as a successful no-op', () => {
        expect(invoke('none')).toEqual({ ok: true });
        expect(mockMainWindow.setVibrancy).not.toHaveBeenCalled();
        expect(mockMainWindow.setBackgroundMaterial).not.toHaveBeenCalled();
      });

      it('rejects vibrancy and acrylic as unsupported', () => {
        expect(invoke('vibrancy')).toEqual({ ok: false, reason: 'unsupported' });
        expect(invoke('acrylic')).toEqual({ ok: false, reason: 'unsupported' });
      });
    });
  });

  // ================================================================
  // window:get-background-effect-support
  // ================================================================
  describe('window:get-background-effect-support', () => {
    const invoke = () => handleCallbacks['window:get-background-effect-support']();

    it('reports vibrancy on macOS', () => {
      setPlatform('darwin');
      expect(invoke()).toEqual({ vibrancy: true, acrylic: false });
    });

    it('reports acrylic on Windows', () => {
      setPlatform('win32');
      expect(invoke()).toEqual({ vibrancy: false, acrylic: true });
    });

    it('reports neither on Linux', () => {
      setPlatform('linux');
      expect(invoke()).toEqual({ vibrancy: false, acrylic: false });
    });
  });

  // ================================================================
  // cleanupWindowHandlers
  // ================================================================
  describe('cleanupWindowHandlers', () => {
    it('should remove all listeners and handlers', () => {
      cleanupWindowHandlers();

      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('window:minimize');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('window:maximize');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('window:close');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('window:is-maximized');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('window:set-background-effect');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('window:get-background-effect-support');
    });
  });
});
