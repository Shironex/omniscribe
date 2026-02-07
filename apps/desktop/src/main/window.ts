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

const ALLOWED_EXTERNAL_PROTOCOLS = ['http:', 'https:'];

function isExternalUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const isDev = process.env.NODE_ENV === 'development';

  // Set up Content Security Policy before creating the window
  setupContentSecurityPolicy(isDev);

  // Deny all permission requests (camera, mic, geolocation, etc.)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    logger.warn(`[security] Denied permission request: ${permission}`);
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    logger.debug(`[security] Denied permission check: ${permission}`);
    return false;
  });

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    icon: path.join(
      __dirname,
      `../../resources/icon.${process.platform === 'win32' ? 'ico' : 'png'}`
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Register all IPC handlers
  registerIpcHandlers(mainWindow);

  // Block all new window creation, open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrlAllowed(url)) {
      logger.info(`[security] Blocked new window creation, opening in browser: ${url}`);
      shell.openExternal(url);
    } else {
      logger.warn(`[security] Blocked opening URL with disallowed protocol: ${url}`);
    }
    return { action: 'deny' };
  });

  // Safety net: if a window is somehow created, log it
  mainWindow.webContents.on('did-create-window', window => {
    logger.warn('[security] Unexpected window created -- closing immediately');
    window.close();
  });

  // Block external URL navigation in renderer, open in system browser instead
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = isDev ? [`http://localhost:${VITE_DEV_PORT}`] : ['file://'];
    const isAllowed = allowedOrigins.some(origin => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
      if (isExternalUrlAllowed(url)) {
        logger.info(`[security] Blocked navigation to external URL, opening in browser: ${url}`);
        shell.openExternal(url);
      } else {
        logger.warn(`[security] Blocked navigation to URL with disallowed protocol: ${url}`);
      }
    }
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
