import { ipcMain } from 'electron';
import { getGhCliStatus } from '../utils';

/**
 * Register GitHub CLI IPC handlers
 */
export function registerGithubCliHandlers(): void {
  ipcMain.handle('github:get-status', async () => {
    return getGhCliStatus();
  });
}

/**
 * Clean up GitHub CLI IPC handlers
 */
export function cleanupGithubCliHandlers(): void {
  ipcMain.removeHandler('github:get-status');
}
