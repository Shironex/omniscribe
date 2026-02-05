import { BrowserWindow } from 'electron';
import {
  registerWindowHandlers,
  cleanupWindowHandlers,
  registerDialogHandlers,
  cleanupDialogHandlers,
  registerStoreHandlers,
  cleanupStoreHandlers,
  registerAppHandlers,
  cleanupAppHandlers,
  registerClaudeCliHandlers,
  cleanupClaudeCliHandlers,
  registerGithubCliHandlers,
  cleanupGithubCliHandlers,
  registerUpdaterHandlers,
  cleanupUpdaterHandlers,
} from './ipc';

/**
 * Register all IPC handlers for the application
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerWindowHandlers(mainWindow);
  registerDialogHandlers(mainWindow);
  registerStoreHandlers();
  registerAppHandlers();
  registerClaudeCliHandlers();
  registerGithubCliHandlers();
  registerUpdaterHandlers();
}

/**
 * Clean up IPC handlers (call on app quit)
 */
export function cleanupIpcHandlers(): void {
  cleanupWindowHandlers();
  cleanupDialogHandlers();
  cleanupStoreHandlers();
  cleanupAppHandlers();
  cleanupClaudeCliHandlers();
  cleanupGithubCliHandlers();
  cleanupUpdaterHandlers();
}
