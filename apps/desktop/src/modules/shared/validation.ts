import * as path from 'path';
import { MAX_PATH_LENGTH } from '@omniscribe/shared';

/**
 * Validate that a value is a non-empty absolute path string within length limits.
 * Returns an error message string if invalid, or null if valid.
 */
export function validatePath(value: unknown, label = 'projectPath'): string | null {
  if (!value || typeof value !== 'string') {
    return `Invalid ${label}: must be a non-empty string`;
  }
  if (value.length > MAX_PATH_LENGTH) {
    return `${label} exceeds maximum length of ${MAX_PATH_LENGTH} characters`;
  }
  if (!path.posix.isAbsolute(value) && !path.win32.isAbsolute(value)) {
    return `Invalid ${label}: must be an absolute path`;
  }
  return null;
}

/**
 * Validate that a sessionId is a positive finite integer.
 */
export function isValidSessionId(sessionId: unknown): sessionId is number {
  return (
    typeof sessionId === 'number' &&
    Number.isFinite(sessionId) &&
    Number.isInteger(sessionId) &&
    sessionId > 0
  );
}
