import { ipcMain, app, shell, clipboard } from 'electron';
import { existsSync } from 'fs';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import {
  createLogger,
  LOG_FILE_PREFIX,
  LOG_MAX_FILE_SIZE,
  EDITOR_OPTIONS,
  type EditorProtocol,
} from '@omniscribe/shared';
import { CLI_TOOLS, checkCliAvailable, findCliInPath, type CLITool } from '../utils';
import { getLogsDir } from '../logger';
import { getBackendPort } from '../backend-port';
import type { ProjectValidationResult } from './types';

const logger = createLogger('IPC:App');

/** Cached editor detection results */
let editorCache: EditorProtocol[] | null = null;
let editorCacheTime = 0;
const EDITOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Detect which supported editors are installed by checking CLI commands in PATH
 */
async function detectInstalledEditors(): Promise<EditorProtocol[]> {
  const now = Date.now();
  if (editorCache && now - editorCacheTime < EDITOR_CACHE_TTL) {
    return editorCache;
  }

  const results = await Promise.all(
    EDITOR_OPTIONS.map(async editor => {
      const path = await findCliInPath(editor.cliCommand);
      return path ? editor.id : null;
    })
  );

  editorCache = results.filter((id): id is EditorProtocol => id !== null);
  editorCacheTime = now;
  logger.debug('Detected editors:', editorCache);
  return editorCache;
}

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

  ipcMain.handle('app:open-logs-folder', async () => {
    logger.debug('app:open-logs-folder invoked');
    const logsPath = getLogsDir();
    await shell.openPath(logsPath);
  });

  ipcMain.handle('app:clipboard-write', (_event, text: string) => {
    if (typeof text !== 'string') {
      throw new Error('clipboard-write expects a string');
    }
    clipboard.writeText(text);
  });

  ipcMain.handle('app:get-backend-port', () => {
    logger.debug('app:get-backend-port invoked');
    return getBackendPort();
  });

  ipcMain.handle('app:list-log-files', async () => {
    logger.debug('app:list-log-files invoked');
    const logsDir = getLogsDir();
    if (!existsSync(logsDir)) return [];

    const entries = await readdir(logsDir);
    const logFiles: { name: string; size: number; lastModified: number }[] = [];

    for (const entry of entries) {
      if (!entry.startsWith(LOG_FILE_PREFIX) || !entry.endsWith('.log')) continue;
      const fileStat = await stat(join(logsDir, entry));
      if (!fileStat.isFile()) continue;
      logFiles.push({
        name: entry,
        size: fileStat.size,
        lastModified: fileStat.mtimeMs,
      });
    }

    return logFiles.sort((a, b) => b.lastModified - a.lastModified);
  });

  ipcMain.handle('app:read-log-file', async (_event, fileName: string) => {
    logger.debug(`app:read-log-file invoked for "${fileName}"`);

    // Security: reject path traversal, null bytes, and invalid filenames
    if (
      typeof fileName !== 'string' ||
      fileName.includes('\0') ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('..') ||
      !fileName.startsWith(LOG_FILE_PREFIX) ||
      !fileName.endsWith('.log')
    ) {
      throw new Error('Invalid log file name');
    }

    const filePath = join(getLogsDir(), fileName);

    // Check file size before reading to avoid loading very large files
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > LOG_MAX_FILE_SIZE) {
        throw new Error(`Log file exceeds ${LOG_MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        throw new Error('Log file not found');
      }
      throw err;
    }

    return readFile(filePath, 'utf-8');
  });

  ipcMain.handle('app:detect-editors', async () => {
    logger.debug('app:detect-editors invoked');
    return detectInstalledEditors();
  });
}

/**
 * Clean up app-related IPC handlers
 */
export function cleanupAppHandlers(): void {
  ipcMain.removeHandler('app:get-path');
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:check-cli');
  ipcMain.removeHandler('app:is-valid-project');
  ipcMain.removeHandler('app:open-logs-folder');
  ipcMain.removeHandler('app:clipboard-write');
  ipcMain.removeHandler('app:get-backend-port');
  ipcMain.removeHandler('app:list-log-files');
  ipcMain.removeHandler('app:read-log-file');
  ipcMain.removeHandler('app:detect-editors');
}
