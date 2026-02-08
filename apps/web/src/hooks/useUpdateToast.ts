import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { GITHUB_RELEASES_URL, UPDATE_ERROR_RELEASE_PENDING } from '@omniscribe/shared';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { IS_MAC } from '@/lib/platform';
import type { UpdateStatus } from '@omniscribe/shared';

const TOAST_DURATION_LONG = 15000;
const TOAST_DURATION_NORMAL = 10000;

/**
 * Display platform-aware toast notifications for update status changes.
 *
 * Shows contextual toasts when the update status transitions:
 * - 'available': notifies about a new version and provides a download or settings action depending on platform.
 * - 'ready': prompts to restart to install on non-macOS or links to GitHub Releases on macOS.
 * - 'error': surfaces macOS signature-related errors with a link to GitHub Releases.
 */
export function useUpdateToast(): void {
  const status = useUpdateStore(state => state.status);
  const updateInfo = useUpdateStore(state => state.updateInfo);
  const error = useUpdateStore(state => state.error);
  const channel = useUpdateStore(state => state.channel);
  const installNow = useUpdateStore(state => state.installNow);
  const openSettings = useSettingsStore(state => state.openSettings);
  const prevStatus = useRef<UpdateStatus>('idle');

  useEffect(() => {
    if (status === prevStatus.current) return;
    prevStatus.current = status;

    if (status === 'available' && updateInfo) {
      const channelLabel = channel === 'beta' ? ' (Beta)' : '';
      const title = `Update v${updateInfo.version}${channelLabel} available`;
      if (IS_MAC) {
        toast.info(title, {
          description: 'Download the latest version from GitHub Releases.',
          action: {
            label: 'Download',
            onClick: () => window.open(GITHUB_RELEASES_URL, '_blank'),
          },
          duration: TOAST_DURATION_LONG,
        });
      } else {
        toast.info(title, {
          description: 'A new version of Omniscribe is ready to download.',
          action: {
            label: 'View',
            onClick: () => openSettings('general'),
          },
          duration: TOAST_DURATION_NORMAL,
        });
      }
    }

    if (status === 'ready') {
      if (IS_MAC) {
        // Should not reach here on macOS since we skip download,
        // but handle gracefully just in case
        toast.success('Update downloaded', {
          description:
            'Auto-install is not available on macOS. Download the latest version manually.',
          action: {
            label: 'GitHub Releases',
            onClick: () => window.open(GITHUB_RELEASES_URL, '_blank'),
          },
          duration: TOAST_DURATION_LONG,
        });
      } else {
        toast.success('Update ready to install', {
          description: 'Restart the app to apply the update.',
          action: {
            label: 'Restart Now',
            onClick: () => installNow(),
          },
          duration: TOAST_DURATION_LONG,
        });
      }
    }

    if (status === 'error') {
      if (error === UPDATE_ERROR_RELEASE_PENDING) {
        toast.info('New release detected', {
          description: 'The release is still being built. Check back in 5–10 minutes.',
          action: {
            label: 'View',
            onClick: () => openSettings('general'),
          },
          duration: TOAST_DURATION_NORMAL,
        });
      } else if (IS_MAC && (error?.includes('Code signature') || error?.includes('signature'))) {
        toast.error('Auto-install unavailable on macOS', {
          description: 'Download the update manually from GitHub.',
          action: {
            label: 'GitHub Releases',
            onClick: () => window.open(GITHUB_RELEASES_URL, '_blank'),
          },
          duration: TOAST_DURATION_LONG,
        });
      } else {
        toast.error('Update failed', {
          description: error ?? 'An error occurred while checking for updates.',
          duration: TOAST_DURATION_NORMAL,
        });
      }
    }
  }, [status, updateInfo, error, channel, installNow, openSettings]);
}
