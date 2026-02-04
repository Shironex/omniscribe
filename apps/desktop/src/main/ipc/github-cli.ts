import { ipcMain } from 'electron';
import { createLogger } from '@omniscribe/shared';
import { getGhCliStatus } from '../utils';

const logger = createLogger('IPC:GithubCli');

/**
 * Register GitHub CLI IPC handlers
 */
export function registerGithubCliHandlers(): void {
  ipcMain.handle('github:get-status', async () => {
    try {
      return await getGhCliStatus();
    } catch (error) {
      logger.error('Failed to get GitHub CLI status:', error);
      throw error;
    }
  });
}

/**
 * Clean up GitHub CLI IPC handlers
 */
export function cleanupGithubCliHandlers(): void {
  ipcMain.removeHandler('github:get-status');
}
