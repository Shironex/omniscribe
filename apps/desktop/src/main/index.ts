import { app, BrowserWindow } from 'electron';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import { CustomIoAdapter } from '../modules/shared/custom-io-adapter';
import { AppModule } from '../modules/app.module';
import { createMainWindow } from './window';
import { cleanupIpcHandlers } from './ipc-handlers';
import { logger, getLogPath, flushLogs } from './logger';
import { initializeAutoUpdater } from './updater';
import { corsOriginCallback } from '../modules/shared/cors.config';
import { NestLoggerAdapter } from '../modules/shared/nest-logger';
import { LOCALHOST } from '@omniscribe/shared';

// Allow E2E tests to isolate userData by setting ELECTRON_USER_DATA_DIR.
// Must run before app.ready so electron-store and other userData consumers
// see the overridden path.
if (process.env.ELECTRON_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

export let mainWindow: BrowserWindow | null = null;
let nestApp: INestApplication | null = null;
let isShuttingDown = false;

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

    logger.info('Starting to listen on port 3001...');
    await nestApp.listen(3001, LOCALHOST);
    logger.info('NestJS server running on port 3001');
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
  initializeAutoUpdater(mainWindow, process.env.NODE_ENV === 'development');
}

// Global error handling
process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection:', reason);
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
    initializeAutoUpdater(mainWindow, process.env.NODE_ENV === 'development');
  }
});

app.on('before-quit', event => {
  mainWindow = null;

  // If already shutting down, let the quit proceed
  if (isShuttingDown) {
    return;
  }

  // Prevent quit, do async cleanup, then quit again
  event.preventDefault();
  isShuttingDown = true;

  (async () => {
    try {
      await flushLogs();
    } catch {
      // Log flush failure is non-critical
    }
    if (nestApp) {
      await shutdownNestApp();
    }
  })().finally(() => {
    app.quit();
  });
});
