import { joinPaths, getHomeDir, isWindows } from './platform';

describe('joinPaths', () => {
  it('joins segments and normalizes to forward slashes', () => {
    const result = joinPaths('a', 'b', 'c');
    expect(result).toBe('a/b/c');
  });

  it('normalizes Windows-style separators', () => {
    const result = joinPaths('C:\\Users', 'test');
    expect(result).not.toContain('\\');
  });
});

describe('getHomeDir', () => {
  it('returns a non-empty string', () => {
    const home = getHomeDir();
    expect(typeof home).toBe('string');
    expect(home.length).toBeGreaterThan(0);
  });

  it('uses forward slashes', () => {
    const home = getHomeDir();
    expect(home).not.toContain('\\');
  });
});

describe('isWindows', () => {
  it('returns a boolean', () => {
    expect(typeof isWindows()).toBe('boolean');
  });
});
