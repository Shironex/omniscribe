import { BrowserWindow, ipcMain, dialog } from 'electron';
import type { MessageDialogOptions } from './types';

/**
 * Register dialog IPC handlers
 */
export function registerDialogHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('dialog:open-directory', async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      ...options,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      ...options,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    'dialog:message',
    async (_event, options: MessageDialogOptions) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: options.type ?? 'info',
        title: options.title ?? 'Omniscribe',
        message: options.message,
        detail: options.detail,
        buttons: options.buttons ?? ['OK'],
      });
      return result.response;
    }
  );
}

/**
 * Clean up dialog IPC handlers
 */
export function cleanupDialogHandlers(): void {
  ipcMain.removeHandler('dialog:open-directory');
  ipcMain.removeHandler('dialog:open-file');
  ipcMain.removeHandler('dialog:message');
}
