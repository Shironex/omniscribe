import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  LOG_FILE_PREFIX,
  createLogger,
  LoggerOptions,
  setTimestampsEnabled,
} from '@omniscribe/shared';

const isDev = process.env.NODE_ENV === 'development';

// Log file path in user data directory
const getLogPath = (): string => {
  const userDataPath = app.getPath('userData');
  const logsDir = path.join(userDataPath, 'logs');

  // Ensure logs directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  return path.join(logsDir, `${LOG_FILE_PREFIX}-${date}.log`);
};

// File transport for production logging
const fileTransport = (message: string): void => {
  if (isDev) return; // Don't write to file in development

  try {
    fs.appendFileSync(getLogPath(), message);
  } catch (error) {
    // Fallback to console if file writing fails
    console.error('Failed to write to log file:', error);
  }
};

// Enable timestamps for main process logs
setTimestampsEnabled(true);

// Logger options with file transport for production
const loggerOptions: LoggerOptions = {
  fileTransport,
};

// Create the main logger instance
export const logger = createLogger('Main', loggerOptions);

// Export getLogPath for external access (e.g., showing log location to users)
export { getLogPath };

export default logger;
