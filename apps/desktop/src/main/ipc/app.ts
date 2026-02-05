import { ipcMain, app } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@omniscribe/shared';
import { CLI_TOOLS, checkCliAvailable, type CLITool } from '../utils';
import type { ProjectValidationResult } from './types';

const logger = createLogger('IPC:App');

/**
 * Register app-related IPC handlers
 */
export function registerAppHandlers(): void {
  ipcMain.handle('app:get-path', (_event, name: Parameters<typeof app.getPath>[0]) => {
    logger.debug(`app:get-path invoked for "${name}"`);
    return app.getPath(name);
  });

  ipcMain.handle('app:get-version', () => {
    logger.debug('app:get-version invoked');
    return app.getVersion();
  });

  ipcMain.handle('app:check-cli', async (_event, tool: CLITool) => {
    logger.debug(`app:check-cli invoked for "${tool}"`);
    if (!CLI_TOOLS.includes(tool)) {
      throw new Error(`Unknown CLI tool: ${tool}`);
    }
    return checkCliAvailable(tool);
  });

  ipcMain.handle(
    'app:is-valid-project',
    async (_event, projectPath: string): Promise<ProjectValidationResult> => {
      logger.debug(`app:is-valid-project invoked for "${projectPath}"`);
      // Check if path exists and has common project indicators
      if (!existsSync(projectPath)) {
        return { valid: false, reason: 'Path does not exist' };
      }

      const indicators = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.git'];
      const hasIndicator = indicators.some(indicator => existsSync(join(projectPath, indicator)));

      return {
        valid: hasIndicator,
        reason: hasIndicator ? undefined : 'No recognized project files found',
      };
    }
  );
}

/**
 * Clean up app-related IPC handlers
 */
export function cleanupAppHandlers(): void {
  ipcMain.removeHandler('app:get-path');
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:check-cli');
  ipcMain.removeHandler('app:is-valid-project');
}
