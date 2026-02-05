import { BrowserWindow, ipcMain, dialog } from 'electron';
import type { MessageDialogOptions } from './types';

/**
 * Security: Sanitize and validate dialog options
 * Only allows safe properties through to prevent abuse
 */
function sanitizeOpenDialogOptions(
  options?: Electron.OpenDialogOptions
): Partial<Electron.OpenDialogOptions> {
  if (!options) return {};

  const sanitized: Partial<Electron.OpenDialogOptions> = {};

  // Only allow safe string properties
  if (typeof options.title === 'string') {
    sanitized.title = options.title.slice(0, 200); // Limit length
  }

  if (typeof options.defaultPath === 'string') {
    // Basic path validation - no special characters that could cause issues
    const safePath = options.defaultPath.replace(/[<>"|?*]/g, '');
    sanitized.defaultPath = safePath;
  }

  if (typeof options.buttonLabel === 'string') {
    sanitized.buttonLabel = options.buttonLabel.slice(0, 50);
  }

  // Validate filters if provided
  if (Array.isArray(options.filters)) {
    sanitized.filters = options.filters
      .slice(0, 10) // Limit number of filters
      .filter(
        f => typeof f === 'object' && typeof f.name === 'string' && Array.isArray(f.extensions)
      )
      .map(f => ({
        name: f.name.slice(0, 100),
        extensions: f.extensions.slice(0, 20).filter(e => typeof e === 'string'),
      }));
  }

  // Note: 'properties' is intentionally NOT passed through
  // We set this explicitly in each handler to prevent abuse

  return sanitized;
}

/**
 * Security: Sanitize message dialog options
 */
function sanitizeMessageDialogOptions(options: MessageDialogOptions): MessageDialogOptions {
  const allowedTypes = ['none', 'info', 'error', 'question', 'warning'] as const;
  const type = allowedTypes.includes(options.type as (typeof allowedTypes)[number])
    ? options.type
    : 'info';

  return {
    type,
    title: typeof options.title === 'string' ? options.title.slice(0, 200) : 'Omniscribe',
    message: typeof options.message === 'string' ? options.message.slice(0, 2000) : '',
    detail: typeof options.detail === 'string' ? options.detail.slice(0, 2000) : undefined,
    buttons: Array.isArray(options.buttons)
      ? options.buttons
          .slice(0, 5)
          .filter(b => typeof b === 'string')
          .map(b => b.slice(0, 50))
      : ['OK'],
  };
}

/**
 * Register dialog IPC handlers
 */
export function registerDialogHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('dialog:open-directory', async (_event, options?: Electron.OpenDialogOptions) => {
    const sanitized = sanitizeOpenDialogOptions(options);
    const result = await dialog.showOpenDialog(mainWindow, {
      ...sanitized,
      properties: ['openDirectory'], // Always set explicitly
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async (_event, options?: Electron.OpenDialogOptions) => {
    const sanitized = sanitizeOpenDialogOptions(options);
    const result = await dialog.showOpenDialog(mainWindow, {
      ...sanitized,
      properties: ['openFile'], // Always set explicitly
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:message', async (_event, options: MessageDialogOptions) => {
    const sanitized = sanitizeMessageDialogOptions(options);
    const result = await dialog.showMessageBox(mainWindow, {
      type: sanitized.type ?? 'info',
      title: sanitized.title ?? 'Omniscribe',
      message: sanitized.message,
      detail: sanitized.detail,
      buttons: sanitized.buttons ?? ['OK'],
    });
    return result.response;
  });
}

/**
 * Clean up dialog IPC handlers
 */
export function cleanupDialogHandlers(): void {
  ipcMain.removeHandler('dialog:open-directory');
  ipcMain.removeHandler('dialog:open-file');
  ipcMain.removeHandler('dialog:message');
}
