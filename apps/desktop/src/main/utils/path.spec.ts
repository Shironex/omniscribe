jest.mock('@omniscribe/shared', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}));

import { joinPaths, getHomeDir, isWindows, isMac, isLinux, normalizePath } from './path';

describe('path', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  // ================================================================
  // normalizePath (re-export)
  // ================================================================
  describe('normalizePath', () => {
    it('should be re-exported from shared', () => {
      expect(typeof normalizePath).toBe('function');
    });

    it('should replace backslashes with forward slashes', () => {
      expect(normalizePath('C:\\Users\\test')).toBe('C:/Users/test');
    });
  });

  // ================================================================
  // joinPaths
  // ================================================================
  describe('joinPaths', () => {
    it('should join and normalize paths', () => {
      const result = joinPaths('/home', 'user', 'docs');

      // path.join + normalizePath should produce forward slashes
      expect(result).not.toContain('\\');
      expect(result).toContain('home');
      expect(result).toContain('user');
      expect(result).toContain('docs');
    });

    it('should handle single path segment', () => {
      const result = joinPaths('/home');

      expect(result).not.toContain('\\');
    });
  });

  // ================================================================
  // getHomeDir
  // ================================================================
  describe('getHomeDir', () => {
    it('should return a normalized home directory path', () => {
      const result = getHomeDir();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain('\\');
    });
  });

  // ================================================================
  // Platform detection
  // ================================================================
  describe('isWindows', () => {
    it('should return true on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      expect(isWindows()).toBe(true);
    });

    it('should return false on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      expect(isWindows()).toBe(false);
    });

    it('should return false on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(isWindows()).toBe(false);
    });
  });

  describe('isMac', () => {
    it('should return true on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      expect(isMac()).toBe(true);
    });

    it('should return false on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      expect(isMac()).toBe(false);
    });

    it('should return false on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(isMac()).toBe(false);
    });
  });

  describe('isLinux', () => {
    it('should return true on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(isLinux()).toBe(true);
    });

    it('should return false on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      expect(isLinux()).toBe(false);
    });

    it('should return false on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      expect(isLinux()).toBe(false);
    });
  });
});
