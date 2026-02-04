import { BrowserWindow, shell } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { VITE_DEV_PORT } from '@omniscribe/shared';
import { logger } from './logger';

export async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Register all IPC handlers
  registerIpcHandlers(mainWindow);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    logger.info('Running in development mode - loading from Vite dev server');
    mainWindow.webContents.openDevTools();

    // Load from Vite dev server
    mainWindow.loadURL(`http://localhost:${VITE_DEV_PORT}`).catch((err) => {
      logger.error('Failed to load from Vite dev server:', err.message);
      logger.error('Make sure the web app is running: pnpm dev:web (in another terminal)');
    });
  } else {
    // Production: load from built files
    const indexPath = path.join(__dirname, '../renderer/index.html');
    logger.info('Running in production mode - loading from:', indexPath);

    mainWindow.loadFile(indexPath).catch((err) => {
      logger.error('Failed to load renderer:', err);
    });

    // Log renderer errors
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error('Renderer failed to load:', errorCode, errorDescription);
    });
  }

  return mainWindow;
}
