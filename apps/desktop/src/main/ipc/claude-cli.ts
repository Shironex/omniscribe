import { ipcMain } from 'electron';
import type {
  ClaudeVersionList,
  ClaudeInstallCommandOptions,
} from '@omniscribe/shared';
import {
  getClaudeCliStatus,
  checkClaudeVersion,
  fetchAvailableVersions,
  getInstallCommand,
  openTerminalWithCommand,
} from '../utils';

/**
 * Register Claude CLI IPC handlers
 */
export function registerClaudeCliHandlers(): void {
  ipcMain.handle('claude:get-status', async () => {
    return getClaudeCliStatus();
  });

  ipcMain.handle('claude:check-version', async () => {
    const status = await getClaudeCliStatus();
    return checkClaudeVersion(status.version);
  });

  ipcMain.handle('claude:get-versions', async () => {
    const versions = await fetchAvailableVersions();
    return { versions } as ClaudeVersionList;
  });

  ipcMain.handle(
    'claude:get-install-command',
    async (_event, options: ClaudeInstallCommandOptions) => {
      return getInstallCommand(options);
    },
  );

  ipcMain.handle('claude:run-install', async (_event, command: string) => {
    await openTerminalWithCommand(command);
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
