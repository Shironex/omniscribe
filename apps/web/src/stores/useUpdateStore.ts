import { create } from 'zustand';
import type { UpdateStatus, UpdateInfo, UpdateDownloadProgress } from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('UpdateStore');

interface UpdateState {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: UpdateDownloadProgress | null;
  error: string | null;
}

interface UpdateActions {
  checkForUpdates: () => void;
  startDownload: () => void;
  installNow: () => void;
  initListeners: () => () => void;
}

type UpdateStore = UpdateState & UpdateActions;

export const useUpdateStore = create<UpdateStore>(set => ({
  // Initial state
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,

  // Actions
  checkForUpdates: () => {
    const updater = window.electronAPI?.updater;
    if (!updater) {
      logger.warn('Updater API not available');
      return;
    }
    set({ status: 'checking', error: null });
    updater
      .checkForUpdates()
      .then(result => {
        if (!result.enabled) {
          logger.info('Auto-updater not enabled (dev mode)');
          set({ status: 'idle', error: null });
        }
      })
      .catch((err: Error) => {
        logger.error('Failed to check for updates:', err);
        set({ status: 'error', error: err.message });
      });
  },

  startDownload: () => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;
    set({ status: 'downloading', progress: null, error: null });
    updater.startDownload().catch((err: Error) => {
      logger.error('Failed to start download:', err);
      set({ status: 'error', error: err.message });
    });
  },

  installNow: () => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;
    updater.installNow().catch((err: Error) => {
      logger.error('Failed to install update:', err);
      set({ status: 'error', error: err.message });
    });
  },

  initListeners: () => {
    const updater = window.electronAPI?.updater;
    if (!updater) {
      logger.warn('Updater API not available — skipping listener init');
      return () => {};
    }

    logger.debug('Initializing updater listeners');

    const unsubChecking = updater.onCheckingForUpdate(() => {
      set({ status: 'checking', error: null });
    });

    const unsubAvailable = updater.onUpdateAvailable(info => {
      set({ status: 'available', updateInfo: info, error: null });
    });

    const unsubNotAvailable = updater.onUpdateNotAvailable(() => {
      set({ status: 'idle', error: null });
    });

    const unsubProgress = updater.onDownloadProgress(progress => {
      set({ status: 'downloading', progress });
    });

    const unsubDownloaded = updater.onUpdateDownloaded(info => {
      set({ status: 'ready', updateInfo: info, progress: null });
    });

    const unsubError = updater.onUpdateError(message => {
      set({ status: 'error', error: message });
    });

    return () => {
      logger.debug('Cleaning up updater listeners');
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  },
}));
