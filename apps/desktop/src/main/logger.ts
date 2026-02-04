import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { LOG_FILE_PREFIX } from '@omniscribe/shared';

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

const formatMessage = (level: string, message: string, ...args: unknown[]): string => {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
  return `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;
};

const writeToFile = (message: string): void => {
  if (isDev) return; // Don't write to file in development

  try {
    fs.appendFileSync(getLogPath(), message);
  } catch (error) {
    // Fallback to console if file writing fails
    console.error('Failed to write to log file:', error);
  }
};

export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage('INFO', message, ...args);
    console.log(message, ...args);
    writeToFile(formatted);
  },

  warn: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage('WARN', message, ...args);
    console.warn(message, ...args);
    writeToFile(formatted);
  },

  error: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage('ERROR', message, ...args);
    console.error(message, ...args);
    writeToFile(formatted);
  },

  debug: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage('DEBUG', message, ...args);
    if (isDev) {
      console.debug(message, ...args);
    }
    writeToFile(formatted);
  },

  getLogPath,
};

export default logger;
