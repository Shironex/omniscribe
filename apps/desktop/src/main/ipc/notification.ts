import { ipcMain } from 'electron';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('IPC:Notification');

/**
 * Register notification-related IPC handlers.
 *
 * The test notification handler needs access to the NestJS NotificationService.
 * We use a lazy import approach: when the test button is clicked, we import
 * the notification service from the NestJS app context.
 *
 * Note: `notification:navigate` is sent FROM main process TO renderer (not a handler).
 */
export function registerNotificationHandlers(): void {
  ipcMain.handle('notification:test', async () => {
    try {
      // Dynamically import to avoid circular dependency with NestJS bootstrap
      const { Notification } = await import('electron');

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
