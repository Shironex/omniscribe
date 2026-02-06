import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  LOG_FILE_PREFIX,
  LOG_MAX_FILE_SIZE,
  LOG_MAX_AGE_MS,
  LOG_FLUSH_INTERVAL_MS,
  LOG_BUFFER_MAX_ENTRIES,
  LOG_CLEANUP_INTERVAL_MS,
  createLogger,
  LoggerOptions,
  setTimestampsEnabled,
} from '@omniscribe/shared';

// ============================================================================
// State
// ============================================================================

let logsDir: string | null = null;
const buffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let isRotating = false;
let loggingFailed = false;
let loggingErrorNotified = false;

/** Optional callback invoked on the first logging error */
export let onLoggingError: ((error: unknown) => void) | null = null;

/**
 * Set the callback for logging errors (one-time notification)
 */
export function setOnLoggingError(callback: (error: unknown) => void): void {
  onLoggingError = callback;
}

// ============================================================================
// Path helpers
// ============================================================================

/**
 * Get the logs directory path (userData/logs).
 * Creates the directory if it does not exist.
 */
export function getLogsDir(): string {
  if (!logsDir) {
    const userDataPath = app.getPath('userData');
    logsDir = path.join(userDataPath, 'logs');
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

/**
 * Get the current log file path (date-based).
 * Exported for backward compatibility with index.ts.
 */
export function getLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(getLogsDir(), `${LOG_FILE_PREFIX}-${date}.log`);
}

// ============================================================================
// Rotation
// ============================================================================

/**
 * Find the next available rotation number for a given base file.
 */
async function getNextRotationNumber(dir: string, baseName: string): Promise<number> {
  const files = await fs.promises.readdir(dir);
  let max = 0;
  // Pattern: omniscribe-YYYY-MM-DD.N.log
  const pattern = new RegExp(`^${escapeRegex(baseName)}\\.(\\d+)\\.log$`);
  for (const file of files) {
    const match = file.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rotate the current log file if it exceeds LOG_MAX_FILE_SIZE.
 * Returns the path to write to (may be the same file or a new one after rotation).
 */
async function rotateIfNeeded(currentPath: string): Promise<void> {
  if (isRotating) return;

  try {
    const stat = await fs.promises.stat(currentPath);
    if (stat.size < LOG_MAX_FILE_SIZE) return;

    isRotating = true;

    const dir = path.dirname(currentPath);
    const ext = path.extname(currentPath); // .log
    const base = path.basename(currentPath, ext); // omniscribe-YYYY-MM-DD
    const n = await getNextRotationNumber(dir, base);
    const rotatedPath = path.join(dir, `${base}.${n}${ext}`);

    await fs.promises.rename(currentPath, rotatedPath);
  } catch (error) {
    // File may not exist yet (first write), that's fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      handleLoggingError(error);
    }
  } finally {
    isRotating = false;
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Remove log files older than LOG_MAX_AGE_MS.
 */
async function cleanupOldLogs(): Promise<void> {
  try {
    const dir = getLogsDir();
    const files = await fs.promises.readdir(dir);
    const now = Date.now();

    for (const file of files) {
      // Only clean up our log files
      if (!file.startsWith(LOG_FILE_PREFIX) || !file.endsWith('.log')) continue;

      const filePath = path.join(dir, file);
      try {
        const stat = await fs.promises.stat(filePath);
        if (now - stat.mtimeMs > LOG_MAX_AGE_MS) {
          await fs.promises.unlink(filePath);
        }
      } catch {
        // Ignore individual file errors during cleanup
      }
    }
  } catch {
    // Ignore cleanup errors -- non-critical
  }
}

// ============================================================================
// Flush
// ============================================================================

/**
 * Flush buffered log entries to disk.
 */
async function doFlush(): Promise<void> {
  if (buffer.length === 0 || loggingFailed) return;

  const entries = buffer.splice(0);
  const logPath = getLogPath();

  try {
    await rotateIfNeeded(logPath);
    await fs.promises.appendFile(logPath, entries.join(''));
  } catch (error) {
    handleLoggingError(error);
  }
}

/**
 * Force an immediate flush of all buffered logs. Returns a promise
 * that resolves when the flush is complete. Useful for before-quit.
 */
export async function flushLogs(): Promise<void> {
  await doFlush();
}

// ============================================================================
// Error handling
// ============================================================================

function handleLoggingError(error: unknown): void {
  if (!loggingErrorNotified) {
    loggingErrorNotified = true;
    if (onLoggingError) {
      try {
        onLoggingError(error);
      } catch {
        // Callback itself failed, ignore
      }
    }
    // Also log to console once
    console.error('[Logger] File logging failed:', error);
  }
  loggingFailed = true;
}

// ============================================================================
// File transport
// ============================================================================

/**
 * File transport function passed to createLogger.
 * Buffers messages and flushes periodically or when buffer is full.
 */
export const fileTransport = (message: string): void => {
  if (loggingFailed) return;

  buffer.push(message);

  // Force flush if buffer exceeds max entries
  if (buffer.length >= LOG_BUFFER_MAX_ENTRIES) {
    doFlush().catch(() => {
      // Error already handled in doFlush
    });
  }
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the file logging system.
 * Called automatically on module load -- sets up flush timer and cleanup.
 */
function initialize(): void {
  // Ensure logs directory exists
  try {
    getLogsDir();
  } catch (error) {
    handleLoggingError(error);
    return;
  }

  // Start periodic flush timer
  flushTimer = setInterval(() => {
    doFlush().catch(() => {
      // Error already handled in doFlush
    });
  }, LOG_FLUSH_INTERVAL_MS);

  // Run initial cleanup
  cleanupOldLogs();

  // Schedule periodic cleanup
  cleanupTimer = setInterval(() => {
    cleanupOldLogs();
  }, LOG_CLEANUP_INTERVAL_MS);

  // Unref timers so they don't prevent process exit
  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// Initialize on module load
initialize();

// ============================================================================
// Logger instance
// ============================================================================

// Enable timestamps for main process logs
setTimestampsEnabled(true);

const loggerOptions: LoggerOptions = {
  fileTransport,
};

/** Main process logger */
export const logger = createLogger('Main', loggerOptions);

export default logger;
