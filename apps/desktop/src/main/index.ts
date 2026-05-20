import { app, BrowserWindow, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import { CustomIoAdapter } from '../modules/shared/custom-io-adapter';
import { AppModule } from '../modules/app.module';
import { DeepLinkService } from '../modules/deep-link';
import { createMainWindow } from './window';
import { cleanupIpcHandlers } from './ipc-handlers';
import { logger, getLogPath, flushLogs } from './logger';
import { initializeAutoUpdater } from './updater';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { corsOriginCallback } from '../modules/shared/cors.config';
import { NestLoggerAdapter } from '../modules/shared/nest-logger';
import { LOCALHOST, APP_USER_MODEL_ID } from '@omniscribe/shared';
import { resolveShellPath } from './utils/shell-path';
import { getThumbnailsDir } from './utils';
import { setBackendPort } from './backend-port';
import { initializeWsAuthToken } from './ws-auth';
import { CDP_PORT, cdpEnabledForRuntime } from './cdp';

// Dogfood mode: expose CDP on Omniscribe's own window so @playwright/mcp
// can drive Omniscribe itself for self-testing. Off by default — port
// 9222 is reserved for the user's own Electron apps launched inside
// Omniscribe sessions. Opt in via OMNISCRIBE_ENABLE_CDP=1. Must happen
// before app.whenReady() / any BrowserWindow construction.
if (cdpEnabledForRuntime(app.isPackaged)) {
  app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT));
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  logger.info(`[cdp] dogfood mode: Omniscribe's own window exposed on 127.0.0.1:${CDP_PORT}`);
}

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

// Register omniscribe-thumb:// as a privileged scheme (must be before app.ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'omniscribe-thumb',
    privileges: { standard: false, secure: true, supportFetchAPI: true },
  },
]);

// Must be the first Windows shell registration call so subsequent
// protocol / notification registrations are tagged with the correct AUMID.
app.setAppUserModelId(APP_USER_MODEL_ID);

// Register custom protocol for deep linking (notification click-to-navigate)
if (process.defaultApp) {
  // Dev mode: register with the path to the electron binary
  app.setAsDefaultProtocolClient('omniscribe', process.execPath, [process.argv[1]]);
} else {
  app.setAsDefaultProtocolClient('omniscribe');
}

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

function setupAutoUpdater(window: BrowserWindow): void {
  const emitter = nestApp?.get(EventEmitter2);
  initializeAutoUpdater(window, process.env.NODE_ENV === 'development', emitter);
}

/** Validate thumbnail filename: no path traversal, only safe chars */
function isValidThumbnailFilename(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0'))
    return false;
  // Only allow alphanumeric, dash, underscore, dot
  return /^[\w\-.]+$/.test(name);
}

async function bootstrap(): Promise<void> {
  // Generate the per-window WS auth token before any gateway can accept
  // connections. CustomIoAdapter validates this on every handshake.
  initializeWsAuthToken();

  // Resolve the user's full shell PATH before any child processes are spawned.
  // macOS/Linux GUI apps inherit a minimal PATH that's missing dev tools.
  resolveShellPath();

  // Register omniscribe-thumb:// protocol handler for serving project thumbnails
  // Scheme is non-standard (opaque), so URL() puts everything after :// in pathname.
  // Extract filename by stripping the scheme prefix and any leading slashes.
  protocol.handle('omniscribe-thumb', async request => {
    const fileName = request.url.replace(/^omniscribe-thumb:\/\//, '').replace(/\/+$/, '');

    if (!isValidThumbnailFilename(fileName)) {
      return new Response('Invalid filename', { status: 400 });
    }

    const filePath = path.join(getThumbnailsDir(), fileName);

    // Double-check resolved path is within thumbnails dir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(getThumbnailsDir()))) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      await fs.promises.access(resolved, fs.constants.R_OK);
    } catch {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(resolved).toString());
  });

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
  setupAutoUpdater(mainWindow);

  // Process any protocol URLs that arrived before the window was ready
  for (const url of pendingProtocolUrls) {
    handleProtocolUrl(url);
  }
  pendingProtocolUrls.length = 0;
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

/** Strict UUID v4 format regex (8-4-4-4-12) for validating sessionId and tabId */
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Make sure a renderer window exists and is on screen. Deep links can arrive
 * while the previous window is destroyed but the Nest backend is still alive
 * (zombie process during slow pty cleanup, or after window-all-closed on
 * platforms where we keep the backend running). In those cases we must
 * recreate the window or the deep-link session would launch invisibly.
 */
async function ensureWindowVisible(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    return;
  }
  cleanupIpcHandlers();
  mainWindow = await createMainWindow();
  setupAutoUpdater(mainWindow);
  mainWindow.focus();
}

