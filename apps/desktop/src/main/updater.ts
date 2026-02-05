import { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createLogger } from '@omniscribe/shared';
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'electron-updater';

const logger = createLogger('AutoUpdater');

let updaterEnabled = false;

// Disable auto download — user controls when to download
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function parseReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') return releaseNotes;
  // Array of ReleaseNoteInfo — join all notes
  return releaseNotes
    .map(entry => entry.note)
    .filter(Boolean)
    .join('\n\n');
}

export function initializeAutoUpdater(mainWindow: BrowserWindow, isDev: boolean): void {
  if (isDev) {
    logger.info('Skipping auto-updater in development mode');
    updaterEnabled = false;
    return;
  }

  updaterEnabled = true;

  // Wire autoUpdater events → renderer via IPC
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update...');
    mainWindow.webContents.send('updater:checking-for-update');
  });

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    logger.info('Update available:', info.version);
    mainWindow.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
    logger.info('No update available. Current version is up to date:', info.version);
    mainWindow.webContents.send('updater:update-not-available', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    logger.debug(
      `Download progress: ${progress.percent.toFixed(1)}% (${progress.bytesPerSecond} B/s)`
    );
    mainWindow.webContents.send('updater:download-progress', {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    logger.info('Update downloaded:', info.version);
    mainWindow.webContents.send('updater:update-downloaded', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    logger.error('Auto-updater error:', error.message);
    mainWindow.webContents.send('updater:error', error.message);
  });

  // Initial check after a short delay to let the app finish loading
  setTimeout(() => {
    checkForUpdates();
  }, 5000);

  // Periodic checks every hour
  setInterval(
    () => {
      checkForUpdates();
    },
    60 * 60 * 1000
  );
}

export async function checkForUpdates(): Promise<{ enabled: boolean }> {
  if (!updaterEnabled) {
    logger.info('Update check skipped — updater not enabled');
    return { enabled: false };
  }
  try {
    logger.info('Triggering update check...');
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('Failed to check for updates:', error);
  }
  return { enabled: true };
}

export async function downloadUpdate(): Promise<void> {
  logger.info('Starting update download...');
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  logger.info('Quitting and installing update...');
  autoUpdater.quitAndInstall();
}
