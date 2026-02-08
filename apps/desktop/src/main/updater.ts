import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import * as semver from 'semver';
import {
  createLogger,
  UPDATE_ERROR_RELEASE_PENDING,
  DEFAULT_UPDATE_CHANNEL,
} from '@omniscribe/shared';
import type { UpdateChannel } from '@omniscribe/shared';
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'electron-updater';

const logger = createLogger('AutoUpdater');
const store = new Store();

let updaterEnabled = false;
let currentChannel: UpdateChannel = DEFAULT_UPDATE_CHANNEL;

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

function getPersistedChannel(): UpdateChannel {
  const stored = store.get('preferences.updateChannel') as string | undefined;
  if (stored === 'stable' || stored === 'beta') return stored;
  return DEFAULT_UPDATE_CHANNEL;
}

function applyChannel(channel: UpdateChannel): void {
  currentChannel = channel;
  autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest';
  autoUpdater.allowPrerelease = channel === 'beta';
  autoUpdater.allowDowngrade = true;
  logger.info(`Update channel set to '${channel}' (autoUpdater.channel='${autoUpdater.channel}')`);
}

export function getUpdateChannel(): UpdateChannel {
  return currentChannel;
}

export async function setUpdateChannel(channel: UpdateChannel): Promise<UpdateChannel> {
  logger.info(`Switching update channel: ${currentChannel} → ${channel}`);
  store.set('preferences.updateChannel', channel);
  applyChannel(channel);
  return channel;
}

export function initializeAutoUpdater(mainWindow: BrowserWindow, isDev: boolean): void {
  if (isDev) {
    logger.info('Skipping auto-updater in development mode');
    updaterEnabled = false;
    return;
  }

  updaterEnabled = true;
  applyChannel(getPersistedChannel());

  // Wire autoUpdater events → renderer via IPC
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update...');
    mainWindow.webContents.send('updater:checking-for-update');
  });

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    logger.info('Update available:', info.version);
    let isDowngrade = false;
    try {
      isDowngrade = semver.lt(info.version, app.getVersion());
    } catch {
      logger.warn(`Could not compare versions: ${info.version} vs ${app.getVersion()}`);
    }
    mainWindow.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      channel: currentChannel,
      isDowngrade,
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
    // Detect 404 on any update yml file (latest.yml, beta.yml, alpha.yml, etc.)
    // We check both filenames to handle race conditions when the channel changes
    // mid-check, and also when stable checks hit a beta-only release tag.
    const isReleasePending =
      error.message.includes('Cannot find latest.yml') ||
      error.message.includes('Cannot find beta.yml') ||
      (error.message.includes('.yml') && error.message.includes('404'));

    if (isReleasePending) {
      logger.warn(
        'Release artifacts not yet available (.yml 404) — build may still be in progress'
      );
      mainWindow.webContents.send('updater:error', UPDATE_ERROR_RELEASE_PENDING);
    } else {
      logger.error('Auto-updater error:', error.message);
      mainWindow.webContents.send('updater:error', error.message);
    }
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

export async function checkForUpdates(): Promise<{ enabled: boolean; channel: UpdateChannel }> {
  if (!updaterEnabled) {
    logger.info('Update check skipped — updater not enabled');
    return { enabled: false, channel: currentChannel };
  }
  try {
    logger.info(`Triggering update check on '${currentChannel}' channel...`);
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('Failed to check for updates:', error);
  }
  return { enabled: true, channel: currentChannel };
}

export async function downloadUpdate(): Promise<void> {
  logger.info('Starting update download...');
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  logger.info('Quitting and installing update...');
  autoUpdater.quitAndInstall();
}
