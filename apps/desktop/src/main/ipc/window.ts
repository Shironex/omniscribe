import { BrowserWindow, ipcMain } from 'electron';

/**
 * Register window control IPC handlers
 */
export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized();
  });

  // Forward window state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });
}

/**
 * Clean up window control IPC handlers
 */
export function cleanupWindowHandlers(): void {
  ipcMain.removeAllListeners('window:minimize');
  ipcMain.removeAllListeners('window:maximize');
  ipcMain.removeAllListeners('window:close');
  ipcMain.removeHandler('window:is-maximized');

  // Note: Window event listeners are cleaned up when window is destroyed
}
