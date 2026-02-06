import { BrowserWindow, shell, session } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { VITE_DEV_PORT } from '@omniscribe/shared';
import { logger } from './logger';

/**
 * Set Content Security Policy for the renderer process
 * This helps prevent XSS attacks and other injection vulnerabilities
 */
function setupContentSecurityPolicy(isDev: boolean): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Build CSP directives
    const cspDirectives = [
      // Only allow scripts from same origin (and Vite dev server in dev mode)
      isDev
        ? `script-src 'self' http://localhost:${VITE_DEV_PORT} 'unsafe-inline'`
        : "script-src 'self'",
      // Allow styles from same origin and inline (needed for CSS-in-JS)
      "style-src 'self' 'unsafe-inline'",
      // Allow images from same origin and data URIs
      "img-src 'self' data: blob:",
      // Allow fonts from same origin
      "font-src 'self' data:",
      // Allow connections to localhost (WebSocket and API)
      isDev
        ? `connect-src 'self' http://localhost:${VITE_DEV_PORT} ws://localhost:${VITE_DEV_PORT} http://localhost:3001 ws://localhost:3001 http://127.0.0.1:3001 ws://127.0.0.1:3001`
        : "connect-src 'self' http://localhost:3001 ws://localhost:3001 http://127.0.0.1:3001 ws://127.0.0.1:3001",
      // Restrict object/embed/frame sources
      "object-src 'none'",
      "frame-src 'none'",
      // Default to same-origin
      "default-src 'self'",
      // Allow forms to submit to same origin
      "form-action 'self'",
      // Restrict base URI
      "base-uri 'self'",
    ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')],
      },
    });
  });
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const isDev = process.env.NODE_ENV === 'development';

  // Set up Content Security Policy before creating the window
  setupContentSecurityPolicy(isDev);

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../../resources/icon.ico'),
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

  if (isDev) {
    logger.info('Running in development mode - loading from Vite dev server');
    mainWindow.webContents.openDevTools();

    // Load from Vite dev server
    mainWindow.loadURL(`http://localhost:${VITE_DEV_PORT}`).catch(err => {
      logger.error('Failed to load from Vite dev server:', err.message);
      logger.error('Make sure the web app is running: pnpm dev:web (in another terminal)');
    });
  } else {
    // Production: load from built files
    const indexPath = path.join(__dirname, '../renderer/index.html');
    logger.info('Running in production mode - loading from:', indexPath);

    mainWindow.loadFile(indexPath).catch(err => {
      logger.error('Failed to load renderer:', err);
    });

    // Log renderer errors
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error('Renderer failed to load:', errorCode, errorDescription);
    });
  }

  return mainWindow;
}
