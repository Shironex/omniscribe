import { ipcMain } from 'electron';
import type { ClaudeVersionList, ClaudeInstallCommandOptions } from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import {
  getClaudeCliStatus,
  checkClaudeVersion,
  fetchAvailableVersions,
  getInstallCommand,
  openTerminalWithCommand,
} from '../utils';

const logger = createLogger('IPC:ClaudeCli');

/**
 * Register Claude CLI IPC handlers
 */
export function registerClaudeCliHandlers(): void {
  ipcMain.handle('claude:get-status', async () => {
    try {
      return await getClaudeCliStatus();
    } catch (error) {
      logger.error('Failed to get Claude CLI status:', error);
      throw error;
    }
  });

  ipcMain.handle('claude:check-version', async () => {
    try {
      const status = await getClaudeCliStatus();
      return checkClaudeVersion(status.version);
    } catch (error) {
      logger.error('Failed to check Claude version:', error);
      throw error;
    }
  });

  ipcMain.handle('claude:get-versions', async () => {
    try {
      const versions = await fetchAvailableVersions();
      return { versions } as ClaudeVersionList;
    } catch (error) {
      logger.error('Failed to fetch available versions:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'claude:get-install-command',
    async (_event, options: ClaudeInstallCommandOptions) => {
      try {
        return getInstallCommand(options);
      } catch (error) {
        logger.error('Failed to get install command:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('claude:run-install', async (_event, command: string) => {
    try {
      await openTerminalWithCommand(command);
    } catch (error) {
      logger.error('Failed to run install command:', error);
      throw error;
    }
  });
}

/**
 * Clean up Claude CLI IPC handlers
 */
export function cleanupClaudeCliHandlers(): void {
  ipcMain.removeHandler('claude:get-status');
  ipcMain.removeHandler('claude:check-version');
  ipcMain.removeHandler('claude:get-versions');
  ipcMain.removeHandler('claude:get-install-command');
  ipcMain.removeHandler('claude:run-install');
}
