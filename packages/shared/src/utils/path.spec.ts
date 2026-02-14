import { normalizePath } from './path';

describe('normalizePath', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\foo\\project')).toBe('C:/Users/foo/project');
  });

  it('leaves Unix forward-slash paths unchanged', () => {
    expect(normalizePath('/home/user/project')).toBe('/home/user/project');
  });

  it('converts mixed separators', () => {
    expect(normalizePath('C:\\Users/foo\\bar')).toBe('C:/Users/foo/bar');
  });

  it('returns empty string unchanged', () => {
    expect(normalizePath('')).toBe('');
  });

  it('converts UNC paths', () => {
    expect(normalizePath('\\\\server\\share')).toBe('//server/share');
  });

  it('converts a single backslash', () => {
    expect(normalizePath('\\')).toBe('/');
  });

  it('handles trailing backslash', () => {
    expect(normalizePath('C:\\Users\\')).toBe('C:/Users/');
  });

  it('leaves plain filenames unchanged', () => {
    expect(normalizePath('filename.txt')).toBe('filename.txt');
  });
});
