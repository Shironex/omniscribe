import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '@omniscribe/shared';
import { getThumbnailsDir } from '../utils';

const fsp = fs.promises;
const logger = createLogger('ThumbnailIpc');

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function ensureThumbnailsDir(): Promise<void> {
  await fsp.mkdir(getThumbnailsDir(), { recursive: true });
}

function isValidFilename(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0'))
    return false;
  return /^[\w\-.]+$/.test(name);
}

export function registerThumbnailHandlers(): void {
  ipcMain.handle(
    'thumbnail:set',
    async (_event, tabId: string, imagePath: string): Promise<{ fileName: string } | null> => {
      if (typeof tabId !== 'string' || typeof imagePath !== 'string') {
        throw new Error('Invalid arguments');
      }

      // Validate the source file
      await fsp.access(imagePath, fs.constants.R_OK);

      const stat = await fsp.stat(imagePath);
      if (stat.size > MAX_FILE_SIZE) {
        throw new Error('Image file exceeds 10MB size limit');
      }

      const ext = path.extname(imagePath).toLowerCase().replace('.', '');
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error(`Unsupported image format: .${ext}`);
      }

      // Sanitize tabId for use in filename, include timestamp for cache busting
      const safeTabId = tabId.replace(/[^a-zA-Z0-9\-_]/g, '_');
      const fileName = `${safeTabId}-${Date.now()}.${ext}`;

      await ensureThumbnailsDir();
      const destPath = path.join(getThumbnailsDir(), fileName);

      // Remove any existing thumbnail for this tab (different extension)
      try {
        const existing = await fsp.readdir(getThumbnailsDir());
        for (const file of existing) {
          if (file.startsWith(`${safeTabId}-`)) {
            await fsp.unlink(path.join(getThumbnailsDir(), file));
          }
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('Failed to clean up old thumbnail:', err);
        }
      }

      // Copy the image
      await fsp.copyFile(imagePath, destPath);
      logger.info(`Thumbnail set for tab ${tabId}: ${fileName}`);

      return { fileName };
    }
  );

  ipcMain.handle(
    'thumbnail:remove',
    async (_event, tabId: string, fileName: string): Promise<void> => {
      if (typeof tabId !== 'string' || typeof fileName !== 'string') {
        throw new Error('Invalid arguments');
      }

      // Enforce tab-to-filename binding (filename format: {safeTabId}-{timestamp}.{ext})
      const safeTabId = tabId.replace(/[^a-zA-Z0-9\-_]/g, '_');
      if (!safeTabId || !fileName.startsWith(`${safeTabId}-`)) {
        throw new Error('Filename does not match tab');
      }

      if (!isValidFilename(fileName)) {
        throw new Error('Invalid filename');
      }

      const filePath = path.join(getThumbnailsDir(), fileName);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(getThumbnailsDir()))) {
        throw new Error('Forbidden');
      }

      try {
        await fsp.unlink(resolved);
        logger.info(`Thumbnail removed for tab ${tabId}: ${fileName}`);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('Failed to remove thumbnail:', err);
        }
      }
    }
  );
}

export function cleanupThumbnailHandlers(): void {
  ipcMain.removeHandler('thumbnail:set');
  ipcMain.removeHandler('thumbnail:remove');
}

/**
 * Delete thumbnail file for a tab. Called when a tab is removed.
 */
export async function deleteThumbnailFile(thumbnailFileName?: string): Promise<void> {
  if (!thumbnailFileName) return;
  if (!isValidFilename(thumbnailFileName)) return;

  const filePath = path.join(getThumbnailsDir(), thumbnailFileName);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(getThumbnailsDir()))) {
    logger.warn('Blocked path traversal attempt in deleteThumbnailFile');
    return;
  }

  try {
    await fsp.unlink(resolved);
    logger.debug(`Cleaned up thumbnail file: ${thumbnailFileName}`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to delete thumbnail file:', err);
    }
  }
}
