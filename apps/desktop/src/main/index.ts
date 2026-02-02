import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';

export let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  mainWindow = await createMainWindow();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    bootstrap();
  }
});

app.on('before-quit', () => {
  mainWindow = null;
});
