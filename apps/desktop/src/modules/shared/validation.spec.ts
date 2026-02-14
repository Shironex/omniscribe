import { MAX_PATH_LENGTH } from '@omniscribe/shared';
import { validatePath, isValidSessionId } from './validation';

describe('validatePath', () => {
  it('should return null for valid absolute paths', () => {
    expect(validatePath('/valid/absolute/path')).toBeNull();
    expect(validatePath('C:\\Users\\test')).toBeNull();
  });

  it('should reject empty string', () => {
    expect(validatePath('')).toBe('Invalid projectPath: must be a non-empty string');
  });

  it('should reject null and undefined', () => {
    expect(validatePath(null)).toBe('Invalid projectPath: must be a non-empty string');
    expect(validatePath(undefined)).toBe('Invalid projectPath: must be a non-empty string');
  });

  it('should reject non-string values', () => {
    expect(validatePath(123)).toBe('Invalid projectPath: must be a non-empty string');
    expect(validatePath(true)).toBe('Invalid projectPath: must be a non-empty string');
    expect(validatePath({})).toBe('Invalid projectPath: must be a non-empty string');
  });

  it('should reject paths exceeding MAX_PATH_LENGTH', () => {
    const longPath = '/' + 'a'.repeat(MAX_PATH_LENGTH);
    expect(validatePath(longPath)).toBe(
      `projectPath exceeds maximum length of ${MAX_PATH_LENGTH} characters`
    );
  });

  it('should accept paths at exactly MAX_PATH_LENGTH', () => {
    const exactPath = '/' + 'a'.repeat(MAX_PATH_LENGTH - 1);
    expect(validatePath(exactPath)).toBeNull();
  });

  it('should reject relative paths', () => {
    expect(validatePath('relative/path')).toBe('Invalid projectPath: must be an absolute path');
  });

  it('should reject path traversal attempts', () => {
    expect(validatePath('../../etc')).toBe('Invalid projectPath: must be an absolute path');
  });

  it('should use custom label in error messages', () => {
    expect(validatePath('', 'worktreePath')).toBe(
      'Invalid worktreePath: must be a non-empty string'
    );
    expect(validatePath('relative', 'worktreePath')).toBe(
      'Invalid worktreePath: must be an absolute path'
    );
    const longPath = '/' + 'a'.repeat(MAX_PATH_LENGTH);
    expect(validatePath(longPath, 'worktreePath')).toBe(
      `worktreePath exceeds maximum length of ${MAX_PATH_LENGTH} characters`
    );
  });
});

describe('isValidSessionId', () => {
  it('should accept positive integers', () => {
    expect(isValidSessionId(1)).toBe(true);
    expect(isValidSessionId(42)).toBe(true);
    expect(isValidSessionId(1000000)).toBe(true);
  });

  it('should reject zero', () => {
    expect(isValidSessionId(0)).toBe(false);
  });

  it('should reject negative numbers', () => {
    expect(isValidSessionId(-1)).toBe(false);
    expect(isValidSessionId(-100)).toBe(false);
  });

  it('should reject non-integer numbers', () => {
    expect(isValidSessionId(1.5)).toBe(false);
    expect(isValidSessionId(0.1)).toBe(false);
  });

  it('should reject NaN and Infinity', () => {
    expect(isValidSessionId(NaN)).toBe(false);
    expect(isValidSessionId(Infinity)).toBe(false);
    expect(isValidSessionId(-Infinity)).toBe(false);
  });

  it('should reject non-number values', () => {
    expect(isValidSessionId('1')).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
    expect(isValidSessionId(true)).toBe(false);
    expect(isValidSessionId({})).toBe(false);
  });
});
