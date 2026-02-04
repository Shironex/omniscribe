import { ipcMain } from 'electron';
import Store from 'electron-store';

const store = new Store();

/**
 * Register electron-store IPC handlers
 */
export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    store.delete(key);
  });

  ipcMain.handle('store:clear', () => {
    store.clear();
  });
}

/**
 * Clean up electron-store IPC handlers
 */
export function cleanupStoreHandlers(): void {
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
  ipcMain.removeHandler('store:clear');
}
