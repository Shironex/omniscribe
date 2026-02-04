import { app, BrowserWindow } from 'electron';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from '../modules/app.module';
import { createMainWindow } from './window';

export let mainWindow: BrowserWindow | null = null;
let nestApp: INestApplication | null = null;
let isShuttingDown = false;

async function bootstrapNestApp(): Promise<void> {
  nestApp = await NestFactory.create(AppModule);

  nestApp.useWebSocketAdapter(new IoAdapter(nestApp));

  nestApp.enableCors({
    origin: true,
    credentials: true,
  });

  await nestApp.listen(3001);
  console.log('NestJS server running on port 3001');
}

async function shutdownNestApp(): Promise<void> {
  if (nestApp) {
    console.log('Shutting down NestJS...');
    await nestApp.close();
    nestApp = null;
    console.log('NestJS shutdown complete');
  }
}

async function bootstrap(): Promise<void> {
  await bootstrapNestApp();
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

app.on('before-quit', (event) => {
  mainWindow = null;

  // If already shutting down, let the quit proceed
  if (isShuttingDown) {
    return;
  }

  // Prevent quit, do async cleanup, then quit again
  if (nestApp) {
    event.preventDefault();
    isShuttingDown = true;
    shutdownNestApp().finally(() => {
      app.quit();
    });
  }
});
