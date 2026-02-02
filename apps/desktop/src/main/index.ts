import { app, BrowserWindow } from 'electron';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from '../modules/app.module';
import { createMainWindow } from './window';

export let mainWindow: BrowserWindow | null = null;

async function bootstrapNestApp(): Promise<void> {
  const nestApp = await NestFactory.create(AppModule);

  nestApp.useWebSocketAdapter(new IoAdapter(nestApp));

  nestApp.enableCors({
    origin: true,
    credentials: true,
  });

  await nestApp.listen(3001);
  console.log('NestJS server running on port 3001');
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

app.on('before-quit', () => {
  mainWindow = null;
});
