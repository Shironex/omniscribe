import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  UpdateStatus,
  UpdateInfo,
  UpdateDownloadProgress,
  UpdateChannel,
} from '@omniscribe/shared';
import { createLogger, DEFAULT_UPDATE_CHANNEL } from '@omniscribe/shared';

const logger = createLogger('UpdateStore');

function isValidChannel(value: unknown): value is UpdateChannel {
  return value === 'stable' || value === 'beta';
}

interface UpdateState {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  channel: UpdateChannel;
  isChannelSwitching: boolean;
}

interface UpdateActions {
  checkForUpdates: () => void;
  startDownload: () => void;
  installNow: () => void;
  setChannel: (channel: UpdateChannel) => void;
  initListeners: () => () => void;
}

type UpdateStore = UpdateState & UpdateActions;

export const useUpdateStore = create<UpdateStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      status: 'idle',
      updateInfo: null,
      progress: null,
      error: null,
      channel: DEFAULT_UPDATE_CHANNEL,
      isChannelSwitching: false,

      // Actions
      checkForUpdates: () => {
        const updater = window.electronAPI?.updater;
        if (!updater) {
          logger.warn('Updater API not available');
          return;
        }
        set({ status: 'checking', error: null }, undefined, 'update/checkForUpdatesStart');
        updater
          .checkForUpdates()
          .then(result => {
            if (!result.enabled) {
              logger.info('Auto-updater not enabled (dev mode)');
              set({ status: 'idle', error: null }, undefined, 'update/updaterNotEnabled');
            }
          })
          .catch((err: Error) => {
            logger.error('Failed to check for updates:', err);
            set({ status: 'error', error: err.message }, undefined, 'update/checkForUpdatesError');
          });
      },

      startDownload: () => {
        const updater = window.electronAPI?.updater;
        if (!updater) return;
        set(
          { status: 'downloading', progress: null, error: null },
          undefined,
          'update/startDownload'
        );
        updater.startDownload().catch((err: Error) => {
          logger.error('Failed to start download:', err);
          set({ status: 'error', error: err.message }, undefined, 'update/downloadError');
        });
      },

      installNow: () => {
        const updater = window.electronAPI?.updater;
        if (!updater) return;
        updater.installNow().catch((err: Error) => {
          logger.error('Failed to install update:', err);
          set({ status: 'error', error: err.message }, undefined, 'update/installError');
        });
      },

      setChannel: (channel: UpdateChannel) => {
        const updater = window.electronAPI?.updater;
        if (!updater) return;
        set({ isChannelSwitching: true }, undefined, 'update/setChannelStart');
        updater
          .setChannel(channel)
          .then(result => {
            const newChannel = isValidChannel(result) ? result : DEFAULT_UPDATE_CHANNEL;
            set(
              {
                channel: newChannel,
                isChannelSwitching: false,
                status: 'idle',
                updateInfo: null,
                progress: null,
                error: null,
              },
              undefined,
              'update/setChannelSuccess'
            );
            // Trigger a re-check on the new channel
            updater.checkForUpdates().catch((err: Error) => {
              logger.error('Failed to re-check after channel switch:', err);
            });
          })
          .catch((err: Error) => {
            logger.error('Failed to set update channel:', err);
            set(
              { isChannelSwitching: false, status: 'error', error: err.message },
              undefined,
              'update/setChannelError'
            );
          });
      },

      initListeners: () => {
        const updater = window.electronAPI?.updater;
        if (!updater) {
          logger.warn('Updater API not available — skipping listener init');
          return () => {};
        }

        logger.debug('Initializing updater listeners');

        // Fetch initial channel
        updater
          .getChannel()
          .then(ch => {
            const validated = isValidChannel(ch) ? ch : DEFAULT_UPDATE_CHANNEL;
            set({ channel: validated }, undefined, 'update/initialChannel');
          })
          .catch((err: Error) => {
            logger.error('Failed to fetch initial channel:', err);
          });

        const unsubChecking = updater.onCheckingForUpdate(() => {
          set({ status: 'checking', error: null }, undefined, 'update/checking');
        });

        const unsubAvailable = updater.onUpdateAvailable(info => {
          set(
            { status: 'available', updateInfo: info, error: null },
            undefined,
            'update/available'
          );
        });

        const unsubNotAvailable = updater.onUpdateNotAvailable(() => {
          set({ status: 'idle', error: null }, undefined, 'update/notAvailable');
        });

        const unsubProgress = updater.onDownloadProgress(progress => {
          set({ status: 'downloading', progress }, undefined, 'update/downloadProgress');
        });

        const unsubDownloaded = updater.onUpdateDownloaded(info => {
          set(
            { status: 'ready', updateInfo: info, progress: null },
            undefined,
            'update/downloaded'
          );
        });

        const unsubError = updater.onUpdateError(message => {
          set({ status: 'error', error: message }, undefined, 'update/error');
        });

        const unsubChannelChanged = updater.onChannelChanged(newChannel => {
          // If this window initiated the change, setChannel handles the state update
          if (get().isChannelSwitching) return;

          const validated = isValidChannel(newChannel) ? newChannel : DEFAULT_UPDATE_CHANNEL;
          set(
            {
              channel: validated,
              status: 'idle',
              updateInfo: null,
              progress: null,
              error: null,
            },
            undefined,
            'update/channelChanged'
          );
          // Re-check for updates on the new channel
          updater.checkForUpdates().catch((err: Error) => {
            logger.error('Failed to re-check after external channel switch:', err);
          });
        });

        return () => {
          logger.debug('Cleaning up updater listeners');
          unsubChecking();
          unsubAvailable();
          unsubNotAvailable();
          unsubProgress();
          unsubDownloaded();
          unsubError();
          unsubChannelChanged();
        };
      },
    }),
    { name: 'update' }
  )
);
