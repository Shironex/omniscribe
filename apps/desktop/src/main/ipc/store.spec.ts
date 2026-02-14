// ---- Mocks ----

import { createLoggerMock } from '../../../test/mocks/logger.mock';

const mockLogger = createLoggerMock();

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
}));

const { createElectronStoreMock } = jest.requireActual('../../../test/mocks/electron-store.mock');
jest.mock('electron-store', () => createElectronStoreMock());

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
  },
}));

// ---- Tests ----

import { ipcMain } from 'electron';
import { registerStoreHandlers, cleanupStoreHandlers } from './store';

describe('IPC:Store', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear captured handlers
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    registerStoreHandlers();
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerStoreHandlers', () => {
    it('should register all 4 IPC handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('store:get', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('store:set', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('store:delete', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('store:clear', expect.any(Function));
    });
  });

  // ================================================================
  // store:get
  // ================================================================
  describe('store:get', () => {
    it('should return value for allowed key', () => {
      // First set a value, then get it
      handlers['store:set'](mockEvent, 'workspace.tabs', [{ id: '1' }]);
      const result = handlers['store:get'](mockEvent, 'workspace.tabs');
      expect(result).toEqual([{ id: '1' }]);
    });

    it('should return undefined for unauthorized key', () => {
      const result = handlers['store:get'](mockEvent, 'secretKey');
      expect(result).toBeUndefined();
    });

    it('should log warning for unauthorized key access', () => {
      handlers['store:get'](mockEvent, 'admin.password');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Blocked store:get for unauthorized key: admin.password'
      );
    });

    it('should allow nested key access via prefix matching', () => {
      handlers['store:set'](mockEvent, 'workspace.tabs', { '0': { name: 'test' } });
      // workspace.tabs.0.name starts with 'workspace.tabs.' so should be allowed
      const result = handlers['store:get'](mockEvent, 'workspace.tabs.0.name');
      // MockStore uses a flat Map and doesn't support dot-notation traversal
      // like the real electron-store, so the nested key returns undefined
      expect(result).toBeUndefined();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should allow all whitelisted keys', () => {
      const allowedKeys = [
        'workspace.tabs',
        'workspace.activeTabId',
        'workspace.preferences',
        'workspace.quickActions',
        'quick-actions',
        'window.bounds',
        'window.maximized',
        'preferences.theme',
        'preferences.fontSize',
        'preferences.fontFamily',
        'preferences.terminalFontSize',
        'preferences.autoSave',
        'preferences.updateChannel',
        'preferences.worktree',
        'preferences',
        'recentProjects',
        'mcp.enabledServers',
        'session.defaultModel',
        'session.defaultMode',
      ];

      for (const key of allowedKeys) {
        mockLogger.warn.mockClear();
        handlers['store:get'](mockEvent, key);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      }
    });
  });

  // ================================================================
  // store:set
  // ================================================================
  describe('store:set', () => {
    it('should set value for allowed key', () => {
      handlers['store:set'](mockEvent, 'preferences.theme', 'dark');
      const result = handlers['store:get'](mockEvent, 'preferences.theme');
      expect(result).toBe('dark');
    });

    it('should not set value for unauthorized key', () => {
      handlers['store:set'](mockEvent, 'system.internal', 'value');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Blocked store:set for unauthorized key: system.internal'
      );
    });

    it('should allow setting nested keys via prefix matching', () => {
      handlers['store:set'](mockEvent, 'preferences.theme.dark', true);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // store:delete
  // ================================================================
  describe('store:delete', () => {
    it('should delete allowed key', () => {
      handlers['store:set'](mockEvent, 'preferences.theme', 'dark');
      handlers['store:delete'](mockEvent, 'preferences.theme');
      const result = handlers['store:get'](mockEvent, 'preferences.theme');
      expect(result).toBeUndefined();
    });

    it('should not delete unauthorized key', () => {
      handlers['store:delete'](mockEvent, 'unauthorized.key');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Blocked store:delete for unauthorized key: unauthorized.key'
      );
    });
  });

  // ================================================================
  // store:clear
  // ================================================================
  describe('store:clear', () => {
    it('should be a no-op and log warning', () => {
      // Set some data first
      handlers['store:set'](mockEvent, 'preferences.theme', 'dark');

      // Clear should not actually clear anything
      handlers['store:clear'](mockEvent);

      expect(mockLogger.warn).toHaveBeenCalledWith('store:clear is disabled for security reasons');

      // Data should still be there
      const result = handlers['store:get'](mockEvent, 'preferences.theme');
      expect(result).toBe('dark');
    });
  });

  // ================================================================
  // cleanupStoreHandlers
  // ================================================================
  describe('cleanupStoreHandlers', () => {
    it('should remove all 4 handlers', () => {
      cleanupStoreHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('store:get');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('store:set');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('store:delete');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('store:clear');
    });
  });

  // ================================================================
  // Security: blocked key patterns
  // ================================================================
  describe('security: blocked keys', () => {
    const blockedKeys = [
      'secret',
      'admin.password',
      'system.internal',
      'random.key.here',
      '',
      'workspace', // Not in the set (only 'workspace.tabs' etc.)
    ];

    it.each(blockedKeys)('should block store:get for "%s"', key => {
      const result = handlers['store:get'](mockEvent, key);
      expect(result).toBeUndefined();
    });

    it.each(blockedKeys)('should block store:set for "%s"', key => {
      mockLogger.warn.mockClear();
      handlers['store:set'](mockEvent, key, 'value');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it.each(blockedKeys)('should block store:delete for "%s"', key => {
      mockLogger.warn.mockClear();
      handlers['store:delete'](mockEvent, key);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
