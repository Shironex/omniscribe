import { describe, it, expect } from 'vitest';
import { truncatePath } from '../path-utils';

describe('truncatePath', () => {
  it('returns short paths as-is', () => {
    expect(truncatePath('/home/user')).toBe('/home/user');
  });

  it('returns paths equal to maxLength as-is', () => {
    const path = '/a'.repeat(25); // 50 chars exactly
    expect(truncatePath(path, 50)).toBe(path);
  });

  it('truncates long paths preserving the last two segments', () => {
    const longPath = '/home/user/very/deep/nested/project/directory/src';
    const result = truncatePath(longPath, 30);
    expect(result).toBe('.../directory/src');
  });

  it('normalizes Windows backslash paths to forward slashes', () => {
    const windowsPath = 'C:\\Users\\dev\\project\\src';
    const result = truncatePath(windowsPath, 10);
    expect(result).toBe('.../project/src');
    expect(result).not.toContain('\\');
  });

  it('returns short Windows paths with normalized slashes', () => {
    expect(truncatePath('C:\\short')).toBe('C:/short');
  });

  it('handles custom maxLength', () => {
    const path = '/home/user/projects/myapp';
    // With a very large maxLength, should not truncate
    expect(truncatePath(path, 200)).toBe(path);
    // With a very small maxLength, should truncate
    expect(truncatePath(path, 5)).toBe('.../projects/myapp');
  });

  it('does not truncate if path has 2 or fewer segments after split', () => {
    // 'home' splits to ['home'] -- 1 segment, returned as-is
    expect(truncatePath('home', 1)).toBe('home');
    // 'home/user' splits to ['home', 'user'] -- 2 segments, returned as-is
    expect(truncatePath('home/user', 1)).toBe('home/user');
  });

  it('uses default maxLength of 50', () => {
    const under50 = '/home/user/short';
    expect(truncatePath(under50)).toBe(under50);

    const over50 = '/Users/developer/Documents/Projects/omniscribe/apps/web/src/components';
    const result = truncatePath(over50);
    expect(result).toBe('.../src/components');
  });
});
