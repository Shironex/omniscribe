import { app, BrowserWindow } from 'electron';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import { CustomIoAdapter } from '../modules/shared/custom-io-adapter';
import { AppModule } from '../modules/app.module';
import { createMainWindow } from './window';
import { cleanupIpcHandlers } from './ipc-handlers';
import { logger, getLogPath, flushLogs } from './logger';
import { initializeAutoUpdater } from './updater';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { corsOriginCallback } from '../modules/shared/cors.config';
import { NestLoggerAdapter } from '../modules/shared/nest-logger';
import { LOCALHOST } from '@omniscribe/shared';
import { resolveShellPath } from './utils/shell-path';
import { setBackendPort } from './backend-port';

// Allow E2E tests to isolate userData by setting ELECTRON_USER_DATA_DIR.
// Must run before app.ready so electron-store and other userData consumers
// see the overridden path.
if (process.env.ELECTRON_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

export let mainWindow: BrowserWindow | null = null;
let nestApp: INestApplication | null = null;
let isShuttingDown = false;
let cleanupDone = false;

// Register custom protocol for deep linking (notification click-to-navigate)
if (process.defaultApp) {
  // Dev mode: register with the path to the electron binary
  app.setAsDefaultProtocolClient('omniscribe', process.execPath, [process.argv[1]]);
} else {
  app.setAsDefaultProtocolClient('omniscribe');
}

// Set AppUserModelId for Windows notification center integration
app.setAppUserModelId('com.omniscribe.desktop');

// Ensure single instance — second instances forward protocol URLs to the first
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

async function bootstrapNestApp(): Promise<void> {
  try {
    logger.info('Creating NestJS application...');
    nestApp = await NestFactory.create(AppModule, {
      logger: new NestLoggerAdapter(),
      bufferLogs: true,
    });
    nestApp.flushLogs();
    logger.info('NestJS application created');

    nestApp.useWebSocketAdapter(new CustomIoAdapter(nestApp));

    nestApp.enableCors({
      origin: corsOriginCallback,
      credentials: true,
    });

    logger.info('Starting to listen on dynamic port...');
    await nestApp.listen(0, LOCALHOST);
    const addr = nestApp.getHttpServer().address();
    if (!addr || typeof addr === 'string') {
      throw new Error(`Failed to get server port: address() returned ${JSON.stringify(addr)}`);
    }
    const port = addr.port;
    if (!port || port === 0) {
      throw new Error('OS assigned port 0 — server did not bind successfully');
    }
    setBackendPort(port);
    logger.info(`NestJS server running on port ${port}`);
    logger.info('Log file location:', getLogPath());
  } catch (error) {
    logger.error('Failed to bootstrap NestJS:', error);
    throw error;
  }
}

async function shutdownNestApp(): Promise<void> {
  if (nestApp) {
    logger.info('Shutting down NestJS...');
    await nestApp.close();
    nestApp = null;
    logger.info('NestJS shutdown complete');
  }
}

async function bootstrap(): Promise<void> {
  // Resolve the user's full shell PATH before any child processes are spawned.
  // macOS/Linux GUI apps inherit a minimal PATH that's missing dev tools.
  resolveShellPath();

  // Log security posture at startup
  const isPackaged = app.isPackaged;
  logger.info(`[security] App packaged: ${isPackaged}`);
  if (isPackaged) {
    logger.info(
      '[security] Electron fuses configured at build time (RunAsNode=off, NodeCLIInspect=off, NodeOptions=off)'
    );
  } else {
    logger.info('[security] Running in development mode -- fuses not applied (build-time only)');
  }

  await bootstrapNestApp();
  mainWindow = await createMainWindow();

  // Pass the NestJS EventEmitter2 to the updater for OS notification integration
  const emitter = nestApp?.get(EventEmitter2);
  initializeAutoUpdater(mainWindow, process.env.NODE_ENV === 'development', emitter);
}

// Global error handling
process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection:', reason);
});

// Handle SIGINT/SIGTERM (e.g. Ctrl+C in dev) by triggering graceful shutdown
// so that before-quit fires and onModuleDestroy can save the session snapshot.
// Guard against duplicate signals (concurrently sends SIGTERM after SIGINT).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (isShuttingDown) return;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    app.quit();
  });
}

/**
 * Parse an omniscribe:// protocol URL and forward navigation data to the renderer.
 * URL format: omniscribe://session/{sessionId}?tab={tabId}
 */
function handleProtocolUrl(url: string): void {
  logger.info(`Handling protocol URL: ${url}`);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'omniscribe:') return;

    if (parsed.hostname === 'session' || parsed.pathname.startsWith('//session/')) {
      const sessionId = parsed.pathname.replace(/^\/\/session\//, '').replace(/^\//, '');
      const tabId = parsed.searchParams.get('tab') ?? undefined;

      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send('notification:navigate', { sessionId, tabId });
      }
    }
  } catch (error) {
    logger.warn('Failed to parse protocol URL:', error);
  }
}

// Windows/Linux: second-instance event fires when another instance is launched
// (e.g., from a notification protocol click)
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  // On Windows, the protocol URL is in argv
  const protocolUrl = argv.find(arg => arg.startsWith('omniscribe://'));
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
  }
});

// macOS: open-url event fires for protocol URLs
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

app
  .whenReady()
  .then(bootstrap)
  .catch(error => {
    logger.error('Failed to bootstrap application:', error);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  logger.info('App activated');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    // NestJS is already running, clean up old IPC handlers and recreate the window
    cleanupIpcHandlers();
    mainWindow = await createMainWindow();
    const emitter = nestApp?.get(EventEmitter2);
    initializeAutoUpdater(mainWindow, process.env.NODE_ENV === 'development', emitter);
  }
});

app.on('before-quit', event => {
  mainWindow = null;

  // Cleanup finished, let the quit proceed
  if (cleanupDone) return;

  // Keep preventing quit until cleanup finishes (handles duplicate signals)
  event.preventDefault();

  // Already started cleanup, just keep preventing
  if (isShuttingDown) return;

  isShuttingDown = true;

  (async () => {
    try {
      await flushLogs();
    } catch (error) {
      logger.warn('Log flush failed during shutdown', error);
    }
    if (nestApp) {
      await shutdownNestApp();
    }
  })().finally(() => {
    cleanupDone = true;
    app.quit();
  });
});
