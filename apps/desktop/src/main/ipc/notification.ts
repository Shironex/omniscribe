import { ipcMain, Notification } from 'electron';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('IPC:Notification');

/**
 * Register notification-related IPC handlers.
 *
 * - `notification:test`: Shows a simple test notification to verify OS support.
 *   This intentionally bypasses NotificationService preferences/throttling
 *   so the user can verify notifications work even if their settings would suppress them.
 *
 * - `notification:navigate`: Sent FROM main process TO renderer (not a handler here).
 */
export function registerNotificationHandlers(): void {
  ipcMain.handle('notification:test', () => {
    try {
      if (!Notification.isSupported()) {
        logger.warn('Notifications not supported on this platform');
        return { success: false, reason: 'not-supported' };
      }

      const notification = new Notification({
        title: 'Omniscribe Test Notification',
        body: 'Notifications are working correctly!',
        silent: false,
      });

      notification.show();
      return { success: true };
    } catch (error) {
      logger.error('Failed to show test notification:', error);
      return { success: false, reason: 'error' };
    }
  });
}

/**
 * Clean up notification IPC handlers.
 */
export function cleanupNotificationHandlers(): void {
  ipcMain.removeHandler('notification:test');
}