/**
 * Parse an omniscribe:// protocol URL and forward navigation data to the renderer.
 * URL format: omniscribe://session/{sessionId}?tab={tabId}
 *
 * Since protocol URLs are externally controlled (any app can invoke omniscribe://),
 * we validate all extracted IDs before forwarding to the renderer.
 */
function handleProtocolUrl(url: string): void {
  logger.debug('Handling protocol URL');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'omniscribe:') return;

    if (parsed.hostname === 'run' || parsed.pathname.startsWith('//run')) {
      // omniscribe://run?project=...&provider=...&branch=...&name=...
      if (!nestApp) {
        logger.warn('Deep link arrived before NestJS was ready; ignoring');
        return;
      }
      void ensureWindowVisible().then(() => {
        nestApp
          ?.get(DeepLinkService)
          .handleRun(url)
          .catch(error => logger.warn('Deep link handler failed', error));
      });
      return;
    }

    if (parsed.hostname === 'session' || parsed.pathname.startsWith('//session/')) {
      const sessionId = parsed.pathname.replace(/^\/\/session\//, '').replace(/^\//, '');

      // Validate sessionId format (UUID)
      if (!UUID_RE.test(sessionId)) {
        logger.warn('Invalid sessionId format in protocol URL');
        return;
      }

      const tabId = parsed.searchParams.get('tab') ?? undefined;
      if (tabId && !UUID_RE.test(tabId)) {
        logger.warn('Invalid tabId format in protocol URL');
        return;
      }

      // Only focus the window AFTER validation succeeds. A malformed or
      // hostile omniscribe:// URL — anyone can register that scheme via
      // app.setAsDefaultProtocolClient — should not be able to wake the
      // window or steal focus.
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send('notification:navigate', { sessionId, tabId });
      }
    }
  } catch {
    logger.warn('Failed to parse protocol URL');
  }
}

// Windows/Linux: second-instance event fires when another instance is launched
// (e.g., from a notification protocol click). The previous version focused
// the window unconditionally before checking the URL, so any process could
// launch Omniscribe with a hostile/garbage `omniscribe://...` arg and
// steal focus from the user. Now: parse first, focus inside
// handleProtocolUrl only when the URL passes UUID validation.
app.on('second-instance', (_event, argv) => {
  // On Windows the protocol URL is in argv. Find it BEFORE deciding
  // whether to wake the window.
  const protocolUrl = argv.find(arg => arg.startsWith('omniscribe://'));
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
    return;
  }

  // No protocol URL — this is a plain "user double-clicked the icon a
  // second time" event. Focus the existing window like any normal
  // single-instance app would.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Buffer protocol URLs that arrive before the window is ready (macOS cold launch,
// Windows/Linux cold launch via process.argv). Uses an array to handle multiple
// URLs arriving before bootstrap completes.
const pendingProtocolUrls: string[] = [];

// Capture protocol URL from initial launch argv (Windows/Linux cold start)
const launchProtocolUrl = process.argv.find(arg => arg.startsWith('omniscribe://'));
if (launchProtocolUrl) {
  pendingProtocolUrls.push(launchProtocolUrl);
}

// macOS: open-url event fires for protocol URLs
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    handleProtocolUrl(url);
  } else {
    pendingProtocolUrls.push(url);
  }
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
    setupAutoUpdater(mainWindow);
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
