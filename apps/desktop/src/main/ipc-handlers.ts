import { BrowserWindow, ipcMain, dialog, app } from 'electron';
import Store from 'electron-store';
import { existsSync } from 'fs';
import { join } from 'path';

const store = new Store();

/**
 * Supported CLI tools to check for
 */
const CLI_TOOLS = ['claude', 'npm', 'node', 'git', 'pnpm', 'yarn'] as const;
type CLITool = (typeof CLI_TOOLS)[number];

/**
 * Check if a CLI tool is available
 */
async function checkCliAvailable(tool: CLITool): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync(`${tool} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Register all IPC handlers for the application
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ============================================
  // Window Control Handlers
  // ============================================

  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized();
  });

  // Forward window state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });

  // ============================================
  // Dialog Handlers
  // ============================================

  ipcMain.handle('dialog:open-directory', async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      ...options,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      ...options,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    'dialog:message',
    async (
      _event,
      options: {
        type?: 'none' | 'info' | 'error' | 'question' | 'warning';
        title?: string;
        message: string;
        detail?: string;
        buttons?: string[];
      }
    ) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: options.type ?? 'info',
        title: options.title ?? 'Omniscribe',
        message: options.message,
        detail: options.detail,
        buttons: options.buttons ?? ['OK'],
      });
      return result.response;
    }
  );

  // ============================================
  // Store Handlers
  // ============================================

  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    store.delete(key);
  });

  ipcMain.handle('store:clear', () => {
    store.clear();
  });

  // ============================================
  // App Handlers
  // ============================================

  ipcMain.handle('app:get-path', (_event, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name);
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:check-cli', async (_event, tool: CLITool) => {
    if (!CLI_TOOLS.includes(tool)) {
      throw new Error(`Unknown CLI tool: ${tool}`);
    }
    return checkCliAvailable(tool);
  });

  ipcMain.handle('app:is-valid-project', async (_event, projectPath: string) => {
    // Check if path exists and has common project indicators
    if (!existsSync(projectPath)) {
      return { valid: false, reason: 'Path does not exist' };
    }

    const indicators = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.git'];
    const hasIndicator = indicators.some((indicator) => existsSync(join(projectPath, indicator)));

    return {
      valid: hasIndicator,
      reason: hasIndicator ? undefined : 'No recognized project files found',
    };
  });
}

/**
 * Clean up IPC handlers (call on app quit)
 */
export function cleanupIpcHandlers(): void {
  // Window handlers
  ipcMain.removeAllListeners('window:minimize');
  ipcMain.removeAllListeners('window:maximize');
  ipcMain.removeAllListeners('window:close');
  ipcMain.removeHandler('window:is-maximized');

  // Dialog handlers
  ipcMain.removeHandler('dialog:open-directory');
  ipcMain.removeHandler('dialog:open-file');
  ipcMain.removeHandler('dialog:message');

  // Store handlers
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
  ipcMain.removeHandler('store:clear');

  // App handlers
  ipcMain.removeHandler('app:get-path');
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:check-cli');
  ipcMain.removeHandler('app:is-valid-project');
}
