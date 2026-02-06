import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { GITHUB_RELEASES_URL } from '@omniscribe/shared';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { UpdateStatus } from '@omniscribe/shared';

/**
 * Shows toast notifications for auto-update events.
 * On macOS, directs users to GitHub Releases since auto-install
 * requires code signing which is not yet available.
 */
export function useUpdateToast(): void {
  const status = useUpdateStore(state => state.status);
  const updateInfo = useUpdateStore(state => state.updateInfo);
  const installNow = useUpdateStore(state => state.installNow);
  const openSettings = useSettingsStore(state => state.openSettings);
  const prevStatus = useRef<UpdateStatus>('idle');

  const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

  useEffect(() => {
    if (status === prevStatus.current) return;
    prevStatus.current = status;

    if (status === 'available' && updateInfo) {
      if (isMac) {
        toast.info(`Update v${updateInfo.version} available`, {
          description: 'Download the latest version from GitHub Releases.',
          action: {
            label: 'Download',
            onClick: () => window.open(GITHUB_RELEASES_URL, '_blank'),
          },
          duration: 15000,
        });
      } else {
        toast.info(`Update v${updateInfo.version} available`, {
          description: 'A new version of Omniscribe is ready to download.',
          action: {
            label: 'View',
            onClick: () => openSettings('general'),
          },
          duration: 10000,
        });
      }
    }

    if (status === 'ready') {
      if (isMac) {
        // Should not reach here on macOS since we skip download,
        // but handle gracefully just in case
        toast.success('Update downloaded', {
          description:
            'Auto-install is not available on macOS. Download the latest version manually.',
          action: {
            label: 'GitHub Releases',
            onClick: () => window.open(GITHUB_RELEASES_URL, '_blank'),
          },
          duration: 15000,
        });
      } else {
        toast.success('Update ready to install', {
          description: 'Restart the app to apply the update.',
          action: {
            label: 'Restart Now',
            onClick: () => installNow(),
          },
          duration: 15000,
        });
      }
    }

    if (status === 'error') {
      const error = useUpdateStore.getState().error;
      const isSignatureError = error?.includes('Code signature') || error?.includes('signature');

      if (isMac && isSignatureError) {
        toast.error('Auto-install unavailable on macOS', {
          description: 'Download the update manually from GitHub.',
          action: {
            label: 'GitHub Releases',
            onClick: () => window.open(GITHUB_RELEASES_URL, '_blank'),
          },
          duration: 15000,
        });
      }
    }
  }, [status, updateInfo, installNow, isMac, openSettings]);
}
