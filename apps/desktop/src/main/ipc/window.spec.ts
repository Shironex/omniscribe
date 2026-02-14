// ---- Mocks ----

const handlers: Record<string, (...args: unknown[]) => unknown> = {};
const listeners: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers[channel] = handler as (...args: unknown[]) => unknown;
    }),
    on: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      listeners[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

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
    on: jest.fn((event: string, handler: (...a: unknown[]) => unknown) => {
      windowEventHandlers[event] = handler;
    }),
    webContents: {
      send: mockWebContentsSend,
    },
  } as unknown as Electron.BrowserWindow;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handlers)) delete handlers[key];
    for (const key of Object.keys(listeners)) delete listeners[key];
    for (const key of Object.keys(windowEventHandlers)) delete windowEventHandlers[key];
    registerWindowHandlers(mockMainWindow);
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
      listeners['window:minimize']();
      expect(mockMainWindow.minimize).toHaveBeenCalled();
    });
  });

  // ================================================================
  // window:maximize
  // ================================================================
  describe('window:maximize', () => {
    it('should unmaximize when window is maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(true);
      listeners['window:maximize']();
      expect(mockMainWindow.unmaximize).toHaveBeenCalled();
      expect(mockMainWindow.maximize).not.toHaveBeenCalled();
    });

    it('should maximize when window is not maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(false);
      listeners['window:maximize']();
      expect(mockMainWindow.maximize).toHaveBeenCalled();
      expect(mockMainWindow.unmaximize).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // window:close
  // ================================================================
  describe('window:close', () => {
    it('should close the window', () => {
      listeners['window:close']();
      expect(mockMainWindow.close).toHaveBeenCalled();
    });
  });

  // ================================================================
  // window:is-maximized
  // ================================================================
  describe('window:is-maximized', () => {
    it('should return true when window is maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(true);
      const result = handlers['window:is-maximized']();
      expect(result).toBe(true);
    });

    it('should return false when window is not maximized', () => {
      (mockMainWindow.isMaximized as jest.Mock).mockReturnValue(false);
      const result = handlers['window:is-maximized']();
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
  // cleanupWindowHandlers
  // ================================================================
  describe('cleanupWindowHandlers', () => {
    it('should remove all listeners and handlers', () => {
      cleanupWindowHandlers();

      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('window:minimize');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('window:maximize');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('window:close');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('window:is-maximized');
    });
  });
});
